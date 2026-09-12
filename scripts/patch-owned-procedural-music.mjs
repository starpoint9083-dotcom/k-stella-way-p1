import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');

const chooseAnchor="async function chooseMusic(env,project,scenes){\n  const {results=[]}=await env.DB.prepare(\"SELECT * FROM audio_assets WHERE status='active' AND kind='music' ORDER BY id DESC LIMIT 500\").all();\n  if(!results.length)return null;";
if(!source.includes(chooseAnchor)){
  console.error('OWNED MUSIC PATCH FAILED: chooseMusic anchor not found');
  process.exit(1);
}

const helper=`function writeAscii(view,offset,text){for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i)&255);}
function buildKStellaOwnedMusicWav(){
  const sampleRate=8000,duration=60,total=sampleRate*duration,dataBytes=total*2,buffer=new ArrayBuffer(44+dataBytes),view=new DataView(buffer);
  writeAscii(view,0,'RIFF');view.setUint32(4,36+dataBytes,true);writeAscii(view,8,'WAVE');writeAscii(view,12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);writeAscii(view,36,'data');view.setUint32(40,dataBytes,true);
  const chords=[[110,130.81,164.81],[98,123.47,146.83],[87.31,110,130.81],[82.41,103.83,123.47]];
  const tri=(f,t)=>{const p=(t*f)%1;return 4*Math.abs(p-.5)-1;};
  for(let i=0;i<total;i++){
    const t=i/sampleRate,ch=chords[Math.floor(t/8)%chords.length],local=t%8;
    const fade=Math.min(1,t/1.2,(duration-t)/1.5,Math.min(1,local/.35,(8-local)/.55));
    const pulse=.78+.22*(1-Math.abs(((t*2)%2)-1));
    const mix=.48*tri(ch[0],t)+.30*tri(ch[1],t)+.18*tri(ch[2],t)+.14*tri(ch[0]/2,t);
    const sample=Math.max(-1,Math.min(1,mix*.105*fade*pulse));
    view.setInt16(44+i*2,Math.round(sample*32767),true);
  }
  return new Uint8Array(buffer);
}
async function ensureKStellaOwnedMusic(env){
  const filename='K_STELLA_ORIGINAL_DRAMA_BED_01.wav';
  let row=await env.DB.prepare("SELECT * FROM audio_assets WHERE filename=? AND status='active' AND kind='music' ORDER BY id DESC LIMIT 1").bind(filename).first();
  if(row)return row;
  if(!env.ASSETS_BUCKET)return null;
  const bytes=buildKStellaOwnedMusicWav(),sha=await sha256Hex(bytes);
  row=await env.DB.prepare('SELECT * FROM audio_assets WHERE sha256=?').bind(sha).first();
  if(row){
    if(row.status!=='active'||row.kind!=='music')await env.DB.prepare("UPDATE audio_assets SET status='active',kind='music',license_status='owned',license_note=? WHERE id=?").bind('K 스텔라 웨이 Worker 자체 합성 원본 · 외부 음원/샘플 미사용',row.id).run();
    return await env.DB.prepare('SELECT * FROM audio_assets WHERE id=?').bind(row.id).first();
  }
  const key='audio/builtin/k-stella-original-drama-bed-01.wav';
  await env.ASSETS_BUCKET.put(key,bytes,{httpMetadata:{contentType:'audio/wav'}});
  await env.DB.prepare(`INSERT INTO audio_assets(filename,object_key,sha256,mime_type,kind,mood,tempo_class,bpm,energy,tags,status,notes,license_status,license_note,source_url) VALUES(?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`).bind(filename,key,sha,'audio/wav','music','romantic tense mysterious','fast',120,7,normalizeTags('romantic,tense,mysterious,drama,ambient'),'P1 zero-cost built-in music fallback','owned','K 스텔라 웨이 Worker 자체 합성 원본 · 외부 음원/샘플 미사용','').run();
  row=await env.DB.prepare('SELECT * FROM audio_assets WHERE sha256=?').bind(sha).first();
  await logEvent(env,'info','audio','OWNED_PROCEDURAL_MUSIC_SEEDED','자체 합성 배경음악을 자동 등록했습니다.','',{audio_asset_id:row?.id||null,bytes:bytes.byteLength,license_status:'owned'});
  return row;
}
async function chooseMusic(env,project,scenes){
  let {results=[]}=await env.DB.prepare("SELECT * FROM audio_assets WHERE status='active' AND kind='music' ORDER BY id DESC LIMIT 500").all();
  if(!results.length){await ensureKStellaOwnedMusic(env);({results=[]}=await env.DB.prepare("SELECT * FROM audio_assets WHERE status='active' AND kind='music' ORDER BY id DESC LIMIT 500").all());}
  if(!results.length)return null;`;
source=source.replace(chooseAnchor,helper);

for(const token of [
  'function buildKStellaOwnedMusicWav',
  'async function ensureKStellaOwnedMusic',
  'K_STELLA_ORIGINAL_DRAMA_BED_01.wav',
  'OWNED_PROCEDURAL_MUSIC_SEEDED',
  "license_status:'owned'",
  '외부 음원/샘플 미사용',
  'if(!results.length){await ensureKStellaOwnedMusic(env);'
]){
  if(!source.includes(token)){
    console.error('OWNED MUSIC PATCH FAILED: marker missing '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('OWNED MUSIC PATCH OK: when no active music exists, P1 creates one 60s zero-cost WAV from mathematical waveforms, stores it as owned, and reuses the existing chooseMusic/quality pipeline.');
