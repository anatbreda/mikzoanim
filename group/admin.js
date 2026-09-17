/*
 * admin.js — פס הפרסום וחלון ההפצה, מעל האפליקציה הרגילה.
 *
 * מסך האדמין הוא האפליקציה המלאה: אותו ייבוא, אותו חיפוש, אותן ראיות
 * ואותם תיקונים ידניים, והכל נשאר במכשיר שלו. מה שנוסף כאן הוא הפרסום
 * לקבוצה והפצת הקישור.
 */
(function () {
  'use strict';

  var U = window.PFUtil;
  var Store = window.PFStore;
  var bar = document.getElementById('publish-bar');
  var dialog = document.getElementById('share-dialog');
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

  /* --------------------------- חלון ההפצה --------------------------- */

  function shareText(url) {
    return 'היי! הכנתי מדריך של בעלי המקצוע שהומלצו אצלנו בקבוצה. ' +
      'אפשר לחפש בו לפי תחום או לפי שם:\n' + url;
  }

  function openShare(justPublished) {
    if (!state.info || !state.info.viewUrl) return;
    var url = state.info.viewUrl;

    dialog.innerHTML = '<div class="sheet">' +
      '<h2 id="share-title">' +
      (justPublished ? 'פורסם לקבוצה 🎉' : 'הקישור לקבוצה') + '</h2>' +
      '<p class="muted tiny">' +
      (justPublished
        ? state.info.peopleCount + ' בעלי מקצוע זמינים עכשיו לחיפוש. ' +
          'זה הקישור לשלוח לחברי הקבוצה — הם יוכלו רק לחפש, לא להעלות.'
        : 'לשלוח לחברי הקבוצה. הם יוכלו רק לחפש, לא להעלות.') +
      '</p>' +
      '<a class="btn btn-whatsapp btn-block" target="_blank" rel="noopener" ' +
      'href="https://wa.me/?text=' + encodeURIComponent(shareText(url)) + '">' +
      'שליחה בוואטסאפ</a>' +
      '<button class="btn btn-ghost btn-block" data-pub="copy">העתקת הקישור</button>' +
      '<div class="link-box" id="viewUrl">' + esc(url) + '</div>' +
      '<button class="btn btn-ghost btn-block" data-pub="close-share">סגירה</button>' +
      '</div>';

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function copyLink(button) {
    var url = state.info && state.info.viewUrl;
    if (!url) return;
    var done = function () { button.textContent = 'הועתק ✓'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { selectFallback(done); });
    } else {
      selectFallback(done);
    }
  }

  /** דפדפנים שחוסמים clipboard: לפחות לסמן את הטקסט כדי שאפשר יהיה להעתיק ביד. */
  function selectFallback(done) {
    var box = document.getElementById('viewUrl');
    if (!box) return;
    var range = document.createRange();
    range.selectNodeContents(box);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      if (document.execCommand('copy')) done();
    } catch (e) { /* נשאר מסומן להעתקה ידנית */ }
  }

  /* --------------------------- הפס --------------------------- */

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
    var published = !!state.info.updatedAt;

    var status = esc(state.info.groupName) + ' · ' +
      (published ? 'פורסמו ' + state.info.peopleCount + ' בעלי מקצוע' : 'עוד לא פורסם');

    var actions;
    if (!count) {
      actions = '<p class="muted tiny" style="margin:0">מעלים קובץ ייצוא כדי לפרסם לקבוצה.</p>';
    } else if (published) {
      // אחרי פרסום, ההפצה היא הפעולה הראשית ולא העדכון.
      actions = '<div class="bar-actions">' +
        '<button class="btn" data-pub="share">שליחת הקישור לקבוצה</button>' +
        '<button class="btn btn-ghost" data-pub="publish">עדכון (' + count + ')</button>' +
        '</div>';
    } else {
      actions = '<div class="bar-actions">' +
        '<button class="btn" data-pub="publish">פרסום לקבוצה (' + count + ' בעלי מקצוע)</button>' +
        '</div>';
    }

    bar.innerHTML =
      (state.message ? '<div class="notice" style="margin-bottom:8px">' + esc(state.message) + '</div>' : '') +
      '<div class="bar-status">' + status + '</div>' +
      actions +
      (published
        ? '<details id="danger-zone"><summary>פעולות נוספות</summary>' +
          '<div class="stack" style="margin-top:8px">' +
          '<p class="muted tiny">מחיקה מסירה את המדריך מהשרת. קישור החיפוש ' +
          'שכבר נשלח יפסיק לעבוד. מה ששמור במכשיר הזה נשאר.</p>' +
          '<button class="btn btn-danger btn-block" data-pub="delete">מחיקת המדריך מהשרת</button>' +
          '</div></details>'
        : '');

    syncPadding();
  }

  /**
   * הריפוד התחתון נגזר מהגובה האמיתי של הפס. קודם היה כאן מספר קבוע, והפס
   * גדל מעליו — כך שכ-270 פיקסלים של תוכן נשארו חבויים מתחתיו.
   */
  function syncPadding() {
    document.body.style.paddingBottom = (bar.offsetHeight + 16) + 'px';
  }

  if (typeof window.ResizeObserver === 'function') {
    new window.ResizeObserver(syncPadding).observe(bar);
  }
  window.addEventListener('resize', syncPadding);

  /*
   * הייבוא מרונדר על ידי app.js בתוך #app ולא נוגע בפס. בלי המעקב הזה
   * הפס היה ממשיך להציג "מעלים קובץ" גם אחרי שהקובץ כבר נטען, וכפתור
   * הפרסום לא היה מופיע עד שמשהו אחר גרם לרינדור.
   */
  var pending = null;
  new window.MutationObserver(function () {
    window.clearTimeout(pending);
    pending = window.setTimeout(render, 80);
  }).observe(document.getElementById('app'), { childList: true, subtree: true });

  /* --------------------------- שרת --------------------------- */

  function load() {
    fetch('/api/admin?t=' + encodeURIComponent(TOKEN))
      .then(function (r) {
        if (!r.ok) throw new Error('קישור הניהול לא פעיל, או שהקבוצה נמחקה.');
        return r.json();
      })
      .then(function (info) { state.info = info; render(); })
      .catch(function (err) {
        bar.innerHTML = '<div class="notice">' + esc(err.message) + '</div>';
        syncPadding();
      });
  }

  function publish() {
    var people = directory();
    if (!people.length || state.busy) return;
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
      if (!r.ok) throw new Error('הפרסום נכשל. אפשר לנסות שוב.');
      return r.json();
    }).then(function (data) {
      state.info.updatedAt = data.updatedAt;
      state.info.peopleCount = data.published;
      state.info.viewUrl = data.viewUrl;
      state.busy = false;
      render();
      openShare(true);
    }).catch(function (err) {
      state.busy = false;
      state.message = err.message;
      render();
    });
  }

  function removeGroup() {
    fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminToken: TOKEN })
    }).then(function () {
      state.info.updatedAt = null;
      state.info.peopleCount = 0;
      state.info.viewUrl = null;
      state.message = 'נמחק מהשרת. מה שיש במכשיר שלך נשאר.';
      render();
    });
  }

  /* --------------------------- אירועים --------------------------- */

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-pub]');
    if (!el) return;
    var action = el.getAttribute('data-pub');

    if (action === 'publish') {
      publish();
    } else if (action === 'share') {
      openShare(false);
    } else if (action === 'close-share') {
      dialog.close();
    } else if (action === 'copy') {
      copyLink(el);
    } else if (action === 'delete') {
      // מחיקת מדריך שלם ראויה לחיכוך אמיתי ולא לאישור בלחיצה אחת.
      var typed = window.prompt('פעולה זו מוחקת את המדריך של הקבוצה מהשרת.\n' +
        'להמשך, יש להקליד: מחק');
      if (typed === null) return;
      if (typed.trim() !== 'מחק') {
        state.message = 'המחיקה בוטלה — הטקסט שהוקלד לא תואם.';
        render();
        return;
      }
      removeGroup();
    }
  });

  render();
  load();
})();
