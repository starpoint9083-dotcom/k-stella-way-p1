import fs from 'node:fs';

const src=fs.readFileSync('src/index.js','utf8');
const lines=src.split(/\r?\n/);
const needles=[/quality/i,/release/i,/score/i,/auto.?review/i,/review/i,/warn/i,/duration/i,/audio/i,/subtitle/i,/caption/i,/license/i,/music/i];
const printed=new Set();
for(let i=0;i<lines.length;i++){
  if(!needles.some(re=>re.test(lines[i]))) continue;
  const a=Math.max(0,i-4),b=Math.min(lines.length,i+7),key=`${a}:${b}`;
  if(printed.has(key)) continue;
  printed.add(key);
  const block=lines.slice(a,b).join('\n');
  if(!/quality|release|score|review|warn/i.test(block)) continue;
  console.log(`--- QUALITY CONTEXT ${a+1}-${b} ---`);
  for(let j=a;j<b;j++) console.log(`${j+1}: ${lines[j].slice(0,2200)}`);
}
