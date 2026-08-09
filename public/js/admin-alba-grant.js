(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var form = document.getElementById('adminGrantAlbaForm');
    var msg = document.getElementById('albaGrantMsg');
    var btn = document.getElementById('albaSubmitBtn');
    if (!form || !msg || !btn) return;

    function getCsrf() {
      var meta = document.querySelector('meta[name="csrf-token"]');
      var field = document.getElementById('albaCsrfField');
      return (meta && meta.getAttribute('content'))
        || (field && field.value)
        || (window.CSRF_TOKEN || '')
        || '';
    }

    function setMsg(text, color) {
      msg.textContent = text;
      msg.style.color = color || '#fff';
      msg.style.background = color === '#4caf50'
        ? 'rgba(76,175,80,0.15)'
        : (color === '#b00020' ? 'rgba(176,0,32,0.15)' : 'rgba(255,255,255,0.06)');
      msg.style.border = '1px solid rgba(255,255,255,0.12)';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var username = String((document.getElementById('albaUsername') || {}).value || '').trim();
      var amountRaw = (document.getElementById('albaAmount') || {}).value || '';
      var comment = String((document.getElementById('albaComment') || {}).value || '').trim();
      var amount = Number(amountRaw);
      var csrf = getCsrf();

      if (!username || !amountRaw || !comment) {
        setMsg('Заполните все поля', '#b00020');
        return;
      }
      if (!isFinite(amount) || amount <= 0) {
        setMsg('Сумма должна быть положительным числом', '#b00020');
        return;
      }
      if (!csrf) {
        setMsg('Нет CSRF-токена. Обновите страницу.', '#b00020');
        return;
      }

      btn.disabled = true;
      setMsg('Начисление...', '#ccc');

      fetch('/api/p1/alba/grant-by-login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrf
        },
        body: JSON.stringify({
          login: username,
          username: username,
          amount: amount,
          reason: 'admin_grant',
          comment: comment,
          _csrf: csrf
        })
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (err) {
            throw new Error(res.status === 403
              ? 'CSRF/доступ запрещён. Обновите страницу.'
              : ('Ответ сервера: ' + res.status));
          }
          return { res: res, data: data };
        });
      }).then(function (result) {
        if (result.res.ok && result.data && result.data.success) {
          var bal = result.data.user && result.data.user.albaBalance != null
            ? (' (баланс: ' + result.data.user.albaBalance + ')')
            : '';
          setMsg('Начислено ' + amount + ' ALBA пользователю ' + username + bal, '#4caf50');
          form.reset();
          var csrfField = document.getElementById('albaCsrfField');
          if (csrfField && csrf) csrfField.value = csrf;
          var reasonField = form.querySelector('input[name="reason"]');
          if (reasonField) reasonField.value = 'admin_grant';
        } else {
          setMsg('Ошибка: ' + ((result.data && result.data.message) || ('HTTP ' + result.res.status)), '#b00020');
        }
      }).catch(function (err) {
        setMsg('Ошибка: ' + (err && err.message ? err.message : String(err)), '#b00020');
      }).then(function () {
        btn.disabled = false;
      });
    });
  });
})();
