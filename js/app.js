/*
 * app.js — ניתוב ותצוגה. ניתוב hash, בלי תלויות.
 */
(function () {
  'use strict';

  var U = window.PFUtil;
  var Pro = window.PFProfessions;
  var Store = window.PFStore;

  var state = { query: '', busy: false, message: null, focusSearch: false };

  var TYPE_LABEL = {
    name: 'שם הכרטיס',
    caption: 'הודעה של מי ששלח/ה',
    request: 'בקשת המלצה בקבוצה',
    after: 'תגובה מיד אחרי הכרטיס'
  };

  function esc(t) { return U.escapeHtml(t); }
  function app() { return document.getElementById('app'); }

  function go(hash) {
    if (window.location.hash === hash) render();
    else window.location.hash = hash;
  }

  /* --------------------------- עזרי תצוגה --------------------------- */

  function confidenceTag(p) {
    if (p.manual) return '<span class="tag">סווג ידנית</span>';
    if (p.categoryId === 'other' || !p.confidence) return '<span class="tag plain">לא סווג</span>';
    if (p.confidence >= 0.7) return '<span class="tag">ודאות גבוהה</span>';
    if (p.confidence >= 0.45) return '<span class="tag warn">ודאות בינונית</span>';
    return '<span class="tag bad">ודאות נמוכה</span>';
  }

  function warningHtml(w) {
    if (w.type === 'collision') {
      return '<div class="notice">הקובץ "' + esc(w.file) + '" נשלח ' + w.count +
        ' פעמים, אבל ווטסאפ שומר עותק אחד לכל שם. רק אחת הרשומות קיבלה מספר טלפון — ' +
        'אפשר להשלים את השאר ידנית בכרטיס.</div>';
    }
    // 'nomedia' הוא השם הישן של האזהרה הזו, ונשאר כדי שייבוא ששמור כבר
    // במכשיר לא יאבד אותה. השם הישן גם שיקף הסבר שגוי: כרטיסי אנשי קשר
    // נכללים בייצוא גם בלי מדיה, ולכן הסיבה הסבירה היא קובץ חלקי.
    if (w.type === 'missingCards' || w.type === 'nomedia') {
      return '<div class="notice">' + w.count + ' כרטיסי איש קשר הופיעו בצ׳אט אבל הקבצים ' +
        'עצמם לא נכללו, ולכן אין להם מספר טלפון. כדאי לבדוק שהעליתם את קובץ ה-ZIP ' +
        'המלא ולא רק את קובץ הטקסט. אם זה לא זה, אפשר לנסות לייצא שוב עם ' +
        'צירוף מדיה.</div>';
    }
    return '';
  }

  function needsReview(p) {
    return !p.manual && (p.categoryId === 'other' || p.confidence < 0.45 ||
      p.ambiguous || p.phoneMissing);
  }

  function categoriesOf(p) {
    return [p.categoryId].concat(p.manual ? [] : (p.secondaryCategories || []));
  }

  function personRow(p) {
    var cat = Pro.get(p.categoryId);
    var sub = [cat.name];
    if (p.phones && p.phones.length) sub.push(p.phones[0].local);
    else sub.push('בלי מספר');
    if (p.sharedCount > 1) sub.push('הומלץ ' + p.sharedCount + ' פעמים');
    return '<button class="person-row" data-go="#/p/' + esc(p.id) + '">' +
      '<span class="avatar">' + cat.icon + '</span>' +
      '<span class="person-main">' +
      '<span class="nm">' + esc(p.name) + '</span>' +
      '<span class="sub">' + esc(sub.join(' · ')) + '</span>' +
      '</span>' +
      (needsReview(p) ? '<span class="tag warn">בדיקה</span>' : '') +
      '</button>';
  }

  function topbar(title, backHash) {
    return '<div class="topbar">' +
      '<div class="topbar-row">' +
      (backHash ? '<button class="icon-btn" data-go="' + esc(backHash) + '" aria-label="חזרה">›</button>' : '') +
      '<h1>' + esc(title) + '</h1>' +
      '<button class="icon-btn" data-go="#/settings" aria-label="הגדרות">⚙</button>' +
      '</div>' +
      '<div class="search-wrap">' +
      '<input type="search" id="q" placeholder="חיפוש לפי שם או תחום…" value="' + esc(state.query) + '">' +
      '</div>' +
      '</div>';
  }

  function mount(html, keepScroll) {
    app().innerHTML = html;
    var q = document.getElementById('q');
    if (q && state.focusSearch) {
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
    state.focusSearch = false;
    if (!keepScroll) window.scrollTo(0, 0);
  }

  /* --------------------------- חיפוש --------------------------- */

  /**
   * חיפוש אחד לשם ולתחום. הדירוג חשוב: מי שהשם שלו מכיל את מה שהוקלד
   * מופיע לפני מי ששייך לתחום שהמילה מובילה אליו, כדי שחיפוש "שיננית"
   * יציג קודם את השיננית עצמה ורק אחריה את שאר רופאי השיניים.
   */
  function searchPeople(query) {
    var needle = U.foldForSearch(query);
    if (!needle) return [];
    var digits = query.replace(/\D/g, '');

    var byName = {};    // תחום ששמו מכיל את החיפוש
    var byKeyword = {}; // תחום שאחת ממילות המפתח שלו מכילה את החיפוש
    Pro.CATEGORIES.forEach(function (c) {
      if (U.foldForSearch(c.name).indexOf(needle) !== -1) byName[c.id] = true;
      var kws = c.keywords.concat(c.weak || []);
      if (kws.some(function (k) { return U.foldForSearch(k).indexOf(needle) !== -1; })) {
        byKeyword[c.id] = true;
      }
    });

    return Store.people().map(function (p) {
      var score = 0;
      var hay = U.foldForSearch([p.name].concat(p.aliases || [])
        .concat([p.notes || '']).join(' '));
      if (hay.indexOf(needle) !== -1) score = 4;
      if (digits.length >= 3 && (p.phones || []).some(function (ph) {
        return ph.digits.indexOf(digits) !== -1;
      })) score = Math.max(score, 4);
      categoriesOf(p).forEach(function (id) {
        if (byName[id]) score = Math.max(score, 2);
        else if (byKeyword[id]) score = Math.max(score, 1);
      });
      return { person: p, score: score };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) {
        return b.score - a.score ||
          b.person.confidence - a.person.confidence ||
          a.person.name.localeCompare(b.person.name, 'he');
      })
      .map(function (r) { return r.person; });
  }

  /* --------------------------- מסך ייבוא --------------------------- */

  function screenImport() {
    var hasData = Store.hasData();
    mount(
      '<div class="topbar"><div class="topbar-row"><h1>מדריך בעלי מקצוע</h1>' +
      (hasData ? '<button class="icon-btn" data-go="#/" aria-label="סגירה">✕</button>' : '') +
      '</div></div>' +
      '<main class="screen stack">' +
      (state.message ? '<div class="notice">' + esc(state.message) + '</div>' : '') +
      '<div class="card stack">' +
      // מי שמקבלת את הקישור בוואטסאפ לא יודעת מה זה, ולכן המסך הראשון
      // אומר קודם מה הכלי עושה ורק אחר כך מה לעשות.
      '<h2>מוצא את בעל המקצוע שהומלץ בקבוצה</h2>' +
      '<p class="muted">בקבוצות שכונה שולחים המלצות ככרטיס איש קשר, ואחרי חודש ' +
      'כבר אי אפשר למצוא אותן. כאן מעלים את הייצוא של הקבוצה ומקבלים מדריך ' +
      'שאפשר לחפש בו לפי תחום ולפי שם.</p>' +
      '<p class="muted">איך מייצאים: בווטסאפ ← פרטי הקבוצה ← ייצוא צ׳אט ← ' +
      '<strong>ללא מדיה</strong>. כרטיסי אנשי הקשר נכללים כך ממילא — הם לא ' +
      'נחשבים מדיה כמו תמונה או הודעה קולית — והקובץ יוצא קטן ומהיר להעלאה.</p>' +
      '<div class="dropzone" id="drop">' +
      '<div class="big">📂</div>' +
      '<div><strong>גררו לכאן את קובץ ה-ZIP</strong></div>' +
      '<div class="muted tiny">או לחצו כדי לבחור קובץ · אפשר גם קובץ .txt לבד או תיקייה מחולצת</div>' +
      '<input type="file" id="file" multiple hidden ' +
      'accept=".zip,.txt,.vcf,application/zip,application/x-zip-compressed,text/plain,text/vcard">' +
      '</div>' +
      '<div class="privacy">🔒 <strong>הכל נשאר במכשיר הזה.</strong> ' +
      'הקובץ מפוענח בדפדפן, התוצאה נשמרת מקומית, ושום שם או מספר טלפון לא נשלח לשרת ' +
      'ולא נכנס לקוד של האתר.</div>' +
      '</div>' +
      '<details class="card"><summary>מה המערכת מחלצת, ומה היא לא יכולה</summary>' +
      '<div class="stack tiny muted" style="margin-top:8px">' +
      '<p><strong>מחלצת:</strong> כל ההודעות מסוג "איש קשר", השם והטלפון מתוך כרטיס ה-vCard, ' +
      'והתחום המקצועי לפי שם הכרטיס, לפי בקשת ההמלצה שקדמה לו ולפי ההודעות סביבו.</p>' +
      '<p><strong>לא יכולה:</strong> ייצוא ווטסאפ לא שומר מי הגיב למי. אין בקובץ שום סימן ' +
      'של ציטוט או תגובה, ולכן הקישור בין בקשה לכרטיס נעשה לפי סמיכות בזמן ובסדר ההודעות. ' +
      'כל שיוך מלווה בראיה שאפשר לבדוק, ואפשר לתקן ידנית.</p>' +
      '<p><strong>לא נשמר בייצוא:</strong> המלצות שנשלחו כתמונה מופיעות כ-"Media omitted" ' +
      'ולא ניתן לחלץ אותן, והודעות שנמחקו אינן כלולות.</p>' +
      '</div></details>' +
      '</main>', false);

    wireDropzone();
  }

  function wireDropzone() {
    var drop = document.getElementById('drop');
    var input = document.getElementById('file');
    if (!drop || !input) return;

    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) handleFiles(input.files);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove('over');
      });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve({ name: file.name, buffer: reader.result });
      };
      reader.onerror = function () { reject(new Error('לא ניתן לקרוא את ' + file.name)); };
      reader.readAsArrayBuffer(file);
    });
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList);
    state.busy = true;
    state.message = null;
    app().querySelector('.dropzone').innerHTML =
      '<div class="big">⏳</div><div><strong>מפענח…</strong></div>';

    Promise.all(files.map(readFile)).then(function (loaded) {
      var zip = loaded.filter(function (f) { return /\.zip$/i.test(f.name); })[0];
      if (zip) return window.PFZip.readZip(zip.buffer);
      return loaded.map(function (f) {
        return { name: f.name, bytes: new Uint8Array(f.buffer) };
      });
    }).then(function (entries) {
      var result = window.PFPipeline.fromEntries(entries);
      Store.setImport(result);
      state.busy = false;
      state.message = null;
      go('#/');
    }).catch(function (err) {
      state.busy = false;
      state.message = (err && err.message) || 'הייבוא נכשל.';
      screenImport();
    });
  }

  /* --------------------------- מסך בית --------------------------- */

  function screenHome() {
    var people = Store.people();
    var meta = Store.meta() || {};
    var body;

    if (state.query) {
      var hits = searchPeople(state.query);
      body = hits.length
        ? '<div class="section-title">' + hits.length + ' תוצאות</div>' +
          hits.map(personRow).join('')
        : '<div class="empty"><div class="big">🔍</div><p>לא נמצאו תוצאות ל־"' +
          esc(state.query) + '"</p></div>';
    } else {
      var counts = {};
      people.forEach(function (p) {
        categoriesOf(p).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
      });
      var tiles = Pro.CATEGORIES.filter(function (c) { return counts[c.id]; })
        .sort(function (a, b) { return counts[b.id] - counts[a.id]; })
        .map(function (c) {
          return '<button class="cat-tile" data-go="#/c/' + c.id + '">' +
            '<span class="emoji">' + c.icon + '</span>' +
            '<span class="name">' + esc(c.name) + '</span>' +
            '<span class="count">' + counts[c.id] + '</span>' +
            '</button>';
        }).join('');

      var review = people.filter(needsReview).length;
      body =
        (review
          ? '<button class="card" data-go="#/review" style="width:100%;text-align:start;cursor:pointer;font:inherit;color:inherit">' +
            '<strong>⚠️ ' + review + ' רשומות מחכות לבדיקה</strong>' +
            '<div class="muted tiny">ודאות נמוכה, שני תחומים אפשריים או מספר חסר</div></button>'
          : '') +
        '<div class="section-title">חיפוש לפי תחום</div>' +
        '<div class="cat-grid">' + tiles + '</div>' +
        '<div class="section-title">הקובץ שנטען</div>' +
        '<div class="stat-row">' +
        '<div class="stat"><div class="n">' + people.length + '</div><div class="l">בעלי מקצוע</div></div>' +
        '<div class="stat"><div class="n">' + (meta.contactCards || 0) + '</div><div class="l">כרטיסי איש קשר</div></div>' +
        '<div class="stat"><div class="n">' + (meta.total || 0) + '</div><div class="l">הודעות</div></div>' +
        '</div>' +
        (meta.groupName ? '<p class="muted tiny">' + esc(meta.groupName) + '</p>' : '');
    }

    mount(topbar('מדריך בעלי מקצוע') + '<main class="screen">' + body + '</main>', state.focusSearch);
  }

  /* --------------------------- מסך תחום --------------------------- */

  function screenCategory(id) {
    var cat = Pro.get(id);
    var list = Store.people().filter(function (p) {
      return categoriesOf(p).indexOf(id) !== -1;
    }).sort(function (a, b) {
      return b.sharedCount - a.sharedCount || b.confidence - a.confidence;
    });

    mount(topbar(cat.icon + ' ' + cat.name, '#/') +
      '<main class="screen">' +
      (list.length
        ? list.map(personRow).join('')
        : '<div class="empty"><div class="big">' + cat.icon + '</div><p>אין עדיין רשומות בתחום הזה</p></div>') +
      '</main>', false);
  }

  /* --------------------------- כרטיס אדם --------------------------- */

  function evidenceBlock(p) {
    var rows = (p.evidence || []).filter(function (e) {
      return e.categoryId === p.categoryId;
    }).sort(function (a, b) { return b.confidence - a.confidence; });

    if (!rows.length) {
      return '<p class="muted tiny">לא נמצאה עדות לשיוך לתחום. אפשר לבחור תחום ידנית למעלה.</p>';
    }

    return rows.map(function (e) {
      var when = e.date ? U.formatDate(new Date(e.date)) : '';
      return '<div class="evidence">' +
        '<div class="meta">' + esc(TYPE_LABEL[e.type] || e.type) +
        ' · מילה מזהה: "' + esc(e.keyword) + '"' +
        (when ? ' · ' + esc(when) : '') + '</div>' +
        '<div class="quote">' + esc(String(e.text).slice(0, 300)) + '</div>' +
        '</div>';
    }).join('');
  }

  function screenPerson(id) {
    var p = Store.people().filter(function (x) { return x.id === id; })[0];
    if (!p) { go('#/'); return; }

    var cat = Pro.get(p.categoryId);
    var phones = (p.phones || []).map(function (ph) {
      return '<div class="phone-line">' +
        '<a class="btn" href="https://wa.me/' + ph.e164.replace('+', '') + '" target="_blank" rel="noopener">וואטסאפ</a>' +
        '<a class="btn btn-ghost" href="tel:' + ph.e164 + '">חיוג</a>' +
        '<span>' + esc(ph.local) + '</span>' +
        '</div>';
    }).join('');

    var options = Pro.CATEGORIES.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === p.categoryId ? ' selected' : '') + '>' +
        c.icon + ' ' + esc(c.name) + '</option>';
    }).join('');

    var secondary = (p.secondaryCategories || []).map(function (cid) {
      return '<span class="tag plain">' + Pro.get(cid).icon + ' ' + esc(Pro.get(cid).name) + '</span>';
    }).join(' ');

    mount(topbar(p.name, '#/c/' + p.categoryId) +
      '<main class="screen stack">' +

      '<div class="card stack">' +
      '<h2>' + esc(p.name) + '</h2>' +
      '<div>' + '<span class="tag">' + cat.icon + ' ' + esc(cat.name) + '</span> ' +
      confidenceTag(p) +
      (p.ambiguous ? ' <span class="tag warn">יכול להיות גם תחום אחר</span>' : '') +
      (secondary ? ' ' + secondary : '') + '</div>' +
      (p.sharedCount > 1
        ? '<p class="muted tiny">הכרטיס נשלח בקבוצה ' + p.sharedCount + ' פעמים</p>' : '') +
      (phones || '<p class="notice">לא נשמר מספר טלפון לרשומה הזו. ' +
        'ווטסאפ שומר קובץ אחד לכל שם, וכשאותו שם נשלח כמה פעמים העותקים האחרים אובדים.</p>') +
      ((p.aliases || []).length
        ? '<p class="muted tiny">ידוע גם כ: ' + esc(p.aliases.join(', ')) + '</p>' : '') +
      '</div>' +

      '<div class="card stack">' +
      '<h3>למה סווג כך?</h3>' +
      evidenceBlock(p) +
      '</div>' +

      '<div class="card stack">' +
      '<h3>תיקון ידני</h3>' +
      '<label class="muted tiny" for="cat">תחום</label>' +
      '<select id="cat" data-person="' + esc(p.id) + '">' + options + '</select>' +
      '<label class="muted tiny" for="nm">שם</label>' +
      '<input type="text" id="nm" value="' + esc(p.name) + '">' +
      '<label class="muted tiny" for="ph">טלפון</label>' +
      '<input type="text" id="ph" inputmode="tel" placeholder="050-000-0000" value="' +
      esc((p.phones && p.phones[0]) ? p.phones[0].local : '') + '">' +
      '<label class="muted tiny" for="notes">הערה</label>' +
      '<textarea id="notes" placeholder="למשל: הגיע מהר, מחיר הוגן">' + esc(p.notes || '') + '</textarea>' +
      '<div class="btn-row">' +
      '<button class="btn" data-action="save" data-person="' + esc(p.id) + '">שמירה</button>' +
      '<button class="btn btn-ghost" data-action="reset-person" data-person="' + esc(p.id) + '">ביטול תיקונים</button>' +
      '</div>' +
      '<button class="btn btn-danger btn-block" data-action="hide" data-person="' + esc(p.id) + '">הסתרה מהרשימה</button>' +
      '</div>' +

      '</main>', false);
  }

  /* --------------------------- תור בדיקה --------------------------- */

  function screenReview() {
    var list = Store.people().filter(needsReview);
    var warnings = Store.warnings() || [];

    mount(topbar('תור בדיקה', '#/') +
      '<main class="screen stack">' +
      (warnings.length
        ? warnings.map(warningHtml).join('')
        : '') +
      (list.length
        ? '<p class="muted tiny">רשומות שכדאי לאשר או לתקן. לחיצה פותחת את הכרטיס.</p>' +
          list.map(personRow).join('')
        : '<div class="empty"><div class="big">✅</div><p>אין רשומות שמחכות לבדיקה</p></div>') +
      '</main>', false);
  }

  /* --------------------------- הגדרות --------------------------- */

  function screenSettings() {
    var meta = Store.meta() || {};
    mount(topbar('הגדרות', '#/') +
      '<main class="screen stack">' +
      '<div class="card stack">' +
      '<h3>הקובץ שנטען</h3>' +
      '<p class="muted tiny">' +
      (meta.groupName ? 'קבוצה: ' + esc(meta.groupName) + '<br>' : '') +
      'הודעות: ' + (meta.total || 0) + ' · כרטיסי איש קשר: ' + (meta.contactCards || 0) +
      ' · קבצי vcf: ' + (meta.vcardFiles || 0) + '<br>' +
      'מדיה שהושמטה בייצוא: ' + (meta.omitted || 0) +
      ' · הודעות שנמחקו: ' + (meta.deleted || 0) +
      '</p>' +
      '<button class="btn btn-block" data-go="#/import">טעינת ייצוא חדש</button>' +
      '<p class="muted tiny">ייבוא חוזר מרענן את הרשימה ושומר על התיקונים הידניים.</p>' +
      '</div>' +

      '<div class="card stack">' +
      '<h3>גיבוי</h3>' +
      '<p class="muted tiny">קובץ JSON להעברה למכשיר אחר. הוא מכיל מספרי טלפון — כדאי לשמור אותו במקום פרטי.</p>' +
      '<p class="muted tiny">בסאפארי בנייד יש מנגנון שמוחק אחסון של אתרים שלא נכנסים אליהם כשבוע. ' +
      'הוספה למסך הבית (שיתוף ← הוספה למסך הבית) פוטרת את האתר מזה, וגיבוי מדי פעם נותן רשת ביטחון.</p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost" data-action="export">הורדת גיבוי</button>' +
      '<button class="btn btn-ghost" data-action="import-json">טעינת גיבוי</button>' +
      '</div>' +
      '<input type="file" id="jsonfile" hidden accept=".json,application/json,text/plain">' +
      '</div>' +

      '<div class="card stack">' +
      '<h3>מחיקה</h3>' +
      '<p class="muted tiny">מוחק את כל הנתונים מהמכשיר הזה. אין שרת, ולכן אין גיבוי אוטומטי.</p>' +
      '<button class="btn btn-danger btn-block" data-action="reset">מחיקת הכל</button>' +
      '</div>' +
      '</main>', false);

    var jf = document.getElementById('jsonfile');
    if (jf) {
      jf.addEventListener('change', function () {
        var f = jf.files && jf.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            Store.importJson(String(reader.result));
            go('#/');
          } catch (e) {
            alert('טעינת הגיבוי נכשלה: ' + e.message);
          }
        };
        reader.readAsText(f);
      });
    }
  }

  /* --------------------------- פעולות --------------------------- */

  function onClick(e) {
    var goTarget = e.target.closest('[data-go]');
    if (goTarget) {
      go(goTarget.getAttribute('data-go'));
      return;
    }

    var actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    var action = actionEl.getAttribute('data-action');
    var id = actionEl.getAttribute('data-person');

    if (action === 'save') {
      var typed = document.getElementById('ph').value.trim();
      if (typed && !U.normalizePhone(typed)) {
        alert('המספר לא נראה כמו מספר טלפון ישראלי תקין.');
        return;
      }
      Store.setOverride(id, {
        categoryId: document.getElementById('cat').value,
        name: document.getElementById('nm').value.trim(),
        notes: document.getElementById('notes').value,
        phone: typed || null
      });
      go('#/p/' + id);
    } else if (action === 'reset-person') {
      Store.clearOverride(id);
      go('#/p/' + id);
    } else if (action === 'hide') {
      if (confirm('להסתיר את הרשומה מהרשימה?')) {
        Store.setOverride(id, { hidden: true });
        go('#/');
      }
    } else if (action === 'export') {
      downloadText('pro-finder-backup.json', Store.exportJson());
    } else if (action === 'import-json') {
      document.getElementById('jsonfile').click();
    } else if (action === 'reset') {
      if (confirm('למחוק את כל הנתונים מהמכשיר?')) {
        Store.reset();
        go('#/import');
      }
    }
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function onInput(e) {
    if (e.target.id !== 'q') return;
    state.query = e.target.value;
    state.focusSearch = true;
    // מחליפים את ה-hash בלי לעורר ניווט, כדי שהקלדה לא תאבד את הפוקוס.
    if (!/^#\/?$/.test(window.location.hash || '#/')) {
      window.history.replaceState(null, '', '#/');
    }
    screenHome();
  }

  /* --------------------------- ניתוב --------------------------- */

  function render() {
    var hash = (window.location.hash || '#/').replace(/^#\/?/, '');
    var parts = hash.split('/');
    var name = parts[0] || '';

    if (!Store.hasData() && name !== 'import') { screenImport(); return; }

    if (name === 'import') screenImport();
    else if (name === 'c' && parts[1]) screenCategory(parts[1]);
    else if (name === 'p' && parts[1]) screenPerson(decodeURIComponent(parts[1]));
    else if (name === 'review') screenReview();
    else if (name === 'settings') screenSettings();
    else screenHome();
  }

  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  window.addEventListener('hashchange', function () {
    state.query = '';
    render();
  });

  render();
})();
