import fs from 'node:fs';

const file = 'src/index.js';
let source = fs.readFileSync(file, 'utf8');

const patches = [
  {
    name: 'image generation',
    from: "const result=await env.AI.run(model,{multipart:{body:formResponse.body,contentType:formResponse.headers.get('content-type')}});",
    to: "const result=await Promise.race([env.AI.run(model,{multipart:{body:formResponse.body,contentType:formResponse.headers.get('content-type')}}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('이미지 AI 180초 제한 초과')),180000))]);"
  },
  {
    name: 'narration TTS',
    from: "const raw=await env.AI.run(model,{prompt:text,lang},{returnRawResponse:true});",
    to: "const raw=await Promise.race([env.AI.run(model,{prompt:text,lang},{returnRawResponse:true}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('TTS AI 120초 제한 초과')),120000))]);"
  }
];

for (const patch of patches) {
  const count = source.split(patch.from).length - 1;
  if (count !== 1) {
    console.error(`Media timeout patch failed: expected exact ${patch.name} call once, found ${count}.`);
    process.exit(1);
  }
  source = source.replace(patch.from, patch.to);
}

for (const marker of [
  "new Error('이미지 AI 180초 제한 초과')",
  '180000',
  "new Error('TTS AI 120초 제한 초과')",
  '120000'
]) {
  if (!source.includes(marker)) {
    console.error('Media timeout patch failed: required marker missing: '+marker);
    process.exit(1);
  }
}

fs.writeFileSync(file, source);
console.log('MEDIA AI TIMEOUT PATCH OK: image generation bounded to 180 seconds; narration TTS bounded to 120 seconds; existing queue/production retry handles timeout failures.');
