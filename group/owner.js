/*
 * owner.js — המסך הפרטי לפתיחת קבוצה חדשה.
 *
 * המפתח לא נשמר בקוד ולא נשלח לשום מקום חוץ מנקודת הקצה שבודקת אותו.
 * הוא נזכר במכשיר הזה בלבד, כדי לא להקליד אותו בכל פעם.
 */
(function () {
  'use strict';

  var U = window.PFUtil;
  var KEY = 'mikzoanim.ownerkey';

  function esc(t) { return U.escapeHtml(t); }

  function remembered() {
    try { return window.localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }

  function remember(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) { /* גלישה פרטית */ }
  }

  function render(result, error) {
    document.getElementById('app').innerHTML =
      '<div class="topbar"><div class="topbar-row"><h1>ניהול קבוצות</h1></div></div>' +
      '<main class="screen stack">' +
      (error ? '<div class="notice">' + esc(error) + '</div>' : '') +
      '<div class="card stack">' +
      '<h2>פתיחת קבוצה חדשה</h2>' +
      '<p class="muted tiny">כל קבוצה מקבלת שני קישורים: אחד לאדמין שמעלה את הקובץ, ' +
      'ואחד לחברי הקבוצה לחיפוש בלבד.</p>' +
      '<label class="muted tiny" for="key">מפתח בעלים</label>' +
      '<input type="password" id="key" value="' + esc(remembered()) + '" autocomplete="off">' +
      '<label class="muted tiny" for="name">שם הקבוצה</label>' +
      '<input type="text" id="name" placeholder="למשל: אמהות שכונת הדר">' +
      '<button class="btn btn-block" id="go">יצירת קישורים</button>' +
      '</div>' +
      (result
        ? '<div class="card stack">' +
          '<h3>' + esc(result.groupName) + '</h3>' +
          '<p class="muted tiny"><strong>קישור לאדמין</strong> — לשלוח אישית למי שינהל את הקבוצה. ' +
          'רק דרכו אפשר להעלות קובץ.</p>' +
          '<textarea readonly rows="3" id="adminUrl">' + esc(result.adminUrl) + '</textarea>' +
          '<button class="btn btn-ghost btn-block" data-copy="adminUrl">העתקת קישור האדמין</button>' +
          '<p class="muted tiny" style="margin-top:12px"><strong>קישור לחיפוש</strong> — יעבוד רק ' +
          'אחרי שהאדמין יעלה קובץ. האדמין יקבל אותו גם במסך שלו.</p>' +
          '<textarea readonly rows="3" id="viewUrl">' + esc(result.viewUrl) + '</textarea>' +
          '<button class="btn btn-ghost btn-block" data-copy="viewUrl">העתקת קישור החיפוש</button>' +
          '<div class="privacy" style="margin-top:12px">שמרי את הקישורים. הם לא מוצגים שוב ' +
          'ואין דרך לשחזר אותם — אם אבדו, פותחים קבוצה מחדש.</div>' +
          '</div>'
        : '') +
      '</main>';
  }

  document.addEventListener('click', function (e) {
    var copy = e.target.closest('[data-copy]');
    if (copy) {
      var el = document.getElementById(copy.getAttribute('data-copy'));
      el.select();
      try { document.execCommand('copy'); } catch (err) { /* הדפדפן חוסם */ }
      copy.textContent = 'הועתק ✓';
      return;
    }
    if (e.target.id !== 'go') return;

    var key = document.getElementById('key').value.trim();
    var name = document.getElementById('name').value.trim();
    if (!key || !name) { render(null, 'צריך מפתח ושם קבוצה.'); return; }

    e.target.disabled = true;
    e.target.textContent = 'יוצר…';
    fetch('/api/create-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerKey: key, groupName: name })
    }).then(function (r) {
      if (r.status === 404) throw new Error('המפתח שגוי.');
      if (!r.ok) throw new Error('היצירה נכשלה.');
      return r.json();
    }).then(function (data) {
      remember(key);
      render(data, null);
    }).catch(function (err) { render(null, err.message); });
  });

  render(null, null);
})();
