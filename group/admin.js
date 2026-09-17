/*
 * admin.js — פס הפרסום שמעל האפליקציה הרגילה.
 *
 * מסך האדמין הוא האפליקציה המלאה: אותו ייבוא, אותו חיפוש, אותן ראיות
 * ואותם תיקונים ידניים. כל זה נשאר במכשיר שלו כמו תמיד. מה שנוסף כאן
 * הוא כפתור אחד שמפרסם את הרשימה המזוקקת לקבוצה.
 */
(function () {
  'use strict';

  var U = window.PFUtil;
  var Store = window.PFStore;
  var bar = document.getElementById('publish-bar');
  var state = { info: null, busy: false, message: null };

  function esc(t) { return U.escapeHtml(t); }

  function token() {
    var m = /^\/a\/([A-Za-z0-9_-]{43})/.exec(window.location.pathname);
    return m ? m[1] : null;
  }

  var TOKEN = token();

  /** רק מה שהקבוצה תראה. הראיות והממליצים לא נכללים כאן ולא נשלחים. */
  function directory() {
    return Store.people().map(function (p) {
      return {
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        secondaryCategories: p.secondaryCategories || [],
        phones: p.phones || [],
        sharedCount: p.sharedCount || 1,
        confidence: p.confidence || 0,
        notes: p.notes || ''
      };
    });
  }

  function render() {
    if (!TOKEN) {
      bar.innerHTML = '<div class="notice">הכתובת לא נראית כמו קישור ניהול תקין.</div>';
      return;
    }
    if (!state.info) {
      bar.innerHTML = '<p class="muted tiny">טוען את פרטי הקבוצה…</p>';
      return;
    }

    var count = directory().length;
    var published = state.info.updatedAt;

    bar.innerHTML = '<div class="stack">' +
      (state.message ? '<div class="notice">' + esc(state.message) + '</div>' : '') +
      '<div class="muted tiny"><strong>' + esc(state.info.groupName) + '</strong>' +
      (published
        ? ' · פורסמו ' + state.info.peopleCount + ' בעלי מקצוע'
        : ' · עוד לא פורסם') + '</div>' +
      (count
        ? '<button class="btn btn-block" data-pub="publish">' +
          (published ? 'עדכון הרשימה לקבוצה' : 'פרסום לקבוצה') +
          ' (' + count + ' בעלי מקצוע)</button>'
        : '<p class="muted tiny">מעלים קובץ ייצוא כדי לפרסם לקבוצה.</p>') +
      (published
        ? '<textarea readonly rows="2" id="viewUrl">' + esc(state.info.viewUrl) + '</textarea>' +
          '<div class="btn-row">' +
          '<button class="btn btn-ghost" data-pub="copy">העתקת קישור לקבוצה</button>' +
          '<button class="btn btn-danger" data-pub="delete">מחיקה</button>' +
          '</div>'
        : '') +
      '</div>';
  }

  function load() {
    fetch('/api/admin?t=' + encodeURIComponent(TOKEN))
      .then(function (r) {
        if (!r.ok) throw new Error('קישור הניהול לא פעיל, או שהקבוצה נמחקה.');
        return r.json();
      })
      .then(function (info) { state.info = info; render(); })
      .catch(function (err) {
        bar.innerHTML = '<div class="notice">' + esc(err.message) + '</div>';
      });
  }

  function publish() {
    var people = directory();
    if (!people.length) return;
    state.busy = true;
    state.message = null;
    render();

    fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminToken: TOKEN,
        groupName: state.info.groupName,
        people: people
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('הפרסום נכשל.');
      return r.json();
    }).then(function (data) {
      state.info.updatedAt = data.updatedAt;
      state.info.peopleCount = data.published;
      state.info.viewUrl = data.viewUrl;
      state.message = 'פורסם. אפשר לשלוח את קישור החיפוש לקבוצה.';
      state.busy = false;
      render();
    }).catch(function (err) {
      state.busy = false;
      state.message = err.message;
      render();
    });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-pub]');
    if (!el) return;
    var action = el.getAttribute('data-pub');

    if (action === 'publish') {
      publish();
    } else if (action === 'copy') {
      var box = document.getElementById('viewUrl');
      box.select();
      try { document.execCommand('copy'); } catch (err) { /* הדפדפן חוסם */ }
      el.textContent = 'הועתק ✓';
    } else if (action === 'delete') {
      if (!window.confirm('למחוק את המדריך מהשרת? קישור החיפוש שכבר נשלח יפסיק לעבוד.')) return;
      fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminToken: TOKEN })
      }).then(function () {
        state.info.updatedAt = null;
        state.info.peopleCount = 0;
        state.message = 'נמחק מהשרת. מה שיש במכשיר שלך נשאר.';
        render();
      });
    }
  });

  render();
  load();
})();
