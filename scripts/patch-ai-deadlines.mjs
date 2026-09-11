import fs from 'node:fs';

const file = 'src/index.js';
let source = fs.readFileSync(file, 'utf8');

const helperMarker = 'async function kstellaAiDeadline(promise,timeoutMs,label){';
if (source.includes(helperMarker)) {
  console.error('AI deadline patch failed: helper already present before patch.');
  process.exit(1);
}

const helper = `
// K-STELLA WORKERS AI DEADLINES
// Prevent a slow model call from blocking the overnight factory indefinitely.
async function kstellaAiDeadline(promise,timeoutMs,label){
  let timer;
  try{
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(String(label||'Workers AI')+' timed out after '+Math.round(timeoutMs/1000)+'s')),timeoutMs);})
    ]);
  }finally{if(timer)clearTimeout(timer);}
}
`;

const patches = [
  {
    name: 'lineup text generation',
    from: "const result=await env.AI.run(model,{messages:[{role:'system',content:'You are a Korean short-form drama conversion copywriter. Return strict JSON only.'},{role:'user',content:prompt}],max_completion_tokens:7000,temperature:0.85});",
    to: "const result=await kstellaAiDeadline(env.AI.run(model,{messages:[{role:'system',content:'You are a Korean short-form drama conversion copywriter. Return strict JSON only.'},{role:'user',content:prompt}],max_completion_tokens:7000,temperature:0.85}),120000,'lineup Workers AI');"
  },
  {
    name: 'image generation',
    from: "const result=await env.AI.run(model,{multipart:{body:formResponse.body,contentType:formResponse.headers.get('content-type')}});",
    to: "const result=await kstellaAiDeadline(env.AI.run(model,{multipart:{body:formResponse.body,contentType:formResponse.headers.get('content-type')}}),180000,'image Workers AI');"
  },
  {
    name: 'narration TTS',
    from: "const raw=await env.AI.run(model,{prompt:text,lang},{returnRawResponse:true});",
    to: "const raw=await kstellaAiDeadline(env.AI.run(model,{prompt:text,lang},{returnRawResponse:true}),120000,'TTS Workers AI');"
  }
];

for (const patch of patches) {
  const count = source.split(patch.from).length - 1;
  if (count !== 1) {
    console.error(`AI deadline patch failed: expected exactly one ${patch.name} target, found ${count}.`);
    process.exit(1);
  }
  source = source.replace(patch.from, patch.to);
}

source = helper + '\n' + source;

for (const marker of [
  "k-stellaAiDeadline(env.AI.run(model,{messages:",
  "120000,'lineup Workers AI'",
  "180000,'image Workers AI'",
  "120000,'TTS Workers AI'"
]) {
  if (!source.includes(marker)) {
    console.error('AI deadline patch failed: required marker missing: '+marker);
    process.exit(1);
  }
}

fs.writeFileSync(file, source);
console.log('AI DEADLINE PATCH OK: lineup 120s with fallback; image 180s with queue retry; TTS 120s with production retry.');
