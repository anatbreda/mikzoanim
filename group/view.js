/*
 * view.js — מסך החיפוש של חברי הקבוצה. קריאה בלבד.
 */
(function () {
  'use strict';

  var U = window.PFUtil;
  var Pro = window.PFProfessions;

  var state = { people: [], groupName: '', query: '', focus: false, error: null };

  function esc(t) { return U.escapeHtml(t); }
  function app() { return document.getElementById('app'); }

  function token() {
    var m = /^\/g\/([A-Za-z0-9_-]{43})/.exec(window.location.pathname);
    return m ? m[1] : null;
  }

  function categoriesOf(p) {
    return [p.categoryId].concat(p.secondaryCategories || []);
  }

  function personRow(p) {
    var cat = Pro.get(p.categoryId);
    var sub = [cat.name];
    if (p.phones && p.phones.length) sub.push(p.phones[0].local);
    if (p.sharedCount > 1) sub.push('הומלץ ' + p.sharedCount + ' פעמים');
    var phone = p.phones && p.phones[0];
    return '<div class="person-row">' +
      '<span class="avatar">' + cat.icon + '</span>' +
      '<span class="person-main">' +
      '<span class="nm">' + esc(p.name) + '</span>' +
      '<span class="sub">' + esc(sub.join(' · ')) + '</span>' +
      '</span>' +
      (phone
        ? '<a class="btn" href="https://wa.me/' + esc(phone.e164.replace('+', '')) +
          '" target="_blank" rel="noopener">וואטסאפ</a>' +
          '<a class="btn btn-ghost" href="tel:' + esc(phone.e164) + '">חיוג</a>'
        : '') +
      '</div>';
  }

  function search(query) {
    var needle = U.foldForSearch(query);
    if (!needle) return [];
    var digits = query.replace(/\D/g, '');
    var byName = {}, byKeyword = {};
    Pro.CATEGORIES.forEach(function (c) {
      if (U.foldForSearch(c.name).indexOf(needle) !== -1) byName[c.id] = true;
      var kws = c.keywords.concat(c.weak || []);
      if (kws.some(function (k) { return U.foldForSearch(k).indexOf(needle) !== -1; })) {
        byKeyword[c.id] = true;
      }
    });
    return state.people.map(function (p) {
      var score = 0;
      if (U.foldForSearch(p.name + ' ' + (p.notes || '')).indexOf(needle) !== -1) score = 4;
      if (digits.length >= 3 && (p.phones || []).some(function (ph) {
        return ph.digits.indexOf(digits) !== -1;
      })) score = Math.max(score, 4);
      categoriesOf(p).forEach(function (id) {
        if (byName[id]) score = Math.max(score, 2);
        else if (byKeyword[id]) score = Math.max(score, 1);
      });
      return { p: p, score: score };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) {
        return b.score - a.score || b.p.sharedCount - a.p.sharedCount ||
          a.p.name.localeCompare(b.p.name, 'he');
      }).map(function (r) { return r.p; });
  }

  function topbar(title, back) {
    return '<div class="topbar"><div class="topbar-row">' +
      (back ? '<button class="icon-btn" data-back="1" aria-label="חזרה">›</button>' : '') +
      '<h1>' + esc(title) + '</h1>' +
      '</div>' +
      '<div class="search-wrap">' +
      '<input type="search" id="q" placeholder="חיפוש לפי שם או תחום…" value="' + esc(state.query) + '">' +
      '</div></div>';
  }

  function mount(html) {
    app().innerHTML = html;
    var q = document.getElementById('q');
    if (q && state.focus) {
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
    state.focus = false;
  }

  function renderCategory(id) {
    var cat = Pro.get(id);
    var list = state.people.filter(function (p) {
      return categoriesOf(p).indexOf(id) !== -1;
    }).sort(function (a, b) { return b.sharedCount - a.sharedCount; });
    mount(topbar(cat.icon + ' ' + cat.name, true) +
      '<main class="screen">' + list.map(personRow).join('') + '</main>');
  }

  function renderHome() {
    var body;
    if (state.query) {
      var hits = search(state.query);
      body = hits.length
        ? '<div class="section-title">' + hits.length + ' תוצאות</div>' + hits.map(personRow).join('')
        : '<div class="empty"><div class="big">🔍</div><p>לא נמצאו תוצאות ל־"' +
          esc(state.query) + '"</p></div>';
    } else {
      var counts = {};
      state.people.forEach(function (p) {
        categoriesOf(p).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
      });
      var tiles = Pro.CATEGORIES.filter(function (c) { return counts[c.id]; })
        .sort(function (a, b) { return counts[b.id] - counts[a.id]; })
        .map(function (c) {
          return '<button class="cat-tile" data-cat="' + c.id + '">' +
            '<span class="emoji">' + c.icon + '</span>' +
            '<span class="name">' + esc(c.name) + '</span>' +
            '<span class="count">' + counts[c.id] + '</span></button>';
        }).join('');
      body = '<div class="section-title">חיפוש לפי תחום</div>' +
        '<div class="cat-grid">' + tiles + '</div>' +
        '<p class="muted tiny" style="margin-top:16px">' + state.people.length +
        ' בעלי מקצוע · הרשימה נבנתה מהמלצות שנשלחו בקבוצה</p>';
    }
    mount(topbar(state.groupName || 'מדריך בעלי מקצוע') + '<main class="screen">' + body + '</main>');
  }

  function renderError(message) {
    app().innerHTML = '<div class="topbar"><div class="topbar-row">' +
      '<h1>מדריך בעלי מקצוע</h1></div></div>' +
      '<main class="screen"><div class="card stack">' +
      '<h2>הקישור לא פעיל</h2>' +
      '<p class="muted">' + esc(message) + '</p>' +
      '<p class="muted tiny">אפשר לבקש קישור מעודכן ממי ששלח/ה לכם אותו.</p>' +
      '</div></main>';
  }

  document.addEventListener('click', function (e) {
    var cat = e.target.closest('[data-cat]');
    if (cat) { renderCategory(cat.getAttribute('data-cat')); return; }
    if (e.target.closest('[data-back]')) renderHome();
  });

  document.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    state.query = e.target.value;
    state.focus = true;
    renderHome();
  });

  var t = token();
  if (!t) {
    renderError('הכתובת לא נראית כמו קישור לקבוצה.');
  } else {
    app().innerHTML = '<main class="screen"><p class="muted">טוען…</p></main>';
    fetch('/api/group?t=' + encodeURIComponent(t))
      .then(function (r) {
        if (r.status === 404) throw new Error('הקבוצה לא נמצאה, או שהמדריך נמחק.');
        if (!r.ok) throw new Error('שגיאה בטעינה. אפשר לנסות שוב.');
        return r.json();
      })
      .then(function (data) {
        state.people = data.people || [];
        state.groupName = data.groupName || '';
        renderHome();
      })
      .catch(function (err) { renderError(err.message); });
  }
})();
