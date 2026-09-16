/*
 * store.js — שמירה מקומית ב-localStorage.
 *
 * הנתונים האלה הם מספרי טלפון של אנשים אמיתיים מקבוצת ווטסאפ, ולכן הם
 * נשארים במכשיר בלבד ולא נשלחים לשום מקום ולא נכנסים לגיט.
 *
 * התיקונים הידניים (overrides) נשמרים בנפרד מתוצאת הייבוא, כך שייבוא חוזר
 * של ייצוא עדכני מהקבוצה לא ידרוס שינויים שנעשו ביד.
 */
(function (global) {
  'use strict';

  // טעינת תלויות ב-Node; בדפדפן הן כבר נטענו כתגי script לפי הסדר.
  if (typeof module === 'object' && module.exports) {
    if (!global.PFUtil) require('./util.js');
  }

  var KEY = 'profinder.v1';
  var VERSION = 1;
  var memoryFallback = null; // כשה-localStorage חסום (גלישה פרטית)

  function blank() {
    return { version: VERSION, importedAt: null, meta: null, warnings: [], people: [], overrides: {} };
  }

  function readRaw() {
    try {
      return global.localStorage.getItem(KEY);
    } catch (e) {
      return memoryFallback;
    }
  }

  function writeRaw(value) {
    try {
      global.localStorage.setItem(KEY, value);
    } catch (e) {
      memoryFallback = value;
    }
  }

  var state = null;

  function load() {
    if (state) return state;
    var raw = readRaw();
    if (!raw) {
      state = blank();
      return state;
    }
    try {
      var parsed = JSON.parse(raw);
      state = {
        version: VERSION,
        importedAt: parsed.importedAt || null,
        meta: parsed.meta || null,
        warnings: parsed.warnings || [],
        people: parsed.people || [],
        overrides: parsed.overrides || {}
      };
    } catch (e) {
      state = blank();
    }
    return state;
  }

  function save() {
    writeRaw(JSON.stringify(load()));
  }

  /** תאריכים נשמרים כמחרוזות ISO כדי לשרוד מעבר ב-JSON. */
  function serializePerson(p) {
    var out = {};
    Object.keys(p).forEach(function (k) {
      out[k] = p[k] instanceof Date ? p[k].toISOString() : p[k];
    });
    out.evidence = (p.evidence || []).map(function (e) {
      return {
        type: e.type, categoryId: e.categoryId, keyword: e.keyword,
        confidence: e.confidence, text: e.text, sender: e.sender,
        date: e.date instanceof Date ? e.date.toISOString() : e.date
      };
    });
    return out;
  }

  function setImport(result) {
    var s = load();
    s.people = result.people.map(serializePerson);
    s.meta = result.meta;
    s.warnings = result.warnings || [];
    s.importedAt = new Date().toISOString();
    save();
  }

  /** אנשים עם התיקונים הידניים מוחלים עליהם. */
  function people() {
    var s = load();
    return s.people.map(function (p) {
      var o = s.overrides[p.id];
      if (!o) return p;
      var merged = {};
      Object.keys(p).forEach(function (k) { merged[k] = p[k]; });
      if (o.categoryId) { merged.categoryId = o.categoryId; merged.manual = true; merged.ambiguous = false; }
      if (o.name) merged.name = o.name;
      if (o.notes != null) merged.notes = o.notes;
      if (o.phone) merged.phones = [global.PFUtil.normalizePhone(o.phone)].filter(Boolean);
      merged.hidden = !!o.hidden;
      return merged;
    }).filter(function (p) { return !p.hidden; });
  }

  function setOverride(id, patch) {
    var s = load();
    var o = s.overrides[id] || (s.overrides[id] = {});
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    save();
  }

  function clearOverride(id) {
    var s = load();
    delete s.overrides[id];
    save();
  }

  function hasData() {
    return load().people.length > 0;
  }

  function reset() {
    state = blank();
    save();
  }

  function exportJson() {
    return JSON.stringify(load(), null, 2);
  }

  function importJson(text) {
    var parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.people)) throw new Error('קובץ גיבוי לא תקין.');
    state = {
      version: VERSION,
      importedAt: parsed.importedAt || null,
      meta: parsed.meta || null,
      warnings: parsed.warnings || [],
      people: parsed.people,
      overrides: parsed.overrides || {}
    };
    save();
  }

  var api = {
    load: load, save: save, setImport: setImport, people: people,
    setOverride: setOverride, clearOverride: clearOverride,
    hasData: hasData, reset: reset, exportJson: exportJson, importJson: importJson,
    meta: function () { return load().meta; },
    warnings: function () { return load().warnings; },
    overrides: function () { return load().overrides; }
  };

  global.PFStore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
