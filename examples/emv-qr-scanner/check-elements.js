/* Static check: every getElementById in app.js must resolve to an id in
   index.html, and every els.X.Y access must have X cached in cacheElements().

   A missing cache entry does not throw on its own — it throws later, inside
   render(), which looks like "this part of the page stopped updating" rather
   than "an element was never found". Run: node check-elements.js */

const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');

let problems = 0;

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

/* Ids the JS asks for but the page does not define. */
const asked = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
const missing = [...new Set(asked)].filter(id => !htmlIds.has(id));
if (missing.length) {
    missing.forEach(id => console.log('MISSING in HTML   getElementById(\'' + id + '\')'));
    problems += missing.length;
} else {
    console.log('ok  every getElementById target exists in index.html (' + new Set(asked).size + ' ids)');
}

/* cacheElements() assignments define what els.* may hold. */
const cacheBlock = js.match(/function cacheElements\(\)\s*\{([\s\S]*?)\n\}/);
if (!cacheBlock) {
    console.log('MISSING  no cacheElements() function found');
    process.exit(1);
}
const cached = new Set([...cacheBlock[1].matchAll(/els\.([A-Za-z0-9_]+)\s*=/g)].map(m => m[1]));

/* Every els.a.b implies els.a exists. */
const nested = new Set();
[...js.matchAll(/els\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g)].forEach(m => nested.add(m[1]));
const usedTop = new Set([...js.matchAll(/els\.([A-Za-z0-9_]+)/g)].map(m => m[1]));

const uncachedTop = [...usedTop].filter(k => !cached.has(k));
if (uncachedTop.length) {
    uncachedTop.forEach(k => console.log('UNCACHED els.' + k + ' is used but never assigned in cacheElements()'));
    problems += uncachedTop.length;
} else {
    console.log('ok  every els.* used is assigned in cacheElements() (' + cached.size + ' entries)');
}

/* An id defined in HTML but referenced nowhere is dead weight — usually a
   leftover from a rename, and worth knowing about. */
const usedIds = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
const orphans = [...htmlIds].filter(id => !usedIds.has(id)
    && !/^(qr-canvas|loading-)/.test(id));
if (orphans.length) {
    console.log('note  ids in HTML not referenced by app.js: ' + orphans.join(', '));
}

console.log(problems ? '\n' + problems + ' problem(s)\n' : '\nall element references resolve\n');
process.exit(problems ? 1 : 0);