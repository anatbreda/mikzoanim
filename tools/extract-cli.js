#!/usr/bin/env node
/*
 * extract-cli.js — מריץ את אותו מנוע של האתר על קובץ ייצוא מקומי ומדפיס טבלה.
 * לאימות בלי דפדפן:  node pro-finder/tools/extract-cli.js <path-to-zip>
 * דגלים:  --evidence  הצגת הראיות לכל רשומה
 *         --json      פלט JSON גולמי
 * הכלי לא כותב קבצים.
 */
'use strict';

require('../js/util.js');
require('../js/professions.js');
require('../js/vcard.js');
require('../js/zip.js');
require('../js/whatsapp.js');
require('../js/classify.js');
require('../js/pipeline.js');

var fs = require('fs');
var path = process.argv[2];
var showEvidence = process.argv.indexOf('--evidence') !== -1;
var asJson = process.argv.indexOf('--json') !== -1;

if (!path) {
  console.error('שימוש: node pro-finder/tools/extract-cli.js <קובץ-ייצוא.zip>');
  process.exit(1);
}

var buf = fs.readFileSync(path);
var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

PFPipeline.fromZip(ab).then(function (res) {
  if (asJson) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  console.log('\nקבוצה: ' + (res.meta.groupName || '—'));
  console.log('הודעות: ' + res.meta.total +
    ' | כרטיסי איש קשר: ' + res.meta.contactCards +
    ' | קבצי vcf: ' + res.meta.vcardFiles +
    ' | סדר תאריך: ' + res.meta.dateOrder);
  console.log('מדיה שהושמטה: ' + res.meta.omitted + ' | הודעות שנמחקו: ' + res.meta.deleted);
  console.log('סווגו: ' + res.stats.high + ' גבוה, ' + res.stats.medium + ' בינוני, ' +
    res.stats.low + ' נמוך | בלי טלפון: ' + res.stats.missingPhone + '\n');

  console.log(pad('שם', 38) + pad('תחום', 24) + pad('ודאות', 8) +
    pad('טלפון', 14) + pad('×', 3) + 'אות מוביל');
  console.log('-'.repeat(110));

  res.people.forEach(function (p) {
    var cat = PFProfessions.get(p.categoryId);
    var top = p.evidence.filter(function (e) { return e.categoryId === p.categoryId; })
      .sort(function (a, b) { return b.confidence - a.confidence; })[0];
    console.log(
      pad(p.name, 38) +
      pad(cat.name + (p.ambiguous ? ' (?)' : ''), 24) +
      pad(p.confidence.toFixed(2), 8) +
      pad(p.phones.length ? p.phones[0].local : '— חסר', 14) +
      pad(p.sharedCount, 3) +
      (top ? top.type + ':' + top.keyword : '—')
    );
    if (showEvidence) {
      p.evidence.filter(function (e) { return e.categoryId === p.categoryId; })
        .forEach(function (e) {
          console.log('      [' + e.type + ' ' + e.confidence + '] ' +
            String(e.text).replace(/\n/g, ' ').slice(0, 90));
        });
    }
  });

  if (res.warnings.length) {
    console.log('\nאזהרות:');
    res.warnings.forEach(function (w) {
      if (w.type === 'collision') {
        console.log('  • "' + w.file + '" נשלח ' + w.count +
          ' פעמים אך ווטסאפ שמר עותק אחד — רק אחת הרשומות קיבלה טלפון.');
      }
    });
  }
  console.log('');
}).catch(function (err) {
  console.error('שגיאה:', err && err.message ? err.message : err);
  process.exit(1);
});
