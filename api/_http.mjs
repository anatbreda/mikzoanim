/*
 * _http.js — עזרים משותפים לכל נקודות הקצה.
 *
 * כלל אחד חוזר כאן: כשאסימון לא תקין או לא קיים, התשובה היא 404 ולא 403.
 * 403 מסגיר שמשהו קיים שם, ו-404 לא מלמד כלום.
 */
export function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(JSON.stringify(body));
}

export function notFound(res) {
  return json(res, 404, { error: 'not_found' });
}

export function methodGuard(req, res, method) {
  if (req.method !== method) {
    json(res, 405, { error: 'method_not_allowed' });
    return false;
  }
  return true;
}

/** גוף בקשה עם תקרה, כדי ששליחה ענקית לא תפיל את הפונקציה. */
const MAX_BODY = 2 * 1024 * 1024;

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}
