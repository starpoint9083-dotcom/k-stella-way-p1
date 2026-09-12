import fs from 'node:fs';

const src=fs.readFileSync('src/index.js','utf8');

function dump(label,needles,before=1000,after=9000){
  const list=Array.isArray(needles)?needles:[needles];
  let i=-1,matched='';
  for(const needle of list){i=src.indexOf(needle);if(i>=0){matched=needle;break;}}
  if(i<0){console.log(`--- ${label} NOT_FOUND ${list.join(' | ')} ---`);return;}
  const a=Math.max(0,i-before),b=Math.min(src.length,i+after);
  console.log(`--- ${label} matched=${matched} @${i} chars ${a}-${b} ---`);
  console.log(src.slice(a,b));
}

for(const [label,needles,before,after] of [
  ['DRAW_RENDER_FRAME',['function drawRenderFrame','drawRenderFrame='],1200,13000],
  ['SUBTITLE_DRAW',['fillText(chunk','fillText(line','subtitle','lower_safe'],2500,10000],
  ['RENDER_ON_DEVICE','async function renderOnDevice',900,13000],
  ['PROCESS_PRODUCTION_ITEM','async function processProductionItem',900,8000],
  ['BUILD_VIDEO_MANIFEST','function buildVideoManifest',900,8000],
  ['CHOOSE_MUSIC','async function chooseMusic',900,5000],
  ['BUILD_PROMPT','function buildPrompt',1000,5500],
  ['SCORE_ASSET','function scoreAsset',800,5500],
  ['REFERENCE_ASSETS','async function getReferenceAssets',900,5000],
  ['ROLE_PARSER','const ROLE_KW',900,6500]
]) dump(label,needles,before,after);
