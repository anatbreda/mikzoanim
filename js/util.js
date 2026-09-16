/*
 * util.js — עזרי טקסט, טלפון ותאריך.
 *
 * הערה על סימני כיווניות: ייצוא ווטסאפ בעברית משובץ בתווי RLM/LRM/isolate
 * (‏ ‎ ⁦ ⁩). הם בלתי נראים אבל שוברים כל השוואת מחרוזות — למשל שם הקובץ
 * "‏2 אנשי קשר.vcf" בצ'אט מול אותו שם בתוך ה-ZIP. לכן מנקים משני הצדדים.
 */
(function (global) {
  'use strict';

  var BIDI = /[‎‏‪-‮⁦-⁩﻿]/g;
  var NIQQUD = /[֑-ׇ]/g;
  var HEB = 'א-ת';

  /** מסיר סימני כיווניות, BOM ורווחים קשיחים. שומר על הטקסט הנראה לעין. */
  function clean(text) {
    return String(text == null ? '' : text)
      .replace(BIDI, '')
      .replace(/ /g, ' ')
      .replace(/\r\n?/g, '\n');
  }

  /** נרמול לצורך חיפוש והשוואה: בלי ניקוד, בלי פיסוק, אותיות קטנות. */
  function foldForSearch(text) {
    return clean(text)
      .replace(NIQQUD, '')
      .replace(/["'’׳״`]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** מפתח יציב להשוואת שמות קבצים בין הצ'אט ל-ZIP. */
  function fileKey(name) {
    return clean(name).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * נרמול מספר טלפון ישראלי.
   * מקבל +972 50-123-4567 / 00972501234567 / 050-1234567 / 0501234567.
   * @returns {?{digits: string, local: string, e164: string}}
   */
  function normalizePhone(raw) {
    var s = clean(raw).replace(/[^\d+]/g, '');
    if (!s) return null;
    s = s.replace(/^\+/, '');
    if (s.indexOf('00972') === 0) s = s.slice(5);
    else if (s.indexOf('972') === 0) s = s.slice(3);
    else if (s.charAt(0) === '0') s = s.slice(1);
    else if (s.length === 9 || s.length === 8) { /* כבר בלי אפס מוביל */ }
    else return null;

    if (!/^\d+$/.test(s)) return null;

    // מספר ארצי תקין: 9 ספרות (נייד 05X, שירות 07X) או 8 (קווי 0X).
    if (s.length === 9) {
      if (!/^(5\d|7[2-9])/.test(s)) return null;
    } else if (s.length === 8) {
      if (!/^[23489]/.test(s)) return null;
    } else {
      return null;
    }

    var digits = '0' + s;
    var local = s.length === 9
      ? digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6)
      : digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
    return { digits: digits, local: local, e164: '+972' + s };
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  var MONTHS_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי',
    'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

  /** "14 באוג׳ 2026, 16:13" — תצוגה קצרה בעברית. */
  function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return date.getDate() + ' ב' + MONTHS_HE[date.getMonth()] + '׳ ' +
      date.getFullYear() + ', ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  var api = {
    clean: clean,
    foldForSearch: foldForSearch,
    fileKey: fileKey,
    normalizePhone: normalizePhone,
    escapeHtml: escapeHtml,
    escapeRegExp: escapeRegExp,
    formatDate: formatDate,
    HEB: HEB
  };

  global.PFUtil = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
