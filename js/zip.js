/*
 * zip.js — קורא ZIP מינימלי, בלי ספריות חיצוניות.
 *
 * בדפדפן הפריסה נעשית ב-DecompressionStream('deflate-raw') המובנה, וב-Node
 * ב-zlib.inflateRawSync. כך אותו קוד רץ בשני המקומות ואין תלות ב-JSZip —
 * בדיוק כמו שאר הריפו, שהוא וניל לגמרי.
 */
(function (global) {
  'use strict';

  var EOCD_SIG = 0x06054b50;
  var CD_SIG = 0x02014b50;
  var LOCAL_SIG = 0x04034b50;

  function findEOCD(view, len) {
    var max = Math.min(len, 22 + 0xFFFF);
    for (var i = 22; i <= max; i++) {
      var pos = len - i;
      if (view.getUint32(pos, true) === EOCD_SIG) return pos;
    }
    return -1;
  }

  // ווטסאפ מסמן את דגל ה-UTF-8 ומשתמש בו לשמות בעברית. ZIP ישן היה יכול
  // לכתוב CP437, אבל לא בייצוא שאנחנו קוראים, ולכן מפענחים תמיד כ-UTF-8.
  function decodeName(bytes) {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return String.fromCharCode.apply(null, bytes);
    }
  }

  function inflateRaw(bytes) {
    if (typeof module === 'object' && module.exports) {
      return Promise.resolve(new Uint8Array(require('zlib').inflateRawSync(Buffer.from(bytes))));
    }
    if (typeof global.DecompressionStream !== 'function') {
      return Promise.reject(new Error(
        'הדפדפן הזה לא תומך בפריסת ZIP. אפשר לחלץ את הקובץ ידנית ולגרור את התיקייה.'));
    }
    var ds = new global.DecompressionStream('deflate-raw');
    var stream = new Response(bytes).body.pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function isZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B;
  }

  /**
   * @param {ArrayBuffer} buffer
   * ייצוא של קבוצה ותיקה מכיל מאות תמונות. אנחנו צריכים רק את קובץ הצ'אט
   * ואת כרטיסי אנשי הקשר, ולכן `wanted` מאפשר לדלג על פריסת כל השאר:
   * רשומה שלא נבחרה מוחזרת עם שמה בלבד ובלי תוכן, כדי שעדיין אפשר יהיה
   * לספור מה היה בארכיון בלי לשלם על הזיכרון.
   *
   * @param {ArrayBuffer} buffer
   * @param {?function(string): boolean} wanted
   * @returns {Promise<Array<{name: string, bytes: ?Uint8Array}>>}
   */
  function readZip(buffer, wanted) {
    var all = new Uint8Array(buffer);
    var view = new DataView(buffer);
    var eocd = findEOCD(view, all.length);
    if (eocd === -1) return Promise.reject(new Error('הקובץ לא נראה כמו ZIP תקין.'));

    var count = view.getUint16(eocd + 10, true);
    var cdOffset = view.getUint32(eocd + 16, true);
    if (cdOffset === 0xFFFFFFFF) {
      return Promise.reject(new Error('קובץ ZIP64 לא נתמך. אפשר לחלץ ידנית ולגרור את הקבצים.'));
    }

    var jobs = [];
    var p = cdOffset;
    for (var i = 0; i < count && p + 46 <= all.length; i++) {
      if (view.getUint32(p, true) !== CD_SIG) break;
      var method = view.getUint16(p + 10, true);
      var compSize = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var localOffset = view.getUint32(p + 42, true);
      var name = decodeName(all.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;

      if (/\/$/.test(name)) continue; // תיקייה
      if (view.getUint32(localOffset, true) !== LOCAL_SIG) continue;
      var lNameLen = view.getUint16(localOffset + 26, true);
      var lExtraLen = view.getUint16(localOffset + 28, true);
      var dataStart = localOffset + 30 + lNameLen + lExtraLen;

      if (wanted && !wanted(name)) {
        jobs.push(Promise.resolve({ name: name, bytes: null }));
        continue;
      }

      var data = all.subarray(dataStart, dataStart + compSize);
      jobs.push(
        method === 0
          ? Promise.resolve({ name: name, bytes: data })
          : inflateRaw(data).then(function (n) {
            return function (out) { return { name: n, bytes: out }; };
          }(name))
      );
    }
    return Promise.all(jobs);
  }

  function toText(bytes) {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return String.fromCharCode.apply(null, bytes);
    }
  }

  var api = { readZip: readZip, isZip: isZip, toText: toText };
  global.PFZip = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
