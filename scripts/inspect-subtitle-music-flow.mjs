import fs from 'node:fs';

const src=fs.readFileSync('src/index.js','utf8');
const lines=src.split(/\r?\n/);
const patterns=[
  /function\s+processProductionItem/,
  /function\s+renderOnDevice/,
  /function\s+makeAudioTrack/,
  /function\s+chooseMusic/,
  /function\s+generateNarration/,
  /\/api\/narration/,
  /\/api\/video-plan/,
  /caption/i,
  /subtitle/i,
  /scene_text/,
  /music\.url/,
  /narration\.url/,
  /audioCtx|AudioContext/,
  /fillText\(/,
  /strokeText\(/
];
const ranges=[];
for(let i=0;i<lines.length;i++){
  if(!patterns.some(re=>re.test(lines[i])))continue;
  const a=Math.max(0,i-10),b=Math.min(lines.length,i+28);
  let merged=false;
  for(const r of ranges){
    if(a<=r[1]+2&&b>=r[0]-2){r[0]=Math.min(r[0],a);r[1]=Math.max(r[1],b);merged=true;break;}
  }
  if(!merged)ranges.push([a,b]);
}
ranges.sort((x,y)=>x[0]-y[0]);
for(const [a,b] of ranges){
  console.log(`--- SUBTITLE_MUSIC_CONTEXT ${a+1}-${b} ---`);
  for(let j=a;j<b;j++)console.log(`${j+1}: ${lines[j].slice(0,3200)}`);
}
