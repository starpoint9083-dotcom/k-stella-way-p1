import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');

const aiMatch=/async\s+function\s+aiBinaryResult\s*\([^)]*\)\s*\{/.exec(source);
const narrationMatch=/async\s+function\s+generateNarration\s*\([^)]*\)\s*\{/.exec(source);
const aiStart=aiMatch?.index??-1,narrationStart=narrationMatch?.index??-1;
if(aiStart<0||narrationStart<0||narrationStart<=aiStart){
  console.error('TTS audio validation patch failed: aiBinaryResult/generateNarration anchors not found.');
  process.exit(1);
}

const replacement=`function ttsAudioKind(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||new ArrayBuffer(0));
  const ascii=(a,z)=>String.fromCharCode(...b.slice(a,z));
  if(b.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE')return 'wav';
  if(b.length>=3&&ascii(0,3)==='ID3')return 'mp3';
  if(b.length>=2&&b[0]===0xff&&(b[1]&0xe0)===0xe0)return 'mp3';
  if(b.length>=4&&ascii(0,4)==='OggS')return 'ogg';
  if(b.length>=4&&b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return 'webm';
  return '';
}
function ttsMimeForKind(kind){
  if(kind==='wav')return 'audio/wav';
  if(kind==='ogg')return 'audio/ogg';
  if(kind==='webm')return 'audio/webm';
  return 'audio/mpeg';
}
function ttsPreview(bytes){
  try{return new TextDecoder().decode((bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||new ArrayBuffer(0))).slice(0,500)).replace(/\\s+/g,' ').slice(0,300);}catch(_){return '';}
}
function validateTtsAudioBytes(bytes,mime='application/octet-stream',context='tts'){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||new ArrayBuffer(0)),rawMime=String(mime||'').toLowerCase(),kind=ttsAudioKind(b);
  if(!b.byteLength)throw new Error('TTS_RESPONSE_NOT_AUDIO: '+context+' returned empty body');
  if(!kind){
    const preview=ttsPreview(b),looksJson=rawMime.includes('json')||preview.startsWith('{')||preview.startsWith('['),looksText=rawMime.startsWith('text/');
    throw new Error('TTS_RESPONSE_NOT_AUDIO: '+context+' mime='+(rawMime||'unknown')+' bytes='+b.byteLength+(looksJson||looksText?' body='+preview:''));
  }
  return{bytes:b,mime:ttsMimeForKind(kind),kind};
}
async function narrationRowIsValid(env,row){
  if(!row?.object_key||!String(row?.mime_type||'').toLowerCase().startsWith('audio/'))return false;
  try{
    const obj=await env.ASSETS_BUCKET.get(row.object_key);if(!obj)return false;
    const bytes=new Uint8Array(await obj.arrayBuffer());
    validateTtsAudioBytes(bytes,row.mime_type,'stored narration '+row.id);
    return true;
  }catch(_){return false;}
}
async function getValidNarrationRow(env,projectId){
  const row=await env.DB.prepare('SELECT * FROM narration_assets WHERE project_id=?').bind(projectId).first();
  if(!row)return null;
  if(await narrationRowIsValid(env,row))return row;
  await logEvent(env,'warn','ai','TTS_INVALID_STORED_NARRATION_PURGED','잘못된 나레이션 파일을 제거하고 다시 생성하도록 표시합니다.',projectId,{narration_asset_id:row.id,mime_type:String(row.mime_type||''),object_key:String(row.object_key||'')});
  try{if(row.object_key&&env.ASSETS_BUCKET?.delete)await env.ASSETS_BUCKET.delete(row.object_key);}catch(_){ }
  await env.DB.prepare('DELETE FROM narration_assets WHERE project_id=?').bind(projectId).run();
  return null;
}
async function aiBinaryResult(result,defaultType='audio/mpeg'){
  let bytes,mime=defaultType;
  if(result instanceof Response){
    mime=result.headers.get('content-type')||defaultType;bytes=new Uint8Array(await result.arrayBuffer());
    if(!result.ok)throw new Error('TTS_AI_HTTP_'+result.status+': '+ttsPreview(bytes));
  }else if(result instanceof ReadableStream){bytes=new Uint8Array(await new Response(result).arrayBuffer());}
  else if(result instanceof ArrayBuffer){bytes=new Uint8Array(result);}
  else if(ArrayBuffer.isView(result)){bytes=new Uint8Array(result.buffer,result.byteOffset,result.byteLength);}
  else if(result?.body instanceof ReadableStream){bytes=new Uint8Array(await new Response(result.body).arrayBuffer());mime=result?.headers?.get?.('content-type')||defaultType;}
  else if(result?.audio){bytes=decodeBase64Bytes(result.audio);mime=result.content_type||result.mime_type||defaultType;}
  else if(result?.result?.audio){bytes=decodeBase64Bytes(result.result.audio);mime=result.result.content_type||defaultType;}
  else if(typeof result==='string'){bytes=decodeBase64Bytes(result);}
  else throw new Error('TTS 오디오 응답 형식을 읽을 수 없습니다.');
  return validateTtsAudioBytes(bytes,mime,'Workers AI response');
}
`;
source=source.slice(0,aiStart)+replacement+'\n'+source.slice(narrationStart);

const getRouteOld="const projectId=url.searchParams.get('project_id')||'';if(!projectId)return json({ok:true,narration:null});const row=await env.DB.prepare('SELECT * FROM narration_assets WHERE project_id=?').bind(projectId).first();return json({ok:true,narration:publicNarration(row)});";
const getRouteNew="const projectId=url.searchParams.get('project_id')||'';if(!projectId)return json({ok:true,narration:null});const row=await getValidNarrationRow(env,projectId);return json({ok:true,narration:publicNarration(row)});";
if(!source.includes(getRouteOld)){console.error('TTS audio validation patch failed: narration GET route anchor not found.');process.exit(1);}
source=source.replace(getRouteOld,getRouteNew);

const planOld="narrationRow=await env.DB.prepare('SELECT * FROM narration_assets WHERE project_id=?').bind(projectId).first(),narration=publicNarration(narrationRow);";
const planNew="narrationRow=await getValidNarrationRow(env,projectId),narration=publicNarration(narrationRow);";
if(!source.includes(planOld)){console.error('TTS audio validation patch failed: video-plan narration anchor not found.');process.exit(1);}
source=source.replace(planOld,planNew);

const qualityOld="narr=await env.DB.prepare('SELECT * FROM narration_assets WHERE project_id=?').bind(projectId).first();";
const qualityNew="narr=await getValidNarrationRow(env,projectId);";
if(!source.includes(qualityOld)){console.error('TTS audio validation patch failed: quality narration anchor not found.');process.exit(1);}
source=source.replace(qualityOld,qualityNew);

for(const token of [
  'function validateTtsAudioBytes',
  'TTS_RESPONSE_NOT_AUDIO',
  "rawMime.includes('json')",
  'async function narrationRowIsValid',
  'async function getValidNarrationRow',
  'TTS_INVALID_STORED_NARRATION_PURGED',
  '잘못된 나레이션 파일을 제거하고 다시 생성하도록 표시합니다.',
  "DELETE FROM narration_assets WHERE project_id=?",
  'TTS_AI_HTTP_',
  'const row=await getValidNarrationRow(env,projectId)',
  'narrationRow=await getValidNarrationRow(env,projectId)',
  'narr=await getValidNarrationRow(env,projectId)'
]){
  if(!source.includes(token)){
    console.error('TTS audio validation patch failed: required marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('TTS AUDIO VALIDATION PATCH OK: non-audio Workers AI responses are rejected before storage; persisted narration is signature-checked on read; corrupt rows/objects are purged so production regenerates TTS automatically.');
