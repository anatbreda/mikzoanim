/*
 * _store.js — שכבת האחסון, והמקום היחיד בקוד שיודע שמדובר ב-Vercel Blob.
 *
 * כל השאר מדבר רק ב-readJson / writeJson / removeJson, כדי שמעבר עתידי
 * ל-Supabase או לכל מסד אחר יהיה החלפה של הקובץ הזה בלבד.
 */
import { put, get, del } from '@vercel/blob';

const ACCESS = 'private';

export async function readJson(pathname) {
  const found = await get(pathname, { access: ACCESS, useCache: false });
  if (!found) return null;
  const text = await new Response(found.stream).text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function writeJson(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: ACCESS,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export async function removeJson(pathname) {
  try {
    await del(pathname);
  } catch {
    // כבר לא קיים — מחיקה היא אידמפוטנטית מבחינת הקורא
  }
}

export const adminPath = (hash) => `adm/${hash}.json`;
export const publicPath = (hash) => `pub/${hash}.json`;
