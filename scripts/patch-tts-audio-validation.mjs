import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');

const aiMatch=/async\s+function\s+aiBinaryResult\s*\([^)]*\)\s*\{/.exec(source);
const narrationMatch=/async\s+function\s+generateNarration\s*\([^)]*\)\s*\{/.exec(source);
const aiStart=aiMatch?.index??-1,narrationStart=narrationMatch?.index??-1;
if(aiStart<0||narrationStart<0||narrationStart<=aiStart){
  const aiHint=source.match(/.{0,80}aiBinaryResult.{0,180}/s)?.[0]||'none';
  const narrationHint=source.match(/.{0,80}generateNarration.{0,180}/s)?.[0]||'none';
  console.error('TTS audio validation patch failed: function anchors not found/order invalid. aiHint='+aiHint+' narrationHint='+narrationHint);
  process.exit(1);
}

const audioHelpers=`function ttsAudioKind(buffer){
  const b=new Uint8Array(buffer||new ArrayBuffer(0));
  const ascii=(a,z)=>String.fromCharCode(...b.slice(a,z));
  if(b.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE')return 'wav';
  if(b.length>=3&&ascii(0,3)==='ID3')return 'mp3';
  if(b.length>=2&&b[0]===0xff&&(b[1]&0xe0)===0xe0)return 'mp3';
  if(b.length>=4&&ascii(0,4)==='OggS')return 'ogg';
  if(b.length>=4&&b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return 'webm';
  return '';
}
function ttsMimeForKind(kind,mime=''){
  if(kind==='wav')return 'audio/wav';
  if(kind==='ogg')return 'audio/ogg';
  if(kind==='webm')return 'audio/webm';
  if(kind==='mp3')return 'audio/mpeg';
  return String(mime||'').toLowerCase();
}
function ttsPreview(buffer){
  try{return new TextDecoder().decode(new Uint8Array(buffer).slice(0,500)).replace(/\\s+/g,' ').slice(0,300);}catch(_){return '';}
}
function validateTtsAudioBinary({buffer,mime},context='tts'){
  const bytes=buffer?.byteLength||0,rawMime=String(mime||'').toLowerCase(),kind=ttsAudioKind(buffer);
  if(!bytes)throw new Error('TTS_RESPONSE_NOT_AUDIO: '+context+' returned empty body');
  if(!kind){
    const preview=ttsPreview(buffer),looksJson=rawMime.includes('json')||preview.startsWith('{')||preview.startsWith('['),looksText=rawMime.startsWith('text/');
    throw new Error('TTS_RESPONSE_NOT_AUDIO: '+context+' mime='+(rawMime||'unknown')+' bytes='+bytes+(looksJson||looksText?' body='+preview:''));
  }
  return {buffer,mime:ttsMimeForKind(kind,rawMime),kind};
}
async function storedNarrationIsValid(env,row){
  if(!row?.object_key||!String(row?.mime_type||'').toLowerCase().startsWith('audio/'))return false;
  try{
    const object=await env.ASSETS_BUCKET.get(row.object_key);if(!object)return false;
    const buffer=await object.arrayBuffer();
    validateTtsAudioBinary({buffer,mime:row.mime_type},'cached narration '+row.id);
    return true;
  }catch(_){return false;}
}
async function aiBinaryResult(result){
  if(result instanceof Response){
    const mime=result.headers.get('content-type')||'application/octet-stream',status=result.status,ok=result.ok;
    const buffer=await result.arrayBuffer();
    if(!ok)throw new Error('TTS_AI_HTTP_'+status+': '+ttsPreview(buffer));
    return validateTtsAudioBinary({buffer,mime},'Workers AI response');
  }
  let candidate=null;
  if(result?.body instanceof ReadableStream)candidate={buffer:await new Response(result.body).arrayBuffer(),mime:'audio/mpeg'};
  else if(result instanceof ArrayBuffer)candidate={buffer:result,mime:'audio/mpeg'};
  else if(ArrayBuffer.isView(result))candidate={buffer:result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength),mime:'audio/mpeg'};
  else if(result?.audio instanceof ArrayBuffer)candidate={buffer:result.audio,mime:'audio/mpeg'};
  else if(typeof result?.audio==='string')candidate={buffer:b64ToArrayBuffer(result.audio),mime:'audio/mpeg'};
  else if(typeof result==='string')candidate={buffer:b64ToArrayBuffer(result),mime:'audio/mpeg'};
  if(!candidate)throw new Error('binary audio response unsupported');
  return validateTtsAudioBinary(candidate,'Workers AI result');
}
`;
source=source.slice(0,aiStart)+audioHelpers+'\n'+source.slice(narrationStart);

const genMatch=/async\s+function\s+generateNarration\s*\([^)]*\)\s*\{/.exec(source);
const genStart=genMatch?.index??-1;
const genSlice=genStart>=0?source.slice(genStart):'';
const assertMatch=/assertChars\([^;]{0,400}LIMITS\.narration_max_chars\);/.exec(genSlice);
const assertPos=assertMatch?genStart+assertMatch.index:-1;
if(genStart<0||assertPos<0){
  const hint=genStart>=0?source.slice(genStart,Math.min(source.length,genStart+1600)):'generateNarration missing';
  console.error('TTS audio validation patch failed: generateNarration assertion anchor not found. hint='+hint);
  process.exit(1);
}
const prefix=`async function generateNarration(env,projectId,narration){
  const text=narration.full||narration.text||'';
  if(!text)throw new Error('narration text empty');
  const sha=await digestSha256Hex(text);
  let existing=await env.DB.prepare('SELECT * FROM narration_assets WHERE project_id=? AND text_sha256=? ORDER BY id DESC LIMIT 1').bind(projectId,sha).first();
  if(existing){
    if(await storedNarrationIsValid(env,existing)){
      await env.DB.prepare('UPDATE projects SET narration_asset_id=?,narration_status=? WHERE id=?').bind(existing.id,'ready',projectId).run();
      return existing;
    }
    await logEvent(env,'warn','ai','TTS_INVALID_CACHE_BYPASSED','잘못된 나레이션 캐시를 무시하고 다시 생성합니다.',projectId,{narration_asset_id:existing.id,mime_type:String(existing.mime_type||''),object_key:String(existing.object_key||'')});
    await env.DB.prepare("UPDATE projects SET narration_asset_id=NULL,narration_status='missing',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(projectId).run();
    existing=null;
  }
  `;
source=source.slice(0,genStart)+prefix+source.slice(assertPos);

for(const token of [
  'function validateTtsAudioBinary',
  'TTS_RESPONSE_NOT_AUDIO',
  "rawMime.includes('json')",
  'function storedNarrationIsValid',
  "String(row?.mime_type||'').toLowerCase().startsWith('audio/')",
  'TTS_INVALID_CACHE_BYPASSED',
  '잘못된 나레이션 캐시를 무시하고 다시 생성합니다.',
  "narration_asset_id=NULL,narration_status='missing'",
  'TTS_AI_HTTP_',
  "return {buffer,mime:ttsMimeForKind(kind,rawMime),kind}"
]){
  if(!source.includes(token)){
    console.error('TTS audio validation patch failed: required marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('TTS AUDIO VALIDATION PATCH OK: HTTP/JSON/non-audio TTS responses are rejected; cached narration objects must contain real audio before reuse; corrupt cache is bypassed and regenerated.');
