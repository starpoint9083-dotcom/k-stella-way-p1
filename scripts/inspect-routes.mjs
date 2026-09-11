import fs from 'node:fs';

const src = fs.readFileSync('src/index.js', 'utf8');
const lines = src.split(/\r?\n/);

console.log('=== EXACT MEDIA/RENDER CONTEXT ===');
const exactNeedles = [
  '미디어 파일을 불러오지 못했습니다',
  'renderOnDevice',
  'processProductionItem',
  'new Image',
  'new Audio',
  'AudioContext',
  'decodeAudioData',
  'asset_object_key',
  '/media/',
  '/audio/',
  '/api/assets',
  '/api/narration',
  'loadImage',
  'loadAudio'
];
for (const needle of exactNeedles) {
  let start = 0;
  let count = 0;
  while (true) {
    const idx = src.indexOf(needle, start);
    if (idx < 0) break;
    count += 1;
    const a = Math.max(0, idx - 3500);
    const b = Math.min(src.length, idx + needle.length + 5500);
    console.log(`--- needle=${JSON.stringify(needle)} occurrence=${count} index=${idx} ---`);
    console.log(src.slice(a, b));
    start = idx + needle.length;
    if (count >= 4) break;
  }
  if (!count) console.log(`--- needle=${JSON.stringify(needle)} NOT FOUND ---`);
}

console.log('=== AUTH + PRODUCTION API CONTEXT ===');
for (let i=930;i<1410 && i<lines.length;i++) {
  const line=lines[i];
  if (/requireAuth|bootstrap|session|api\/production|api\/projects|api\/queue|api\/narration|api\/video-plan|api\/rendered|api\/quality|api\/release|createProjectPlan|generateNarration|productionPayload|readJson\(request\)/i.test(line)) {
    const a=Math.max(0,i-2), b=Math.min(lines.length,i+4);
    console.log(`--- around ${i+1} ---`);
    for(let j=a;j<b;j++) console.log(`${j+1}: ${lines[j].slice(0,1200)}`);
  }
}

console.log('=== ROUTES ===');
const routeRe=/['"`]((?:\/api|\/healthz|\/media|\/audio|\/narration|\/rendered)[^'"`\s]*)['"`]/g;
const routes=new Set();let m;
while((m=routeRe.exec(src))) routes.add(m[1]);
for(const r of [...routes].sort()) console.log(r);
