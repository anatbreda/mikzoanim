/*
 * classify.js — קישור כרטיס איש קשר לתחום מקצועי.
 *
 * הערה חשובה על "תגובה להודעה": ייצוא הצ'אט של ווטסאפ **לא** כולל מטא-דאטה
 * של ציטוט/reply. אין בקובץ שום סימן שהודעה נשלחה כתגובה לאחרת. לכן במקום
 * הקישור המפורש נאספים ארבעה אותות בלתי תלויים, כל אחד עם ראיה שמוצגת
 * למשתמשת — סיווג אוטומטי בלי מסלול ביקורת הוא סיווג שאי אפשר לסמוך עליו.
 */
(function (global) {
  'use strict';

  // טעינת תלויות ב-Node; בדפדפן הן כבר נטענו כתגי script לפי הסדר.
  if (typeof module === 'object' && module.exports) {
    if (!global.PFUtil) require('./util.js');
    if (!global.PFProfessions) require('./professions.js');
  }

  var U = function () { return global.PFUtil; };
  var P = function () { return global.PFProfessions; };

  // ביטויים שמסמנים בקשת המלצה. "אשמח ל" תופס גם שגיאות כתיב כמו "אשמח לכמלצה".
  var REQUEST = /(המלצ|ממליצ|מחפש|מישהי? (?:מכיר|יודע)|יש למישה|אשמח ל|מכיר(?:ים|ות)|צריכה? |דחוף|מי יכול|יש לכ[םן]|זקוק)/;

  var SIGNAL = {
    name: 0.85,        // שם הכרטיס ושדות ה-vCard
    caption: 0.60,     // כיתוב מאותו שולח, לפני או אחרי הכרטיס
    requestNear: 0.80, // בקשה עד 3 הודעות ו-20 דקות
    requestMid: 0.60,  // בקשה עד 15 הודעות ושעתיים
    requestFar: 0.35,  // בקשה עד 40 הודעות ו-24 שעות
    after: 0.30        // הודעה מכל שולח מיד אחרי הכרטיס
  };

  var MIN_CONFIDENCE = 0.30;
  var AMBIGUOUS_GAP = 0.15;
  var MINUTE = 60 * 1000;

  function baseName(filename) {
    return U().clean(filename)
      .replace(/\.vcf$/i, '')
      .replace(/^\d{6,}-/, '') // תחילית מספרית של ייצוא אייפון
      .trim();
  }

  function hash(text) {
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function minutesBetween(a, b) {
    return Math.abs(a.getTime() - b.getTime()) / MINUTE;
  }

  /* ------------------------- איסוף אותות ------------------------- */

  function Collector() {
    this.byCategory = {};
    this.evidence = [];
  }

  /**
   * מוסיף אות מטקסט. כל התחומים שנמצאו בטקסט נרשמים, אבל רק הספציפי ביותר
   * מקבל את מלוא הוודאות — האחרים נחלשים ביחס לאורך מילת המפתח שלהם.
   * כך "תריסים חשמליים" מנצח את "חשמל" שבתוכו.
   */
  Collector.prototype.add = function (type, confidence, text, context) {
    var matches = P().bestPerCategory(text);
    if (!matches.length) return;
    var top = matches[0].weight;
    var self = this;
    matches.forEach(function (m) {
      var scaled = confidence * (m.weight / top);
      if (scaled < 0.2) return;
      var slot = self.byCategory[m.categoryId] ||
        (self.byCategory[m.categoryId] = { best: 0, types: {} });
      if (scaled > slot.best) slot.best = scaled;
      if (scaled >= 0.25) slot.types[type] = true;
      self.evidence.push({
        type: type,
        categoryId: m.categoryId,
        keyword: m.keyword,
        confidence: Math.round(scaled * 100) / 100,
        text: (context && context.text) || text,
        sender: (context && context.sender) || null,
        date: (context && context.date) || null
      });
    });
  };

  Collector.prototype.result = function () {
    var self = this;
    var ranked = Object.keys(this.byCategory).map(function (id) {
      var slot = self.byCategory[id];
      var types = Object.keys(slot.types);
      var score = slot.best + 0.07 * Math.max(0, types.length - 1);
      return {
        categoryId: id,
        confidence: Math.min(0.97, Math.round(score * 100) / 100),
        types: types
      };
    }).sort(function (a, b) { return b.confidence - a.confidence; });

    var kept = ranked.filter(function (r) { return r.confidence >= MIN_CONFIDENCE; });
    if (!kept.length) {
      return { categoryId: 'other', confidence: 0, ambiguous: false, ranked: ranked };
    }
    var ambiguous = kept.length > 1 && (kept[0].confidence - kept[1].confidence) < AMBIGUOUS_GAP;
    return {
      categoryId: kept[0].categoryId,
      confidence: kept[0].confidence,
      ambiguous: ambiguous,
      ranked: kept
    };
  };

  /* ------------------------- הרצה על הצ'אט ------------------------- */

  function annotate(messages) {
    messages.forEach(function (msg) {
      msg.categories = msg.isContactCard ? [] : P().bestPerCategory(msg.text);
      msg.isRequest = !msg.isContactCard && !msg.isSystem && REQUEST.test(msg.text);
    });
  }

  var NAME_STOP = {};
  ['אנשי', 'קשר', 'איש', 'ד״ר', 'דר', 'דוקטור', 'הזה', 'שלי', 'שלה', 'שלו',
    'מומלץ', 'מומלצת', 'מומלצים', 'ממליצה', 'נפלאה', 'מהממת', 'פרטית', 'פרטי']
    .forEach(function (w) { NAME_STOP[w] = true; });

  /**
   * מילים ייחודיות משם איש הקשר, שלפיהן אפשר לזהות את ההודעה שהכרטיס עונה לה.
   * מילים שהן עצמן שם מקצוע נפסלות — "שיננית" מופיעה בהמון הודעות ואינה מזהה.
   */
  function nameTokens(name) {
    return global.PFUtil.clean(name)
      .split(/[^\u05D0-\u05EAA-Za-z0-9]+/)
      .filter(function (t) {
        return t.length >= 3 && !NAME_STOP[t] && !P().matchAll(t).length;
      });
  }

  function mentionsAny(text, tokens) {
    for (var i = 0; i < tokens.length; i++) {
      if (text.indexOf(tokens[i]) !== -1) return true;
    }
    return false;
  }

  function contextOf(msg) {
    return { text: msg.text, sender: msg.sender, date: msg.date };
  }

  /** אותות ההקשר בלבד — בלי שם הכרטיס. משמש גם להכרעת התנגשות שמות קבצים. */
  function levelOf(dMsg, dMin) {
    if (dMsg <= 3 && dMin <= 20) return 'requestNear';
    if (dMsg <= 15 && dMin <= 120) return 'requestMid';
    return 'requestFar';
  }

  function contextSignals(messages, i, cardName) {
    var card = messages[i];
    var c = new Collector();
    var j, m;

    // B — כיתוב של אותו שולח, לפני או אחרי הכרטיס.
    for (j = Math.max(0, i - 3); j <= Math.min(messages.length - 1, i + 3); j++) {
      if (j === i) continue;
      m = messages[j];
      if (m.isSystem || m.isContactCard || m.isOmitted || m.isDeleted) continue;
      if (m.sender !== card.sender) continue;
      if (minutesBetween(m.date, card.date) > 10) continue;
      c.add('caption', SIGNAL.caption, m.text, contextOf(m));
    }

    // C — בקשת ההמלצה האחרונה שקדמה לכרטיס.
    // מחפשים את הבקשה האחרונה, לא את ההודעה האחרונה: הכרטיס
    // "מירי צ׳רכי שיננית" יושב באמצע שרשור על סדנאות בישול, והבקשה
    // הנכונה היא חמש הודעות אחורה.
    var seen = {};
    var tokens = nameTokens(cardName || '');
    for (j = i - 1; j >= 0 && i - j <= 40; j--) {
      m = messages[j];
      var dMin = minutesBetween(m.date, card.date);
      if (dMin > 24 * 60) break;
      var dMsg = i - j;

      // עוגן: הודעה סמוכה שמזכירה את שם איש הקשר היא ההודעה שהכרטיס עונה לה.
      // "יש למישהי את הוואטסאפ של אלמה וארנון?" עוצרת את הסריקה, כך שהכרטיס
      // לא ייגרר לבקשה ישנה יותר שבמקרה הייתה בטווח.
      if (!m.isSystem && !m.isContactCard && dMsg <= 10 && dMin <= 60 &&
        mentionsAny(m.text, tokens)) {
        if (m.isRequest && m.categories.length && m.sender !== card.sender) {
          c.add('request', SIGNAL[levelOf(dMsg, dMin)], m.text, contextOf(m));
        }
        break;
      }

      if (!m.isRequest || !m.categories.length) continue;
      // מכל תחום נלקחת רק הבקשה הקרובה ביותר.
      var fresh = m.categories.filter(function (x) { return !seen[x.categoryId]; });
      if (!fresh.length) continue;
      fresh.forEach(function (x) { seen[x.categoryId] = true; });
      c.add('request', SIGNAL[levelOf(dMsg, dMin)], m.text, contextOf(m));
    }

    // D — תגובות מיד אחרי הכרטיס, מכל שולח.
    for (j = i + 1; j <= Math.min(messages.length - 1, i + 3); j++) {
      m = messages[j];
      if (m.isSystem || m.isContactCard || m.isOmitted || m.isDeleted) continue;
      if (m.sender === card.sender) continue; // כבר נספר כ-caption
      if (minutesBetween(m.date, card.date) > 10) continue;
      c.add('after', SIGNAL.after, m.text, contextOf(m));
    }

    return c;
  }

  /* ------------------ הצמדת קבצי vcf להודעות ------------------ */

  /**
   * ווטסאפ שומר בזיפ קובץ אחד לכל שם. כשאותו שם נשלח כמה פעמים
   * (למשל "2 אנשי קשר.vcf" שנשלח שלוש פעמים בנושאים שונים) נשמר עותק אחד
   * בלבד. במקום לשייך אותו לכל ההודעות ולזהם את הנתונים, הוא מוצמד רק
   * להודעה שההקשר שלה מסכים עם תוכן הכרטיס, והשאר מסומנות כחסרות טלפון.
   */
  function assignCards(messages, cardIndexes, filesByKey, contexts) {
    var byFile = {};
    cardIndexes.forEach(function (i) {
      var key = U().fileKey(messages[i].attachment);
      (byFile[key] || (byFile[key] = [])).push(i);
    });

    var assignment = {}; // messageIndex -> {cards: [], contested: bool}
    var warnings = [];
    var missingFiles = 0;

    Object.keys(byFile).forEach(function (key) {
      var indexes = byFile[key];
      var file = filesByKey[key];
      if (!file) {
        indexes.forEach(function (i) { assignment[i] = { cards: [], missing: 'nofile' }; });
        missingFiles += indexes.length;
        return;
      }
      if (indexes.length === 1) {
        assignment[indexes[0]] = { cards: file.cards, missing: null };
        return;
      }

      // התנגשות: בוחרים את ההודעה שההקשר שלה תואם לתוכן הכרטיס.
      var fileCats = {};
      P().bestPerCategory(file.cards.map(function (c) { return c.professionText; }).join(' | '))
        .forEach(function (m) { fileCats[m.categoryId] = m.weight; });

      var best = -1, bestScore = -1;
      indexes.forEach(function (i) {
        var r = contexts[i].result();
        var score = fileCats[r.categoryId] ? r.confidence + 1 : r.confidence;
        if (score > bestScore) { bestScore = score; best = i; }
      });

      indexes.forEach(function (i) {
        assignment[i] = i === best
          ? { cards: file.cards, missing: null }
          : { cards: [], missing: 'collision' };
      });
      warnings.push({
        type: 'collision',
        file: baseName(messages[indexes[0]].attachment),
        count: indexes.length,
        dates: indexes.map(function (i) { return messages[i].date; })
      });
    });

    if (missingFiles) {
      // קורה כשהייצוא נעשה בלי "צירוף מדיה": ההודעות קיימות, הכרטיסים לא.
      warnings.push({ type: 'nomedia', count: missingFiles });
    }

    return { assignment: assignment, warnings: warnings };
  }

  /* ------------------------- מיזוג לאנשים ------------------------- */

  function mergeInto(people, byKey, record) {
    var key = record.phones.length
      ? 'p_' + record.phones[0].digits
      : 'n_' + hash(U().foldForSearch(record.name));

    var person = byKey[key];
    if (!person) {
      person = {
        id: key,
        name: record.name,
        aliases: [],
        phones: record.phones.slice(),
        categoryId: record.categoryId,
        confidence: record.confidence,
        ambiguous: record.ambiguous,
        ranked: record.ranked,
        evidence: record.evidence.slice(),
        recommenders: [],
        sharedCount: 0,
        phoneMissing: record.phoneMissing,
        firstSeen: record.date,
        lastSeen: record.date
      };
      byKey[key] = person;
      people.push(person);
    } else {
      if (record.name && record.name.length > person.name.length) {
        if (person.aliases.indexOf(person.name) === -1) person.aliases.push(person.name);
        person.name = record.name;
      } else if (record.name && record.name !== person.name &&
        person.aliases.indexOf(record.name) === -1) {
        person.aliases.push(record.name);
      }
      record.phones.forEach(function (p) {
        if (person.phones.every(function (e) { return e.digits !== p.digits; })) person.phones.push(p);
      });
      if (record.confidence > person.confidence) {
        person.categoryId = record.categoryId;
        person.confidence = record.confidence;
        person.ambiguous = record.ambiguous;
        person.ranked = record.ranked;
      }
      person.evidence = person.evidence.concat(record.evidence);
      if (record.phones.length) person.phoneMissing = false;
      if (record.date < person.firstSeen) person.firstSeen = record.date;
      if (record.date > person.lastSeen) person.lastSeen = record.date;
    }

    person.sharedCount++;
    if (record.sender && person.recommenders.indexOf(record.sender) === -1) {
      person.recommenders.push(record.sender);
    }
    return person;
  }

  /**
   * @param {Array} messages   פלט PFWhatsApp.parseChat
   * @param {Object} filesByKey  מפתח שם קובץ מנורמל -> {name, cards: [vCard]}
   * @returns {{people: Array, warnings: Array, stats: Object}}
   */
  function classify(messages, filesByKey) {
    annotate(messages);

    var cardIndexes = [];
    messages.forEach(function (m, i) { if (m.isContactCard) cardIndexes.push(i); });

    var contexts = {};
    cardIndexes.forEach(function (i) {
      contexts[i] = contextSignals(messages, i, baseName(messages[i].attachment));
    });

    var assigned = assignCards(messages, cardIndexes, filesByKey, contexts);

    var people = [];
    var byKey = {};

    cardIndexes.forEach(function (i) {
      var msg = messages[i];
      var info = assigned.assignment[i] || { cards: [], missing: 'nofile' };
      var cards = info.cards.length ? info.cards : [null];
      var fallbackName = baseName(msg.attachment);

      cards.forEach(function (card) {
        var displayName = (card && card.displayName) || fallbackName;
        var collector = contextSignals(messages, i, displayName);
        var nameText = card
          ? [fallbackName, card.professionText].filter(Boolean).join(' | ')
          : fallbackName;
        collector.add('name', SIGNAL.name, nameText,
          { text: nameText, sender: msg.sender, date: msg.date });

        var r = collector.result();
        mergeInto(people, byKey, {
          name: displayName,
          phones: card ? card.phones : [],
          phoneMissing: !card || !card.phones.length,
          categoryId: r.categoryId,
          confidence: r.confidence,
          ambiguous: r.ambiguous,
          ranked: r.ranked,
          evidence: collector.evidence,
          sender: msg.sender,
          date: msg.date
        });
      });
    });

    // תחום משני נרשם רק כשהכרטיס עצמו מעיד עליו (שם או תיאור עסקי).
    // הקשר השיחה סביב הכרטיס רועש מדי מכדי להוסיף לאדם תחום נוסף.
    people.forEach(function (p) {
      p.secondaryCategories = (p.ranked || [])
        .filter(function (r) {
          return r.categoryId !== p.categoryId && r.confidence >= 0.5 &&
            r.types && r.types.indexOf('name') !== -1;
        })
        .map(function (r) { return r.categoryId; });
    });

    people.sort(function (a, b) {
      return b.sharedCount - a.sharedCount || b.confidence - a.confidence;
    });

    var stats = {
      cardMessages: cardIndexes.length,
      people: people.length,
      high: people.filter(function (p) { return p.confidence >= 0.7; }).length,
      medium: people.filter(function (p) { return p.confidence >= 0.45 && p.confidence < 0.7; }).length,
      low: people.filter(function (p) { return p.confidence < 0.45; }).length,
      missingPhone: people.filter(function (p) { return p.phoneMissing; }).length
    };

    return { people: people, warnings: assigned.warnings, stats: stats };
  }

  var api = { classify: classify, baseName: baseName, REQUEST: REQUEST, SIGNAL: SIGNAL };
  global.PFClassify = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
