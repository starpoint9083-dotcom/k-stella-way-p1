import fs from 'node:fs';

const src=fs.readFileSync('src/index.js','utf8');

function dump(label,needle,before=800,after=7000){
  const i=src.indexOf(needle);
  if(i<0){console.log(`--- ${label} NOT_FOUND ${needle} ---`);return;}
  const a=Math.max(0,i-before),b=Math.min(src.length,i+after);
  console.log(`--- ${label} @${i} chars ${a}-${b} ---`);
  console.log(src.slice(a,b));
}

for(const [label,needle,before,after] of [
  ['PROCESS_PRODUCTION_ITEM','async function processProductionItem',600,9000],
  ['RENDER_ON_DEVICE','async function renderOnDevice',600,12000],
  ['MAKE_AUDIO_TRACK','async function makeAudioTrack',500,6000],
  ['DRAW_SUBTITLE','subtitle.chunks',1800,7000],
  ['MUSIC_URL_USE','manifest.music',1800,9000],
  ['NARRATION_URL_USE','manifest.narration',1800,9000],
  ['BUILD_VIDEO_MANIFEST','function buildVideoManifest',800,9000],
  ['CHOOSE_MUSIC','async function chooseMusic',800,5000],
  ['BUILD_PROMPT','function buildPrompt',1000,6000],
  ['SCORE_ASSET','function scoreAsset',800,6500],
  ['REFERENCE_ASSETS','async function getReferenceAssets',800,6500],
  ['REQUIRED_ROLES','function requiredRoles',600,4000],
  ['VISUAL_SIGNATURE','function visualSignature',600,5000]
]) dump(label,needle,before,after);
