/*
 * delete.js — האדמין מוחק את הקבוצה.
 *
 * נמחקות שתי הרשומות, כך שגם קישור החיפוש שכבר הופץ מפסיק להחזיר משהו.
 */
import { isToken, hashToken } from './_tokens.mjs';
import { readJson, removeJson, adminPath, publicPath } from './_store.mjs';
import { json, notFound, methodGuard, readBody } from './_http.mjs';

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

  await removeJson(publicPath(hashToken(record.viewToken)));
  await removeJson(key);

  return json(res, 200, { deleted: true });
}
