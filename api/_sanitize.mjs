/*
 * _sanitize.mjs — מה מותר להישמר על השרת.
 *
 * רשימת היתר מפורשת ולא "מה להסיר", כי הצד השני הוא דפדפן ואין סיבה
 * לסמוך עליו. שני שדות נופלים כאן במכוון:
 *   evidence     — ציטוטים מילוליים מהשיחות בקבוצה
 *   recommenders — מספרי הטלפון של מי ששלחו את הכרטיסים, כלומר של חברי
 *                  הקבוצה עצמם, שרגישים יותר מבעלי המקצוע
 *
 * מופרד לקובץ משלו כדי שאפשר יהיה לבדוק אותו בלי תלות באחסון.
 */
export const MAX_PEOPLE = 3000;

export function str(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function sanitizePhone(phone) {
  if (!phone || typeof phone !== 'object') return null;
  const digits = str(phone.digits, 15);
  if (!/^0\d{7,9}$/.test(digits)) return null;
  return { digits: digits, local: str(phone.local, 20), e164: str(phone.e164, 20) };
}

export function sanitizePerson(person) {
  if (!person || typeof person !== 'object') return null;
  const name = str(person.name, 120).trim();
  if (!name) return null;
  return {
    id: str(person.id, 60),
    name: name,
    categoryId: str(person.categoryId, 40) || 'other',
    secondaryCategories: Array.isArray(person.secondaryCategories)
      ? person.secondaryCategories.slice(0, 5).map((c) => str(c, 40))
      : [],
    phones: Array.isArray(person.phones)
      ? person.phones.slice(0, 4).map(sanitizePhone).filter(Boolean)
      : [],
    sharedCount: Number.isFinite(person.sharedCount) ? Math.min(person.sharedCount, 999) : 1,
    confidence: Number.isFinite(person.confidence) ? Math.min(Math.max(person.confidence, 0), 1) : 0,
    notes: str(person.notes, 300)
  };
}

