/*
 * whatsapp.js — פענוח קובץ הצ'אט המיוצא לרשימת הודעות.
 *
 * נתמכים שני הפורמטים:
 *   אנדרואיד:  12/03/2024, 14:23 - שולח: טקסט
 *   אייפון:    [12/03/2024, 14:23:45] שולח: טקסט
 *
 * סדר התאריך (יום/חודש מול חודש/יום) משתנה לפי אזור המכשיר שממנו ייצאו,
 * ולכן הוא מזוהה אוטומטית מכל הקובץ ולא מונח מראש.
 */
(function (global) {
  'use strict';

  // טעינת תלויות ב-Node; בדפדפן הן כבר נטענו כתגי script לפי הסדר.
  if (typeof module === 'object' && module.exports) {
    if (!global.PFUtil) require('./util.js');
  }

  var ANDROID = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap]\.?[Mm]\.?)?\s+-\s+([\s\S]*)$/;
  var IOS = /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap]\.?[Mm]\.?)?\]\s*([\s\S]*)$/;

  var SENDER = /^([^\n]{1,60}?):\s([\s\S]*)$/;

  var VCF_PATTERNS = [
    /<attached:\s*([^>]+\.vcf)\s*>/i,
    /<מצורף:\s*([^>]+\.vcf)\s*>/,
    /([^\n<>|]+?\.vcf)\s*\((?:file attached|קובץ מצורף)\)/i,
    /([^\n<>|]+?\.vcf)\s*[•·]/,
    /([^\n<>|:]+?\.vcf)/i
  ];

  var OMITTED = /<(?:Media omitted|image omitted|video omitted|audio omitted|sticker omitted|document omitted|המדיה הושמטה|תמונה הושמטה|סרטון הושמט)>/i;
  var DELETED = /(?:This message was deleted|You deleted this message|ההודעה הזאת נמחקה|מחקת את ההודעה)/i;

  function header(line) {
    var m = IOS.exec(line);
    if (m) return { m: m, ios: true };
    m = ANDROID.exec(line);
    if (m) return { m: m, ios: false };
    return null;
  }

  /** מזהה אם הקובץ כתוב כיום/חודש או חודש/יום, לפי כל הכותרות יחד. */
  function detectDateOrder(lines) {
    var firstOver12 = 0, secondOver12 = 0;
    for (var i = 0; i < lines.length; i++) {
      var h = header(lines[i]);
      if (!h) continue;
      var a = parseInt(h.m[1], 10), b = parseInt(h.m[2], 10);
      if (a > 12) firstOver12++;
      if (b > 12) secondOver12++;
    }
    if (firstOver12 > secondOver12) return 'DMY';
    if (secondOver12 > firstOver12) return 'MDY';
    return 'DMY'; // ברירת מחדל ישראלית
  }

  function toDate(m, order) {
    var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    var day = order === 'MDY' ? b : a;
    var month = order === 'MDY' ? a : b;
    var year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    var hour = parseInt(m[4], 10);
    var minute = parseInt(m[5], 10);
    var second = m[6] ? parseInt(m[6], 10) : 0;
    var ampm = m[7] ? m[7].toLowerCase().replace(/\./g, '') : '';
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, minute, second);
  }

  function splitSender(text) {
    var m = SENDER.exec(text);
    if (!m) return { sender: null, body: text };
    var candidate = m[1];
    // הודעת מערכת או משפט שמתחיל במילה ונקודתיים — לא שם שולח.
    if (/[?!]|https?:/i.test(candidate)) return { sender: null, body: text };
    return { sender: candidate.trim(), body: m[2] };
  }

  function findAttachment(body) {
    for (var i = 0; i < VCF_PATTERNS.length; i++) {
      var m = VCF_PATTERNS[i].exec(body);
      if (m) return m[1].trim();
    }
    return null;
  }

  /**
   * @returns {{messages: Array, meta: Object}}
   */
  function parseChat(text) {
    var lines = global.PFUtil.clean(text).split('\n');
    var order = detectDateOrder(lines);
    var messages = [];
    var meta = { dateOrder: order, omitted: 0, deleted: 0, contactCards: 0, total: 0 };

    lines.forEach(function (line) {
      var h = header(line);
      if (!h) {
        if (messages.length) messages[messages.length - 1].body += '\n' + line;
        return;
      }
      var rest = h.m[8];
      var parts = splitSender(rest);
      messages.push({
        index: messages.length,
        date: toDate(h.m, order),
        sender: parts.sender,
        body: parts.body,
        isSystem: !parts.sender
      });
    });

    messages.forEach(function (msg) {
      msg.body = msg.body.replace(/\s+$/, '');
      msg.isOmitted = OMITTED.test(msg.body);
      msg.isDeleted = DELETED.test(msg.body);
      msg.attachment = msg.isSystem ? null : findAttachment(msg.body);
      msg.isContactCard = !!(msg.attachment && /\.vcf$/i.test(msg.attachment));
      // הטקסט של הודעת כרטיס הוא שם הקובץ בלבד — אין בו כיתוב אמיתי.
      msg.text = msg.isContactCard ? '' : msg.body;

      meta.total++;
      if (msg.isOmitted) meta.omitted++;
      if (msg.isDeleted) meta.deleted++;
      if (msg.isContactCard) meta.contactCards++;
    });

    return { messages: messages, meta: meta };
  }

  var api = { parseChat: parseChat };
  global.PFWhatsApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
