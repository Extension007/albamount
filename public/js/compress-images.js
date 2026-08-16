(function (global) {
  'use strict';

  var MAX_SIDE = 1600;
  var TARGET_EACH = 620 * 1024;
  var TARGET_TOTAL = 3.2 * 1024 * 1024;
  var MAX_ORIGINAL = 20 * 1024 * 1024;

  function blobToFile(blob, name, type) {
    var base = String(name || 'image').replace(/\.[^.]+$/, '') || 'image';
    var ext = type === 'image/webp' ? '.webp' : '.jpg';
    return new File([blob], base + ext, { type: type, lastModified: Date.now() });
  }

  function preferredType() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0
        ? 'image/webp'
        : 'image/jpeg';
    } catch (e) {
      return 'image/jpeg';
    }
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать изображение'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (!canvas.toBlob) {
        try {
          var dataUrl = canvas.toDataURL(type, quality);
          var bin = atob(dataUrl.split(',')[1] || '');
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: type }));
        } catch (e) {
          resolve(null);
        }
        return;
      }
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
    });
  }

  function compressOne(file, type, targetBytes, maxSide) {
    if (!file || String(file.type || '').indexOf('image/') !== 0) {
      return Promise.resolve(file);
    }
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return Promise.resolve(file);
    }

    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) return file;

      var scale = Math.min(1, maxSide / Math.max(w, h));
      var qualities = [0.82, 0.72, 0.62, 0.52, 0.42];
      var best = file;
      var side = scale;

      function nextSize(step) {
        if (step >= 5) return Promise.resolve(best.size < file.size ? best : file);
        var cw = Math.max(1, Math.round(w * side));
        var ch = Math.max(1, Math.round(h * side));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        if (!ctx) return Promise.resolve(file);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);

        function nextQuality(qi) {
          if (qi >= qualities.length) {
            side *= 0.72;
            return nextSize(step + 1);
          }
          return canvasToBlob(canvas, type, qualities[qi]).then(function (blob) {
            if (blob && blob.size && (best === file || blob.size < best.size)) {
              best = blobToFile(blob, file.name, type);
            }
            if (blob && blob.size <= targetBytes) {
              return best;
            }
            return nextQuality(qi + 1);
          });
        }

        return nextQuality(0);
      }

      return nextSize(0);
    }).catch(function () {
      return file;
    });
  }

  function compressFiles(fileList, options) {
    options = options || {};
    var files = Array.prototype.slice.call(fileList || []);
    var type = preferredType();
    var each = options.maxBytesEach || TARGET_EACH;
    var totalMax = options.maxBytesTotal || TARGET_TOTAL;
    var maxSide = options.maxSide || MAX_SIDE;
    var out = [];
    var total = 0;
    var i = 0;

    function next() {
      if (i >= files.length) return Promise.resolve(out);
      var remainingSlots = files.length - i;
      var remainingBudget = Math.max(160 * 1024, totalMax - total);
      var target = Math.min(each, remainingBudget / remainingSlots);
      return compressOne(files[i], type, target, maxSide).then(function (compressed) {
        out.push(compressed);
        total += compressed.size || 0;
        i += 1;
        return next();
      });
    }

    return next();
  }

  function copyFormWithoutFiles(form, fieldName) {
    var fd = new FormData();
    var source = new FormData(form);
    source.forEach(function (value, key) {
      if (key === fieldName && value && typeof value === 'object' && typeof value.size === 'number') {
        return;
      }
      fd.append(key, value);
    });
    return fd;
  }

  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    var field = document.querySelector('input[name="_csrf"]');
    return (meta && meta.getAttribute('content'))
      || (field && field.value)
      || '';
  }

  function requestCloudinarySign() {
    var csrf = getCsrfToken();
    return fetch('/api/uploads/cloudinary-sign', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({ _csrf: csrf })
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
        if (!res.ok || !data.success || !data.signature) return null;
        return data;
      });
    }).catch(function () { return null; });
  }

  function uploadOneToCloudinary(file, sign) {
    var fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', sign.apiKey);
    fd.append('timestamp', String(sign.timestamp));
    fd.append('signature', sign.signature);
    fd.append('folder', sign.folder);
    return fetch('https://api.cloudinary.com/v1_1/' + encodeURIComponent(sign.cloudName) + '/image/upload', {
      method: 'POST',
      body: fd
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!data || !data.secure_url) {
          throw new Error((data && data.error && data.error.message) || 'Ошибка загрузки в Cloudinary');
        }
        return data.secure_url;
      });
    });
  }

  function prepareProductFormData(form, fieldName, options) {
    fieldName = fieldName || 'images';
    var input = form.querySelector('input[type="file"][name="' + fieldName + '"]')
      || form.querySelector('input[type="file"]');
    var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
    var compressOpts = options || { maxBytesEach: 1500 * 1024, maxBytesTotal: 8 * 1024 * 1024, maxSide: 1920 };

    return Promise.resolve(files.length ? compressFiles(files, compressOpts) : []).then(function (compressed) {
      var fd = copyFormWithoutFiles(form, fieldName);
      if (!compressed.length) return fd;
      return requestCloudinarySign().then(function (sign) {
        if (!sign) {
          compressed.forEach(function (file) {
            fd.append(fieldName, file, file.name);
          });
          return fd;
        }
        var chain = Promise.resolve([]);
        compressed.forEach(function (file) {
          chain = chain.then(function (urls) {
            return uploadOneToCloudinary(file, sign).then(function (url) {
              urls.push(url);
              return urls;
            });
          });
        });
        return chain.then(function (urls) {
          fd.append('image_urls', JSON.stringify(urls));
          return fd;
        });
      });
    });
  }

  function replaceFormDataImages(form, fieldName, options) {
    return prepareProductFormData(form, fieldName, options);
  }

  global.ImageUploadCompress = {
    MAX_ORIGINAL: MAX_ORIGINAL,
    compressFiles: compressFiles,
    replaceFormDataImages: replaceFormDataImages,
    prepareProductFormData: prepareProductFormData
  };
})(window);
