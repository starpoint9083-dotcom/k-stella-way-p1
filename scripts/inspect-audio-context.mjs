import fs from 'node:fs';
const src=fs.readFileSync('src/index.js','utf8');
const lines=src.split(/\r?\n/);
const needles=[/audio_assets/i,/music/i,/license_status/i,/\/api\/audio/i,/audio\//i,/sound/i,/bgm/i];
const ranges=[];
for(let i=0;i<lines.length;i++){
  if(!needles.some(re=>re.test(lines[i]))) continue;
  const a=Math.max(0,i-5),b=Math.min(lines.length,i+9);
  if(ranges.some(([x,y])=>a<=y&&b>=x)) continue;
  ranges.push([a,b]);
}
for(const [a,b] of ranges){
  console.log(`--- AUDIO CONTEXT ${a+1}-${b} ---`);
  for(let j=a;j<b;j++)console.log(`${j+1}: ${lines[j].slice(0,2600)}`);
}
