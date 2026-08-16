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
          if (typeof window.loadAlbaHistory === 'function') window.loadAlbaHistory();
        } else {
          setMsg('Ошибка: ' + ((result.data && result.data.message) || ('HTTP ' + result.res.status)), '#b00020');
        }
      }).catch(function (err) {
        setMsg('Ошибка: ' + (err && err.message ? err.message : String(err)), '#b00020');
      }).then(function () {
        btn.disabled = false;
      });
    });

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatDate(value) {
      if (!value) return '—';
      try { return new Date(value).toLocaleString('ru-RU'); } catch (e) { return String(value); }
    }

    window.loadAlbaHistory = function loadAlbaHistory() {
      var container = document.getElementById('albaTransactionsContainer');
      var btn = document.getElementById('loadTransactionsBtn');
      if (!container) return;
      if (btn) btn.disabled = true;
      fetch('/api/p1/alba/transactions-history?limit=80', {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          return { res: res, data: data };
        });
      }).then(function (result) {
        if (!result.res.ok || !result.data || !result.data.success) {
          container.innerHTML = '<p class="empty-state">Не удалось загрузить историю' +
            (result.data && result.data.message ? (': ' + escapeHtml(result.data.message)) : '') + '</p>';
          return;
        }
        var rows = result.data.transactions || [];
        if (!rows.length) {
          container.innerHTML = '<p class="empty-state">Пока нет транзакций ALBA</p>';
          return;
        }
        var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.9rem;"><thead><tr style="text-align:left;border-bottom:1px solid rgba(31,138,90,0.25);">' +
          '<th style="padding:8px;">ID</th><th style="padding:8px;">Пользователь</th><th style="padding:8px;">Тип</th>' +
          '<th style="padding:8px;">Причина</th><th style="padding:8px;">Сумма</th><th style="padding:8px;">Комментарий</th>' +
          '<th style="padding:8px;">Дата</th></tr></thead><tbody>';
        rows.forEach(function (tx) {
          var user = tx.user || {};
          var meta = tx.meta && typeof tx.meta === 'object' ? tx.meta : {};
          html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.08);">' +
            '<td style="padding:8px;">' + escapeHtml(tx.id) + '</td>' +
            '<td style="padding:8px;">' + escapeHtml(user.username || '—') + '</td>' +
            '<td style="padding:8px;">' + escapeHtml(tx.type || '') + '</td>' +
            '<td style="padding:8px;">' + escapeHtml(tx.reason || '') + '</td>' +
            '<td style="padding:8px;">' + escapeHtml(tx.amount) + '</td>' +
            '<td style="padding:8px;">' + escapeHtml(meta.comment || tx.comment || '—') + '</td>' +
            '<td style="padding:8px;">' + escapeHtml(formatDate(tx.createdAt)) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
      }).catch(function () {
        container.innerHTML = '<p class="empty-state">Ошибка сети при загрузке истории</p>';
      }).then(function () {
        if (btn) btn.disabled = false;
      });
    };

    var loadBtn = document.getElementById('loadTransactionsBtn');
    if (loadBtn) {
      loadBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.loadAlbaHistory();
      });
    }
  });
})();
