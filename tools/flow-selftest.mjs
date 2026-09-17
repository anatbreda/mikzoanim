#!/usr/bin/env node
/*
 * flow-selftest.mjs — המסלול המלא ובדיקות ההרשאה, בלי רשת.
 * הרצה:  node tools/flow-selftest.mjs
 *
 * מריץ את מטפלי הבקשות האמיתיים מול מימוש אחסון בזיכרון. זה מה ש-_store.mjs
 * נבנה בשבילו: הוא הגבול היחיד שיודע על Vercel Blob, ולכן אפשר להחליף אותו
 * ולבדוק את כל השאר כמו שהוא.
 */
import { mkdtempSync, copyFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'api');

/*
 * המטפלים מיובאים מעותק בתיקייה זמנית, שבה _store.mjs מוחלף במימוש
 * בזיכרון. כל שאר הקבצים הם המקוריים בדיוק, והייבוא ביניהם יחסי — כך
 * שנבדק הקוד האמיתי ולא חיקוי שלו, בלי דגלים ניסיוניים ובלי רשת.
 */
const sandbox = mkdtempSync(join(tmpdir(), 'mikzoanim-flow-'));
readdirSync(apiDir)
  .filter((f) => f.endsWith('.mjs') && f !== '_store.mjs')
  .forEach((f) => copyFileSync(join(apiDir, f), join(sandbox, f)));

writeFileSync(join(sandbox, '_store.mjs'), `
export const memory = new Map();
export async function readJson(p) { return memory.has(p) ? JSON.parse(memory.get(p)) : null; }
export async function writeJson(p, data) { memory.set(p, JSON.stringify(data)); }
export async function removeJson(p) { memory.delete(p); }
export const adminPath = (h) => 'adm/' + h + '.json';
export const publicPath = (h) => 'pub/' + h + '.json';
`);

const load = async (name) =>
  (await import(pathToFileURL(join(sandbox, name)).href));

process.env.OWNER_KEY = 'test-owner-key';

const { memory } = await load('_store.mjs');
const createGroup = (await load('create-group.mjs')).default;
const adminStatus = (await load('admin.mjs')).default;
const publish = (await load('publish.mjs')).default;
const readGroup = (await load('group.mjs')).default;
const removeGroup = (await load('delete.mjs')).default;

process.on('exit', () => rmSync(sandbox, { recursive: true, force: true }));

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

/** מדמה בקשה ותשובה של Vercel ומחזיר {status, body}. */
async function call(handler, { method = 'GET', query = {}, body = null } = {}) {
  const req = {
    method,
    query,
    body: body || undefined,
    headers: { host: 'example.test', 'x-forwarded-proto': 'https' }
  };
  let status = 200;
  let payload = '';
  const res = {
    status(code) { status = code; return res; },
    setHeader() {},
    end(text) { payload = text; }
  };
  await handler(req, res);
  return { status, body: payload ? JSON.parse(payload) : null };
}

const tokenOf = (url) => url.split('/').pop();
const FAKE = 'z'.repeat(43);

console.log('\nמסלול מלא');

const created = await call(createGroup, {
  method: 'POST',
  body: { ownerKey: 'test-owner-key', groupName: 'אמהות שכונת הדר' }
});
check('פתיחת קבוצה מצליחה', created.status, 200);
const adminToken = tokenOf(created.body.adminUrl);
const viewToken = tokenOf(created.body.viewUrl);
check('קישור אדמין בצורה הנכונה', /^https:\/\/example\.test\/a\/[A-Za-z0-9_-]{43}$/.test(created.body.adminUrl), true);
check('קישור צפייה בצורה הנכונה', /^https:\/\/example\.test\/g\/[A-Za-z0-9_-]{43}$/.test(created.body.viewUrl), true);
check('שני האסימונים שונים', adminToken === viewToken, false);

// לפני פרסום, קישור הצפייה לא מחזיר כלום
check('קישור צפייה ריק לפני פרסום',
  (await call(readGroup, { query: { t: viewToken } })).status, 404);

const people = [{
  id: 'p_0501234567',
  name: 'שרון אדיבי חשמלאי',
  categoryId: 'electricity',
  secondaryCategories: [],
  phones: [{ digits: '0501234567', local: '050-123-4567', e164: '+972501234567' }],
  sharedCount: 2,
  confidence: 0.92,
  notes: '',
  evidence: [{ type: 'request', text: 'יש למישהי המלצה לחשמלאי?' }],
  recommenders: ['+972 54-810-4940']
}];

const published = await call(publish, {
  method: 'POST',
  body: { adminToken, groupName: 'אמהות שכונת הדר', people }
});
check('פרסום מצליח', published.status, 200);
check('מספר הרשומות שפורסמו', published.body.published, 1);

const viewed = await call(readGroup, { query: { t: viewToken } });
check('קישור הצפייה מחזיר את המדריך', viewed.status, 200);
check('השם הגיע', viewed.body.people[0].name, 'שרון אדיבי חשמלאי');
check('הטלפון הגיע', viewed.body.people[0].phones[0].local, '050-123-4567');
check('שם הקבוצה הגיע', viewed.body.groupName, 'אמהות שכונת הדר');

console.log('\nמה לא הגיע לאחסון');
check('ראיות לא נשמרו', viewed.body.people[0].evidence, undefined);
check('ממליצים לא נשמרו', viewed.body.people[0].recommenders, undefined);
check('אין ראיות בשום מקום באחסון',
  [...memory.values()].some((v) => v.includes('המלצה לחשמלאי')), false);
check('אין מספרי חברי קבוצה באחסון',
  [...memory.values()].some((v) => v.includes('54-810-4940')), false);

console.log('\nמסך האדמין');
const status = await call(adminStatus, { query: { t: adminToken } });
check('האדמין רואה את מצב הקבוצה', status.status, 200);
check('האדמין מקבל את קישור הצפייה', tokenOf(status.body.viewUrl), viewToken);
check('הספירה מעודכנת', status.body.peopleCount, 1);

console.log('\nהרשאות — כל אלה חייבות להיכשל');
check('פתיחת קבוצה עם מפתח שגוי',
  (await call(createGroup, { method: 'POST', body: { ownerKey: 'wrong', groupName: 'x' } })).status, 404);
check('פתיחת קבוצה בלי מפתח',
  (await call(createGroup, { method: 'POST', body: { groupName: 'x' } })).status, 404);
check('פרסום עם אסימון שגוי',
  (await call(publish, { method: 'POST', body: { adminToken: FAKE, people } })).status, 404);
// הכשל המסוכן ביותר: חבר קבוצה שמנסה להשתמש באסימון שלו כדי לפרסם
check('פרסום עם אסימון צפייה במקום אדמין',
  (await call(publish, { method: 'POST', body: { adminToken: viewToken, people } })).status, 404);
check('קריאה עם אסימון שגוי',
  (await call(readGroup, { query: { t: FAKE } })).status, 404);
check('קריאה עם אסימון אדמין במקום צפייה',
  (await call(readGroup, { query: { t: adminToken } })).status, 404);
check('מחיקה עם אסימון שגוי',
  (await call(removeGroup, { method: 'POST', body: { adminToken: FAKE } })).status, 404);
check('מצב אדמין עם אסימון צפייה',
  (await call(adminStatus, { query: { t: viewToken } })).status, 404);
check('שיטה שגויה נדחית',
  (await call(publish, { method: 'GET' })).status, 405);

console.log('\nמחיקה');
const deleted = await call(removeGroup, { method: 'POST', body: { adminToken } });
check('המחיקה מצליחה', deleted.status, 200);
check('קישור הצפייה מפסיק לעבוד',
  (await call(readGroup, { query: { t: viewToken } })).status, 404);
check('קישור האדמין מפסיק לעבוד',
  (await call(adminStatus, { query: { t: adminToken } })).status, 404);
check('לא נשאר כלום באחסון', memory.size, 0);

console.log('\n' + (failures
  ? `✗ ${failures} מתוך ${checks} בדיקות נכשלו`
  : `✓ כל ${checks} הבדיקות עברו`) + '\n');
process.exit(failures ? 1 : 0);
