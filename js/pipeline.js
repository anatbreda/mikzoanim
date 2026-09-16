/*
 * pipeline.js — מחבר את החלקים: קבצים גולמיים -> רשימת בעלי מקצוע.
 * אותו קוד משמש את הדפדפן ואת כלי ה-CLI שב-tools/, כדי שלא יהיו שני מנועים.
 */
(function (global) {
  'use strict';

  // טעינת תלויות ב-Node; בדפדפן הן כבר נטענו כתגי script לפי הסדר.
  if (typeof module === 'object' && module.exports) {
    if (!global.PFUtil) require('./util.js');
    if (!global.PFProfessions) require('./professions.js');
    if (!global.PFVCard) require('./vcard.js');
    if (!global.PFZip) require('./zip.js');
    if (!global.PFWhatsApp) require('./whatsapp.js');
    if (!global.PFClassify) require('./classify.js');
  }

  function isChatFile(name) {
    return /\.txt$/i.test(name);
  }

  function isVCardFile(name) {
    return /\.vcf$/i.test(name);
  }

  function groupNameFrom(filename) {
    var m = /WhatsApp Chat with (.+)\.txt$/i.exec(global.PFUtil.clean(filename));
    return m ? m[1].trim() : '';
  }

  /**
   * @param {Array<{name: string, bytes: Uint8Array}>} entries
   */
  function fromEntries(entries) {
    var Z = global.PFZip, U = global.PFUtil, V = global.PFVCard;

    var chat = null;
    var filesByKey = {};
    var vcardFiles = 0;

    var skipped = 0;

    entries.forEach(function (e) {
      var name = e.name.replace(/^.*\//, ''); // מתעלמים מנתיב פנימי בזיפ
      if (!e.bytes) { skipped++; return; }     // רשומה שלא נפרסה בכוונה
      if (isChatFile(name)) {
        if (!chat || e.bytes.length > chat.bytes.length) {
          chat = { name: name, bytes: e.bytes };
        }
      } else if (isVCardFile(name)) {
        vcardFiles++;
        filesByKey[U.fileKey(name)] = { name: name, cards: V.parseVCards(Z.toText(e.bytes)) };
      }
    });

    if (!chat) {
      throw new Error('לא נמצא קובץ צ׳אט (.txt) בתוך הקובץ שנבחר.');
    }

    var parsed = global.PFWhatsApp.parseChat(Z.toText(chat.bytes));
    var result = global.PFClassify.classify(parsed.messages, filesByKey);

    result.meta = parsed.meta;
    result.meta.vcardFiles = vcardFiles;
    result.meta.skippedFiles = skipped;
    result.meta.groupName = groupNameFrom(chat.name);
    result.meta.importedAt = new Date().toISOString();
    return result;
  }

  function needed(name) {
    var base = name.replace(/^.*\//, '');
    return isChatFile(base) || isVCardFile(base);
  }

  /** @param {ArrayBuffer} buffer */
  function fromZip(buffer) {
    // רק הצ'אט וכרטיסי אנשי הקשר נפרסים. תמונות וסרטונים בארכיון נספרים
    // ומדולגים, אחרת ייצוא עם מדיה היה מפרק מאות קבצים לזיכרון לחינם.
    return global.PFZip.readZip(buffer, needed).then(fromEntries);
  }

  var api = { fromEntries: fromEntries, fromZip: fromZip };
  global.PFPipeline = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
