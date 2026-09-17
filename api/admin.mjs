/*
 * admin.js — מצב הקבוצה עבור מסך האדמין.
 */
import { isToken, hashToken } from './_tokens.mjs';
import { readJson, adminPath } from './_store.mjs';
import { json, notFound, methodGuard, origin } from './_http.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  const token = req.query && req.query.t;
  if (!isToken(token)) return notFound(res);

  const record = await readJson(adminPath(hashToken(token)));
  if (!record) return notFound(res);

  return json(res, 200, {
    groupName: record.groupName,
    updatedAt: record.updatedAt,
    peopleCount: record.peopleCount || 0,
    viewUrl: `${origin(req)}/g/${record.viewToken}`
  });
}
