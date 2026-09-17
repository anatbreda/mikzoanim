/*
 * _tokens.js — יצירת אסימונים וגיבובם.
 *
 * אין טבלת מיפוי בשום מקום: הנתיב של הקובץ באחסון הוא הגיבוב של האסימון.
 * מי שמחזיק את האסימון מגיע לקובץ, ומי שלא — אין לו אפילו מה לנחש, כי אין
 * רשימה לדלוף ממנה. הגיבוב גם מבטיח שהאסימון עצמו לא נשמר בצד השרת.
 */
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** 32 בתים אקראיים -> 43 תווים base64url. */
export function newToken() {
  return randomBytes(32).toString('base64url');
}

/**
 * בדיקת צורה לפני כל שימוש. חשוב לביטחון ולא רק לנוחות: הגיבוב מגיע
 * לנתיב קובץ, ולכן קלט חופשי אסור שיגיע לשם בכלל.
 */
export function isToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** השוואה בזמן קבוע, כדי שלא יהיה אפשר לגלות את המפתח לפי זמני תגובה. */
export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
