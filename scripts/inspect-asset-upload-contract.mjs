import fs from 'node:fs';
const src=fs.readFileSync('src/index.js','utf8');
const lines=src.split(/\r?\n/);
const needles=[/\/api\/assets/i,/asset.*upload/i,/is_reference/i,/character_role/i,/character_name/i,/source_type/i,/formData\(/i,/request\.formData/i];
const seen=new Set();
for(let i=0;i<lines.length;i++){
  if(!needles.some(re=>re.test(lines[i]))) continue;
  const a=Math.max(0,i-5),b=Math.min(lines.length,i+10),k=`${a}:${b}`;
  if(seen.has(k))continue;seen.add(k);
  const block=lines.slice(a,b).join('\n');
  if(!/api\/assets|is_reference|character_role|character_name|formData/i.test(block))continue;
  console.log(`--- ASSET CONTRACT ${a+1}-${b} ---`);
  for(let j=a;j<b;j++)console.log(`${j+1}: ${lines[j].slice(0,2600)}`);
}
