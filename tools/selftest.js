#!/usr/bin/env node
/*
 * selftest.js — בדיקות על מקרי הקצה שנמצאו בייצוא אמיתי של ווטסאפ.
 * הרצה:  node pro-finder/tools/selftest.js
 * כל המספרים כאן בדויים.
 */
'use strict';

require('../js/util.js');
require('../js/professions.js');
require('../js/vcard.js');
require('../js/zip.js');
require('../js/whatsapp.js');
require('../js/classify.js');
require('../js/pipeline.js');

var failures = 0;
var checks = 0;

function check(name, actual, expected) {
  checks++;
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log('  ✗ ' + name + '\n      התקבל:  ' + JSON.stringify(actual) +
      '\n      ציפיתי: ' + JSON.stringify(expected));
  } else {
    console.log('  ✓ ' + name);
  }
}

function entry(name, text) {
  return { name: name, bytes: Buffer.from(text, 'utf8') };
}

function personNamed(res, needle) {
  return res.people.filter(function (p) { return p.name.indexOf(needle) !== -1; })[0];
}

/* ------------------------- 1. נרמול טלפון ------------------------- */

console.log('\nנרמול טלפון');
var phone = PFUtil.normalizePhone;
check('+972 עם מקפים', phone('+972 50-123-4567').digits, '0501234567');
check('waid בלי סימנים', phone('+972501234567').digits, '0501234567');
check('00972', phone('00972500008888').digits, '0500008888');
check('מקומי עם מקפים', phone('050-123-4567').local, '050-123-4567');
check('קווי', phone('03-1234567').local, '03-123-4567');
check('קצר מדי נפסל', phone('0312345'), null);
check('לא מספר נפסל', phone('לא מספר'), null);

/* ------------------------- 2. פענוח vCard ------------------------- */

console.log('\nפענוח vCard');

// END:VCARD ו-BEGIN:VCARD בלי שורה חדשה ביניהם — כך ווטסאפ כותב קובץ רב-כרטיסי.
var glued =
  'BEGIN:VCARD\nVERSION:3.0\nFN:אבי הנגר\nTEL;waid=972500001111:+972 50-000-1111\nEND:VCARD' +
  'BEGIN:VCARD\nVERSION:3.0\nFN:רונית הגננת\nTEL;waid=972500002222:+972 50-000-2222\nEND:VCARD';
var glueCards = PFVCard.parseVCards(glued);
check('שני כרטיסים בלי שורה חדשה', glueCards.length, 2);
check('שם הכרטיס השני', glueCards[1].displayName, 'רונית הגננת');

// כרטיס כפול של אותו אדם בתוך קובץ אחד מאוחד לרשומה אחת.
var dup =
  'BEGIN:VCARD\nFN:דנה\nTEL;waid=972500003333:+972 50-000-3333\nEND:VCARD' +
  'BEGIN:VCARD\nFN:דנה\nTEL;type=CELL;waid=972500003333:+972 50-000-3333\nEND:VCARD';
check('כרטיס כפול מאוחד', PFVCard.parseVCards(dup).length, 1);

// גלישת שורה לפי התקן (רווח מוביל) — כך נכתבים ערכי base64 ארוכים.
var folded = 'BEGIN:VCARD\nFN:יעל\nNOTE:שורה\n ארוכה\nTEL:0500004444\nEND:VCARD';
check('גלישת שורה מסירה רווח מוביל אחד', PFVCard.parseVCards(folded)[0].note, 'שורהארוכה');
check('רווח שני נשאר בתוכן',
  PFVCard.parseVCards(folded.replace('\n ארוכה', '\n  ארוכה'))[0].note, 'שורה ארוכה');

// ערך רב-שורתי בלי רווח מוביל — ווטסאפ כותב כך תיאור עסקי.
var wrapped = 'BEGIN:VCARD\nFN:נועה\nX-WA-BIZ-DESCRIPTION:מאפרת\nלאירועים\nTEL:0500005555\nEND:VCARD';
check('המשך ערך בלי רווח מוביל', PFVCard.parseVCards(wrapped)[0].bizDescription, 'מאפרת\nלאירועים');

// QUOTED-PRINTABLE — נפוץ בייצוא מאייפון.
var qp = 'BEGIN:VCARD\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=90=D7=91=D7=99\nTEL:0500006666\nEND:VCARD';
check('פענוח quoted-printable', PFVCard.parseVCards(qp)[0].displayName, 'אבי');
check('PHOTO מדולג', PFVCard.parseVCards(
  'BEGIN:VCARD\nFN:x\nPHOTO;BASE64:AAAA\nTEL:0500007777\nEND:VCARD')[0].phones.length, 1);

/* ------------------------- 3. סדר תאריך ------------------------- */

console.log('\nזיהוי סדר תאריך');
var mdy = PFWhatsApp.parseChat('5/28/26, 10:00 - א: שלום\n6/2/26, 11:00 - ב: היי');
check('רכיב שני > 12 מזוהה כחודש/יום', mdy.meta.dateOrder, 'MDY');
check('התאריך שפוענח', mdy.messages[0].date.getMonth() + 1, 5);
var dmy = PFWhatsApp.parseChat('28/5/26, 10:00 - א: שלום\n2/6/26, 11:00 - ב: היי');
check('רכיב ראשון > 12 מזוהה כיום/חודש', dmy.meta.dateOrder, 'DMY');
var ios = PFWhatsApp.parseChat('[28/5/2026, 10:00:05] אנה: ‎<attached: 00000042-רון החשמלאי.vcf>');
check('כותרת בפורמט אייפון', ios.messages[0].sender, 'אנה');
check('קובץ מצורף בפורמט אייפון', ios.messages[0].attachment, '00000042-רון החשמלאי.vcf');
check('תחילית מספרית מנוקה מהשם המוצג',
  PFClassify.baseName(ios.messages[0].attachment), 'רון החשמלאי');
check('הודעה רב-שורתית מתחברת',
  PFWhatsApp.parseChat('1/2/26, 10:00 - א: שורה\nהמשך').messages[0].body, 'שורה\nהמשך');

/* ------------------------- 4. מילים חלשות ------------------------- */

console.log('\nדירוג מילות מפתח');
check('מקצוע גובר על אירוע',
  PFProfessions.bestPerCategory('זקוקה למאפרת לקראת בר מצווה')[0].categoryId, 'makeup');
check('צירוף ארוך גובר על מילה שבתוכו',
  PFProfessions.bestPerCategory('מתקן תריסים חשמליים')[0].categoryId, 'shutters');
check('צורת הכלה מגדרית',
  PFProfessions.bestPerCategory('המלצה לרופא/ת שיניים')[0].categoryId, 'dental');
check('תחילית עברית',
  PFProfessions.bestPerCategory('אשמח לחשמלאי')[0].categoryId, 'electricity');

/* ------------------------- 5. סיווג מקצה לקצה ------------------------- */

console.log('\nסיווג מקצה לקצה');

var chat = [
  '6/7/26, 14:04 - +972 50-000-0001: מישהי יודעת על סדנת בישול לגילאי חטיבה?',
  '6/7/26, 14:13 - +972 50-000-0002: היי אשמח לכמלצה על שיננית',
  '6/7/26, 14:17 - +972 50-000-0003: יש קייטנות בישול של כמה ימים',
  '6/7/26, 14:18 - +972 50-000-0001: להדס אין, דיברתי איתה',
  '6/7/26, 14:24 - +972 50-000-0003: יש סדנאות בישול במרכז נינא',
  '6/7/26, 14:25 - +972 50-000-0004: מירי לוי שיננית.vcf (file attached)',
  '6/8/26, 09:00 - +972 50-000-0005: המלצה לבייביסיטר לערב?',
  '6/8/26, 09:04 - +972 50-000-0006: ברקי.vcf (file attached)',
  '6/9/26, 10:00 - +972 50-000-0007: יש למישהי את הוואטסאפ של אלמה וארנון?',
  '6/9/26, 10:01 - +972 50-000-0008: אלמה וארנון.vcf (file attached)',
  '6/10/26, 12:00 - +972 50-000-0009: אשמח להמלצה על ירקות במשלוח',
  '6/10/26, 12:05 - +972 50-000-0010: ‏2 אנשי קשר.vcf (file attached)',
  '6/11/26, 08:00 - +972 50-000-0011: המלצה לרופא/ת שיניים לילדים?',
  '6/11/26, 08:02 - +972 50-000-0010: ‏2 אנשי קשר.vcf (file attached)',
  '6/12/26, 08:00 - +972 50-000-0012: <Media omitted>',
  '6/12/26, 08:01 - +972 50-000-0013: This message was deleted'
].join('\n');

function card(fn, tel, extra) {
  return 'BEGIN:VCARD\nVERSION:3.0\nFN:' + fn + '\n' + (extra || '') +
    'TEL;waid=972' + tel.slice(1) + ':+972 ' + tel.slice(1, 3) + '-' + tel.slice(3, 6) +
    '-' + tel.slice(6) + '\nEND:VCARD';
}

var res = PFPipeline.fromEntries([
  entry('WhatsApp Chat with שכונה.txt', chat),
  entry('מירי לוי שיננית.vcf', card('מירי לוי שיננית', '0500000101')),
  entry('ברקי.vcf', card('ברקי', '0500000102')),
  entry('אלמה וארנון.vcf', card('אלמה וארנון', '0500000103')),
  // ווטסאפ שמר עותק אחד לשם הזה — זה של רופאת השיניים.
  entry('‏2 אנשי קשר.vcf', card('ד״ר שירה רופאת שיניים לילדים', '0500000104'))
]);

check('כל הכרטיסים זוהו', res.meta.contactCards, 5);
check('מדיה שהושמטה נספרה', res.meta.omitted, 1);
check('הודעה שנמחקה נספרה', res.meta.deleted, 1);

// המלכודת: הכרטיס יושב באמצע שרשור על סדנאות בישול, והבקשה הנכונה
// היא חמש הודעות אחורה. חיפוש "ההודעה הקודמת" היה נותן תשובה שגויה.
check('הכרטיס מסווג לפי הבקשה ולא לפי ההודעה הקודמת',
  personNamed(res, 'מירי לוי').categoryId, 'dental');

check('שם בלי מקצוע מסווג לפי הבקשה הסמוכה',
  personNamed(res, 'ברקי').categoryId, 'childcare');

// הבקשה הסמוכה מזכירה את שם איש הקשר ואין בה מקצוע — אסור להיגרר אחורה.
check('עוגן שם עוצר גרירה לבקשה ישנה',
  personNamed(res, 'אלמה וארנון').categoryId, 'other');

var dentist = personNamed(res, 'שירה');
var veg = personNamed(res, '2 אנשי קשר');
check('התנגשות שם קובץ: הכרטיס הוצמד להודעה התואמת', dentist.categoryId, 'dental');
check('התנגשות שם קובץ: הכרטיס הנכון קיבל טלפון', dentist.phones[0].digits, '0500000104');
check('התנגשות שם קובץ: הרשומה השנייה סומנה בלי טלפון', veg.phoneMissing, true);
check('התנגשות שם קובץ: הרשומה השנייה סווגה לפי ההקשר שלה', veg.categoryId, 'food');
check('נרשמה אזהרת התנגשות', res.warnings.length, 1);

check('מספר טלפון נשלף מהכרטיס',
  personNamed(res, 'מירי לוי').phones[0].local, '050-000-0101');
check('לכל שיוך יש ראיה',
  res.people.every(function (p) {
    return p.categoryId === 'other' || p.evidence.some(function (e) {
      return e.categoryId === p.categoryId;
    });
  }), true);

/* ------------------------- סיכום ------------------------- */

console.log('\n' + (failures ? '✗ ' + failures + ' מתוך ' + checks + ' בדיקות נכשלו'
  : '✓ כל ' + checks + ' הבדיקות עברו') + '\n');
process.exit(failures ? 1 : 0);
