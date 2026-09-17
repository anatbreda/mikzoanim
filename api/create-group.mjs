/*
 * create-group.js — פתיחת קבוצה חדשה. לבעלים בלבד.
 *
 * מייצר זוג אסימונים: אחד לאדמין שיעלה את הקובץ, ואחד לחברי הקבוצה
 * שיחפשו. רק רשומת האדמין נכתבת כאן; רשומת הצפייה נוצרת רק בפרסום,
 * כך שקישור חיפוש של קבוצה שעדיין לא פרסמה פשוט לא מוצא כלום.
 */
import { newToken, hashToken, sameSecret } from './_tokens.mjs';
import { writeJson, adminPath } from './_store.mjs';
import { json, notFound, methodGuard, readBody, origin } from './_http.mjs';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  const ownerKey = process.env.OWNER_KEY;
  if (!ownerKey) return json(res, 500, { error: 'owner_key_missing' });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'bad_request' });
  }

  if (!sameSecret(String(body.ownerKey || ''), ownerKey)) return notFound(res);

  const groupName = String(body.groupName || '').trim().slice(0, 80);
  if (!groupName) return json(res, 400, { error: 'group_name_required' });

  const adminToken = newToken();
  const viewToken = newToken();

  await writeJson(adminPath(hashToken(adminToken)), {
    groupName,
    viewToken,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    peopleCount: 0
  });

  const base = origin(req);
  return json(res, 200, {
    groupName,
    adminUrl: `${base}/a/${adminToken}`,
    viewUrl: `${base}/g/${viewToken}`
  });
}
