import fs from 'node:fs';

const file = 'src/index.js';
let source = fs.readFileSync(file, 'utf8');

const exact = "const result=await env.AI.run(model,{messages:[{role:'system',content:'You are a Korean short-form drama conversion copywriter. Return strict JSON only.'},{role:'user',content:prompt}],max_completion_tokens:7000,temperature:0.85});";
const replacement = "const result=await Promise.race([env.AI.run(model,{messages:[{role:'system',content:'You are a Korean short-form drama conversion copywriter. Return strict JSON only.'},{role:'user',content:prompt}],max_completion_tokens:7000,temperature:0.85}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('편성 AI 90초 제한 초과')),90000))]);";

const count = source.split(exact).length - 1;
if (count !== 1) {
  console.error(`Lineup timeout patch failed: expected exact AI call once, found ${count}.`);
  process.exit(1);
}

source = source.replace(exact, replacement);

for (const marker of [
  "Promise.race([env.AI.run(model",
  "new Error('편성 AI 90초 제한 초과')",
  '90000'
]) {
  if (!source.includes(marker)) {
    console.error('Lineup timeout patch failed: required marker missing: '+marker);
    process.exit(1);
  }
}

fs.writeFileSync(file, source);
console.log('LINEUP AI TIMEOUT PATCH OK: Workers AI lineup generation is bounded to 90 seconds and falls back to the existing safe 10-item template on timeout.');
