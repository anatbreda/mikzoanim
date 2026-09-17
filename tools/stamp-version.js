#!/usr/bin/env node
/*
 * stamp-version.js — חותם גרסה על קבצי ה-CSS וה-JS ב-index.html.
 *
 * GitHub Pages מגיש קבצים סטטיים עם מטמון, ודפדפן שכבר ביקר באתר ימשיך
 * להריץ את הגרסה הישנה גם אחרי פרסום. שינוי הכתובת ל-"app.js?v=<חותם>"
 * הופך אותה לכתובת חדשה מבחינת הדפדפן, והקובץ נטען מחדש.
 *
 * להריץ לפני כל קומיט שנוגע ב-css/ או ב-js/:
 *   node tools/stamp-version.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var files = [path.join(__dirname, '..', 'index.html')]
  .concat(fs.existsSync(path.join(__dirname, '..', 'group'))
    ? fs.readdirSync(path.join(__dirname, '..', 'group'))
      .filter(function (f) { return /\.html$/.test(f); })
      .map(function (f) { return path.join(__dirname, '..', 'group', f); })
    : []);

var d = new Date();
function pad(n) { return (n < 10 ? '0' : '') + n; }
var stamp = d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
  pad(d.getUTCHours()) + pad(d.getUTCMinutes());

var total = 0;
files.forEach(function (file) {
  var html = fs.readFileSync(file, 'utf8');
  // גם נתיב יחסי (index.html) וגם מוחלט (דפי group/, שמוגשים מכתובת אחרת)
  html = html.replace(/((?:href|src)="\/?(?:css|js|group)\/[^"?]+\.(?:css|js))(\?v=[^"]*)?"/g,
    '$1?v=' + stamp + '"');
  fs.writeFileSync(file, html);
  total += (html.match(new RegExp('\\?v=' + stamp, 'g')) || []).length;
});

if (!total) {
  console.error('לא נמצאו קבצי css/js לחתימה');
  process.exit(1);
}

console.log('נחתמו ' + total + ' קבצים בגרסה ' + stamp + ' (' + files.length + ' דפים)');
