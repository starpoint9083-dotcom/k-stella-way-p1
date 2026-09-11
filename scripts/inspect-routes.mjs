import fs from 'node:fs';

const src = fs.readFileSync('src/index.js', 'utf8');
const lines = src.split(/\r?\n/);
const patterns = [
  /['"`]((?:\/api|\/admin|\/health|\/media|\/assets|\/render|\/release|\/ops)[^'"`\s]*)['"`]/g,
  /pathname\s*===?\s*['"`]([^'"`]+)['"`]/g,
  /pathname\.startsWith\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
];
const routes = new Set();
for (const line of lines) {
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) routes.add(m[1]);
  }
}
console.log('=== ROUTES ===');
for (const r of [...routes].sort()) console.log(r);
console.log('=== KEYWORD CONTEXT ===');
const keys = ['render','release','episode','scene','tts','qa','video','queue','asset','today','recover','resume'];
for (let i=0;i<lines.length;i++) {
  const low = lines[i].toLowerCase();
  if (keys.some(k => low.includes(k))) {
    console.log(`${i+1}: ${lines[i].slice(0,500)}`);
  }
}
