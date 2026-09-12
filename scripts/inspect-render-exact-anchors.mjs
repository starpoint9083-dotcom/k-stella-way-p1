import fs from 'node:fs';
const src=fs.readFileSync('src/index.js','utf8');
const needles=[
  'async function renderOnDevice',
  'async function processProductionItem',
  'async function makeAudioTrack',
  'function drawSubtitle',
  'function drawShot',
  'currentVideoManifest.music',
  'currentVideoManifest.narration',
  'manifest.music',
  'manifest.narration',
  'async function listActiveAssets',
  'function scoreAsset',
  'function requiredRoles',
  'async function getReferenceAssets',
  'function buildPrompt',
  "path==='/api/assets'",
  'is_reference=1'
];
for(const needle of needles){
  let from=0,count=0;
  while(true){
    const i=src.indexOf(needle,from);if(i<0)break;
    count++;
    const a=Math.max(0,i-2200),b=Math.min(src.length,i+9000);
    console.log(`--- EXACT ${needle} #${count} @${i} ---`);
    console.log(src.slice(a,b));
    from=i+needle.length;
    if(count>=3)break;
  }
  if(!count)console.log(`--- EXACT ${needle}: NOT FOUND ---`);
}
