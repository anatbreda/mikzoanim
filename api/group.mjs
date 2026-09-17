/*
 * group.js — מה שחברי הקבוצה מקבלים. קריאה בלבד.
 */
import { isToken, hashToken } from './_tokens.mjs';
import { readJson, publicPath } from './_store.mjs';
import { json, notFound, methodGuard } from './_http.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  const token = req.query && req.query.t;
  if (!isToken(token)) return notFound(res);

  const directory = await readJson(publicPath(hashToken(token)));
  if (!directory) return notFound(res);

  return json(res, 200, directory);
}
