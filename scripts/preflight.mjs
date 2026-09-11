import fs from 'node:fs';
const source=fs.readFileSync('src/index.js','utf8');
console.log('PREFLIGHT DIAGNOSTIC ONLY');
for(const needle of [
  'async function aiBinaryResult',
  'async function generateNarration',
  "SELECT * FROM narration_assets",
  'narration_assets WHERE',
  'narration_asset',
  "path.startsWith('/narration/')",
  '/api/narration',
  'generateNarration(env',
  'publicNarration',
  'narration_status'
]){
  let from=0,shown=0;
  while(shown<10){
    const idx=source.indexOf(needle,from);if(idx<0)break;
    console.log(`--- ${needle} @ ${idx} #${shown+1} ---`);
    console.log(source.slice(Math.max(0,idx-2200),Math.min(source.length,idx+needle.length+4200)));
    from=idx+needle.length;shown++;
  }
  if(!shown)console.log(`--- ${needle} NOT FOUND ---`);
}
