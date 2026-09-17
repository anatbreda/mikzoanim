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

var file = path.join(__dirname, '..', 'index.html');
var html = fs.readFileSync(file, 'utf8');

var d = new Date();
function pad(n) { return (n < 10 ? '0' : '') + n; }
var stamp = d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
  pad(d.getUTCHours()) + pad(d.getUTCMinutes());

var before = html;
html = html.replace(/(href="css\/[^"?]+\.css)(\?v=[^"]*)?"/g, '$1?v=' + stamp + '"');
html = html.replace(/(src="js\/[^"?]+\.js)(\?v=[^"]*)?"/g, '$1?v=' + stamp + '"');

if (html === before) {
  console.error('לא נמצאו קבצי css/js לחתימה ב-index.html');
  process.exit(1);
}

fs.writeFileSync(file, html);
var count = (html.match(new RegExp('\\?v=' + stamp, 'g')) || []).length;
console.log('נחתמו ' + count + ' קבצים בגרסה ' + stamp);
