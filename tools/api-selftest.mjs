#!/usr/bin/env node
/*
 * api-selftest.mjs — בדיקות לשכבת השרת.
 * הרצה:  node tools/api-selftest.mjs
 *
 * נפרד מ-selftest.js כי קוד השרת הוא ESM והמנוע הוא CommonJS.
 */
import { newToken, isToken, hashToken, sameSecret } from '../api/_tokens.mjs';
import { sanitizePerson } from '../api/_sanitize.mjs';

let failures = 0;
let checks = 0;

function check(name, actual, expected) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`  ✗ ${name}\n      התקבל:  ${JSON.stringify(actual)}\n      ציפיתי: ${JSON.stringify(expected)}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

console.log('\nאסימונים');
const t = newToken();
check('אורך אסימון', t.length, 43);
check('אסימון חדש עובר אימות', isToken(t), true);
check('אסימונים שונים בכל קריאה', newToken() === newToken(), false);
check('גיבוב יציב', hashToken('abc'), hashToken('abc'));
check('אורך הגיבוב', hashToken(t).length, 64);

console.log('\nדחיית קלט פסול');
// הגיבוב הופך לנתיב קובץ, ולכן קלט חופשי אסור להגיע לשם בכלל.
[
  ['ריק', ''],
  ['null', null],
  ['מספר', 12345],
  ['קצר מדי', 'abc'],
  ['ארוך מדי', 'a'.repeat(44)],
  ['מעבר תיקיות', '../'.repeat(14) + 'x'],
  ['לוכסן בתוך האסימון', 'a'.repeat(21) + '/' + 'b'.repeat(21)],
  ['נקודות', 'a'.repeat(42) + '.']
].forEach(([label, value]) => check('נדחה: ' + label, isToken(value), false));

console.log('\nהשוואת סוד');
check('מפתח זהה', sameSecret('secret-key', 'secret-key'), true);
check('מפתח שונה', sameSecret('secret-key', 'secret-kez'), false);
check('אורך שונה', sameSecret('short', 'much-longer'), false);
check('לא מחרוזת', sameSecret(null, 'x'), false);

console.log('\nמה נשמר על השרת');
const full = {
  id: 'p_0501234567',
  name: 'שרון אדיבי חשמלאי',
  categoryId: 'electricity',
  secondaryCategories: ['handyman'],
  phones: [{ digits: '0501234567', local: '050-123-4567', e164: '+972501234567' }],
  sharedCount: 2,
  confidence: 0.92,
  notes: 'הגיע מהר',
  // אלה חייבים ליפול:
  evidence: [{ type: 'request', text: 'יש למישהי המלצה לחשמלאי?', sender: '+972 54-592-9369' }],
  recommenders: ['+972 54-810-4940'],
  aliases: ['שרון'],
  firstSeen: '2026-08-03T14:28:00.000Z'
};
const clean = sanitizePerson(full);

check('השם נשמר', clean.name, 'שרון אדיבי חשמלאי');
check('הטלפון נשמר', clean.phones[0].local, '050-123-4567');
check('התחום נשמר', clean.categoryId, 'electricity');
check('הראיות לא נשמרות', clean.evidence, undefined);
check('הממליצים לא נשמרים', clean.recommenders, undefined);
check('שמות נוספים לא נשמרים', clean.aliases, undefined);
check('תאריכים לא נשמרים', clean.firstSeen, undefined);
check('אין אף שדה מעבר לרשימת ההיתר',
  Object.keys(clean).sort(),
  ['categoryId', 'confidence', 'id', 'name', 'notes', 'phones', 'secondaryCategories', 'sharedCount']);

console.log('\nניקוי ערכים');
check('רשומה בלי שם נדחית', sanitizePerson({ name: '   ' }), null);
check('לא אובייקט נדחה', sanitizePerson('x'), null);
check('טלפון פסול מסונן',
  sanitizePerson({ name: 'א', phones: [{ digits: 'לא-מספר' }] }).phones, []);
check('ודאות מחוץ לטווח נחתכת',
  sanitizePerson({ name: 'א', confidence: 99 }).confidence, 1);
check('שם ארוך נחתך ל-120',
  sanitizePerson({ name: 'א'.repeat(500) }).name.length, 120);
check('תחום חסר הופך ל-other', sanitizePerson({ name: 'א' }).categoryId, 'other');

console.log('\n' + (failures
  ? `✗ ${failures} מתוך ${checks} בדיקות נכשלו`
  : `✓ כל ${checks} הבדיקות עברו`) + '\n');
process.exit(failures ? 1 : 0);
