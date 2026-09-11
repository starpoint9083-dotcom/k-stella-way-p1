import fs from 'node:fs';

const src = fs.readFileSync('src/index.js', 'utf8');

const needles = [
  '/api/production/start',
  '/api/queue/generate',
  '/api/narration/generate',
  '/api/video-plan',
  'MediaRecorder',
  'captureStream',
  '/api/rendered/upload',
  '/api/quality/check',
  '/api/release/check'
];

function clean(text) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
}

for (const needle of needles) {
  console.log(`\n===== ${needle} =====`);
  let from = 0;
  let count = 0;
  while (count < 4) {
    const i = src.indexOf(needle, from);
    if (i < 0) break;
    count += 1;
    const a = Math.max(0, i - 1800);
    const b = Math.min(src.length, i + needle.length + 3200);
    console.log(`--- occurrence ${count} at ${i} ---`);
    console.log(clean(src.slice(a, b)));
    from = i + needle.length;
  }
  if (!count) console.log('NOT FOUND');
}

console.log('\n===== LIKELY RENDER FUNCTIONS =====');
for (const m of src.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]*(?:render|record|video|queue|narrat|quality|release)[A-Za-z0-9_$]*)\s*\(/gi)) {
  console.log(`${m.index}: ${m[0]}`);
}

console.log('\n===== API FETCH ORDER IN APP =====');
const appStart = src.indexOf('const APP_JS =');
const app = appStart >= 0 ? src.slice(appStart) : src;
for (const m of app.matchAll(/fetch\(([^\n]{0,700})/g)) {
  const s = m[0];
  if (/production|queue|narration|video-plan|rendered|quality|release/i.test(s)) console.log(s.slice(0,1000));
}
