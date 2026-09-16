/*
 * vcard.js — פענוח כרטיסי איש קשר (.vcf) שמגיעים בייצוא של ווטסאפ.
 *
 * שלושה דברים שנמצאו בקבצים אמיתיים וחייבים טיפול מיוחד:
 *   1. "END:VCARDBEGIN:VCARD" בלי שורה חדשה ביניהם (קובץ "2 אנשי קשר.vcf").
 *   2. ערך שנשבר לשורה חדשה בלי רווח מוביל — ווטסאפ כותב תיאור עסקי
 *      רב-שורתי כמו שהוא, בניגוד לתקן. לכן שורה שלא נראית כמו שם מאפיין
 *      נחשבת המשך של הערך הקודם.
 *   3. תחיליות קיבוץ "item1.TEL" ופרמטרים ";type=CELL;waid=972...".
 */
(function (global) {
  'use strict';

  // טעינת תלויות ב-Node; בדפדפן הן כבר נטענו כתגי script לפי הסדר.
  if (typeof module === 'object' && module.exports) {
    if (!global.PFUtil) require('./util.js');
  }

  var PROP_LINE = /^(?:[A-Za-z0-9-]+\.)?[A-Za-z][A-Za-z0-9-]*\s*[;:]/;

  function decodeQuotedPrintable(value) {
    var bytes = [];
    for (var i = 0; i < value.length; i++) {
      if (value[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(value.substr(i + 1, 2))) {
        bytes.push(parseInt(value.substr(i + 1, 2), 16));
        i += 2;
      } else {
        bytes.push(value.charCodeAt(i) & 0xFF);
      }
    }
    try {
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch (e) {
      return value;
    }
  }

  /** מאחד גלישות שורה ומחזיר רשימת שורות מאפיין. */
  function logicalLines(text) {
    var raw = global.PFUtil.clean(text).split('\n');
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var line = raw[i];
      if (!line.trim() && !out.length) continue;
      var isFold = /^[ \t]/.test(line);
      var isContinuation = out.length && !isFold && !PROP_LINE.test(line) &&
        !/^(BEGIN|END):VCARD$/i.test(line.trim());
      // שבירה רכה של quoted-printable: השורה הקודמת נגמרת ב-"="
      var softBreak = out.length && /=$/.test(out[out.length - 1]);

      if (isFold) {
        out[out.length - 1] += line.replace(/^[ \t]/, '');
      } else if (softBreak) {
        out[out.length - 1] = out[out.length - 1].slice(0, -1) + line;
      } else if (isContinuation) {
        out[out.length - 1] += '\n' + line;
      } else {
        out.push(line);
      }
    }
    return out;
  }

  function parseOne(block) {
    var card = {
      fn: '', n: '', org: '', title: '', note: '',
      bizName: '', bizDescription: '', labels: [], tels: []
    };

    logicalLines(block).forEach(function (line) {
      var colon = line.indexOf(':');
      if (colon === -1) return;
      var head = line.slice(0, colon);
      var value = line.slice(colon + 1);

      var parts = head.split(';');
      var name = parts[0].replace(/^[A-Za-z0-9-]+\./, '').toUpperCase();
      var params = parts.slice(1).join(';');

      if (name === 'PHOTO' || name === 'LOGO') return; // ערכי base64 ענקיים, לא רלוונטיים
      if (/ENCODING\s*=\s*QUOTED-PRINTABLE/i.test(params)) value = decodeQuotedPrintable(value);
      value = value.trim();
      if (!value) return;

      switch (name) {
        case 'FN': card.fn = card.fn || value; break;
        case 'N': card.n = card.n || value.replace(/;+/g, ' ').trim(); break;
        case 'ORG': card.org = card.org || value.replace(/;+$/, '').replace(/;/g, ' ').trim(); break;
        case 'TITLE': card.title = card.title || value; break;
        case 'NOTE': card.note = card.note || value; break;
        case 'X-WA-BIZ-NAME': card.bizName = card.bizName || value; break;
        case 'X-WA-BIZ-DESCRIPTION': card.bizDescription = card.bizDescription || value; break;
        case 'X-ABLABEL': card.labels.push(value); break;
        case 'TEL': {
          var waid = /waid=(\d+)/i.exec(params);
          card.tels.push({ raw: value, waid: waid ? waid[1] : null });
          break;
        }
      }
    });

    card.displayName = card.fn || card.n || card.bizName || '';
    // כל הטקסט שיכול להסגיר מקצוע — משמש לאות הסיווג החזק ביותר.
    card.professionText = [card.fn, card.n, card.org, card.title, card.note,
      card.bizName, card.bizDescription].filter(Boolean).join(' | ');

    card.phones = [];
    card.tels.forEach(function (t) {
      var p = global.PFUtil.normalizePhone(t.waid ? '+' + t.waid : t.raw) ||
        global.PFUtil.normalizePhone(t.raw);
      if (p && card.phones.every(function (e) { return e.digits !== p.digits; })) {
        card.phones.push(p);
      }
    });

    return card;
  }

  /**
   * מפענח קובץ vcf אחד ומחזיר את כל הכרטיסים שבתוכו.
   * @returns {Array<Object>}
   */
  function parseVCards(text) {
    var body = global.PFUtil.clean(text);
    // פיצול לפי BEGIN:VCARD — עמיד ל-"END:VCARDBEGIN:VCARD" בלי שורה חדשה.
    var blocks = body.split(/BEGIN:VCARD/i).slice(1);
    var cards = blocks
      .map(function (b) { return parseOne(b.replace(/END:VCARD[\s\S]*$/i, '')); })
      .filter(function (c) { return c.displayName || c.phones.length; });

    // ווטסאפ כותב לפעמים את אותו איש קשר פעמיים באותו קובץ (גרסת vCard 3.0
    // וגרסה עם פרמטרים). בלי איחוד הוא ייספר כשתי המלצות נפרדות.
    var seen = {};
    var unique = [];
    cards.forEach(function (c) {
      var key = c.phones.length ? c.phones[0].digits : 'n:' + global.PFUtil.foldForSearch(c.displayName);
      var prev = seen[key];
      if (!prev) {
        seen[key] = c;
        unique.push(c);
      } else if (c.professionText.length > prev.professionText.length) {
        unique[unique.indexOf(prev)] = c;
        seen[key] = c;
      }
    });
    return unique;
  }

  var api = { parseVCards: parseVCards, decodeQuotedPrintable: decodeQuotedPrintable };
  global.PFVCard = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
