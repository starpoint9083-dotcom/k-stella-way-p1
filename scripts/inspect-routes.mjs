import fs from 'node:fs';

const src = fs.readFileSync('src/index.js', 'utf8');
const lines = src.split(/\r?\n/);

function printContexts(title, needles, radius = 5) {
  console.log(`=== ${title} ===`);
  const printed = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!needles.some((needle) => needle.test(lines[i]))) continue;
    const a = Math.max(0, i - radius), b = Math.min(lines.length, i + radius + 1);
    const key = `${a}:${b}`;
    if (printed.has(key)) continue;
    printed.add(key);
    console.log(`--- around ${i + 1} ---`);
    for (let j = a; j < b; j++) console.log(`${j + 1}: ${lines[j].slice(0, 2200)}`);
  }
}

printContexts('EXACT MEDIA LOAD ERROR', [
  /미디어 파일을 불러오지 못했습니다/,
  /미디어.*불러오지/,
  /media.*load/i,
  /failed.*media/i
], 8);

printContexts('PUBLIC ASSET + STORAGE PATH', [
  /function publicAsset/,
  /publicAsset\(/,
  /ASSETS_BUCKET\.get/,
  /ASSETS_BUCKET\.put/,
  /object_key/,
  /storage_key/,
  /r2_key/,
  /\/media\//,
  /\/asset/,
  /content-type/i
], 6);

printContexts('BROWSER MEDIA LOADER', [
  /new Image\(/,
  /Image\(\)/,
  /\.onerror\s*=/,
  /\.onload\s*=/,
  /createImageBitmap/,
  /fetch\([^\n]*(media|asset)/i,
  /drawImage\(/,
  /loadImage/,
  /loadMedia/,
  /image\.src/,
  /img\.src/
], 7);

printContexts('RENDERER', [
  /function renderOnDevice/,
  /renderOnDevice/,
  /processProductionItem/,
  /buildVideoManifest/,
  /MediaRecorder/,
  /captureStream/,
  /renderCanvas/
], 6);

console.log('=== MEDIA/ASSET ROUTES ===');
const routeRe = /['"`]((?:\/api|\/healthz|\/media|\/assets?|\/audio|\/narration|\/rendered)[^'"`\s]*)['"`]/g;
const routes = new Set();
let m;
while ((m = routeRe.exec(src))) routes.add(m[1]);
for (const route of [...routes].sort()) console.log(route);
