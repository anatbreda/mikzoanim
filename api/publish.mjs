/*
 * publish.js — האדמין מפרסם את המדריך לקבוצה שלו.
 *
 * הקובץ מווטסאפ לא מגיע לכאן בכלל: הפענוח קורה בדפדפן של האדמין, ורק
 * הרשימה המזוקקת נשלחת.
 *
 * מה שנשמר נקבע ב-_sanitize.mjs, ברשימת היתר מפורשת.
 */
import { isToken, hashToken } from './_tokens.mjs';
import { readJson, writeJson, adminPath, publicPath } from './_store.mjs';
import { json, notFound, methodGuard, readBody, origin } from './_http.mjs';
import { sanitizePerson, MAX_PEOPLE, str } from './_sanitize.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'bad_request' });
  }

  if (!isToken(body.adminToken)) return notFound(res);

  const key = adminPath(hashToken(body.adminToken));
  const record = await readJson(key);
  if (!record) return notFound(res);

  if (!Array.isArray(body.people)) return json(res, 400, { error: 'people_required' });

  const people = body.people.slice(0, MAX_PEOPLE).map(sanitizePerson).filter(Boolean);
  if (!people.length) return json(res, 400, { error: 'people_empty' });

  const now = new Date().toISOString();
  const groupName = str(body.groupName, 80).trim() || record.groupName;

  await writeJson(publicPath(hashToken(record.viewToken)), {
    groupName: groupName,
    updatedAt: now,
    people: people
  });

  record.groupName = groupName;
  record.updatedAt = now;
  record.peopleCount = people.length;
  await writeJson(key, record);

  return json(res, 200, {
    published: people.length,
    updatedAt: now,
    viewUrl: `${origin(req)}/g/${record.viewToken}`
  });
}
