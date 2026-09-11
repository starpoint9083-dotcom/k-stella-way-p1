import fs from 'node:fs';

const src = fs.readFileSync('src/index.js', 'utf8');
const lines = src.split(/\r?\n/);

console.log('=== AUTH + PRODUCTION API CONTEXT ===');
for (let i=930;i<1410 && i<lines.length;i++) {
  const line=lines[i];
  if (/requireAuth|bootstrap|session|api\/production|api\/projects|api\/queue|api\/narration|api\/video-plan|api\/rendered|api\/quality|api\/release|createProjectPlan|generateNarration|productionPayload|readJson\(request\)/i.test(line)) {
    const a=Math.max(0,i-2), b=Math.min(lines.length,i+4);
    console.log(`--- around ${i+1} ---`);
    for(let j=a;j<b;j++) console.log(`${j+1}: ${lines[j].slice(0,1200)}`);
  }
}

console.log('=== APP FETCH CALLS ===');
const appStart=lines.findIndex(x=>x.includes('const APP_JS ='));
if(appStart>=0){
  const appText=lines.slice(appStart).join('\n');
  const decoded=appText
    .replace(/^.*?const APP_JS = /s,'')
    .replace(/;\s*$/s,'');
  for(const m of appText.matchAll(/fetch\(([^\n]{0,500})/g)) console.log(m[0].slice(0,800));
}

console.log('=== ZERO-COST BROWSER RENDERER CONTEXT ===');
const renderNeedles = [
  /captureStream/i,
  /MediaRecorder/i,
  /drawImage/i,
  /requestAnimationFrame/i,
  /setInterval/i,
  /setTimeout/i,
  /videoBitsPerSecond/i,
  /currentTime/i,
  /duration/i,
  /shots?/i,
  /canvas/i,
  /render/i,
];
const printed = new Set();
for (let i=0;i<lines.length;i++) {
  if (!renderNeedles.some(re=>re.test(lines[i]))) continue;
  const a=Math.max(0,i-5), b=Math.min(lines.length,i+9);
  const key=`${a}:${b}`;
  if (printed.has(key)) continue;
  printed.add(key);
  console.log(`--- renderer around ${i+1} ---`);
  for(let j=a;j<b;j++) console.log(`${j+1}: ${lines[j].slice(0,1800)}`);
}

console.log('=== VIDEO MANIFEST CONTEXT ===');
for (let i=0;i<lines.length;i++) {
  if (/buildVideoManifest|video_manifest|video-plan|target_duration|duration_sec|duration_ms|shot_duration|scene_duration/i.test(lines[i])) {
    const a=Math.max(0,i-5), b=Math.min(lines.length,i+10);
    console.log(`--- manifest around ${i+1} ---`);
    for(let j=a;j<b;j++) console.log(`${j+1}: ${lines[j].slice(0,1800)}`);
  }
}

console.log('=== ROUTES ===');
const routeRe=/['"`]((?:\/api|\/healthz|\/media|\/audio|\/narration|\/rendered)[^'"`\s]*)['"`]/g;
const routes=new Set();let m;
while((m=routeRe.exec(src))) routes.add(m[1]);
for(const r of [...routes].sort()) console.log(r);
