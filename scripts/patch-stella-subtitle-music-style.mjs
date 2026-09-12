import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');
const fail=(msg)=>{console.error('STELLA PRODUCTION PATCH FAILED: '+msg);process.exit(1);};
const replaceOnce=(oldText,newText,label)=>{if(!source.includes(oldText))fail(label+' anchor not found');source=source.replace(oldText,newText);};

// 1) Lock the cast model to the five approved K STELLA WAY characters.
replaceOnce(
"function requiredRoles(req={}){ return String(req.character_role||'').split('+').map(x=>x.trim()).filter(x=>['남주','여주','보조캐릭터'].includes(x)); }",
"const K_STELLA_CAST=['남주','여주','남주 친구','여주 친구','새로운 남자'];\nfunction requiredRoles(req={}){ return String(req.character_role||'').split('+').map(x=>x.trim()).filter(x=>K_STELLA_CAST.includes(x)); }",
'requiredRoles'
);

const roleKwOld=`const ROLE_KW={
  '남주':['남주','그는','그가','남자가','남자는','남편이','남편은','남친이','남친은','전남친이','전남친은'],
  '여주':['여주','그녀는','그녀가','여자가','여자는','아내가','아내는','여친이','여친은','전여친이','전여친은'],
  '보조캐릭터':['친구가','친구는','동료가','상사가','후배가','선배가','엄마가','아빠가','언니가','오빠가','동생이']
};`;
const roleKwNew=`const ROLE_KW={
  '남주 친구':['남주 친구','남자 주인공 친구','남주의 친구','남자친구의 친구'],
  '여주 친구':['여주 친구','여자 주인공 친구','여주의 친구','친구가','친구는','친구에게'],
  '새로운 남자':['새로운 남자','새 남자','새로운 남자 주인공','새 인연의 남자'],
  '남주':['남주','그는','그가','남자가','남자는','남편이','남편은','남친이','남친은','전남친이','전남친은'],
  '여주':['여주','그녀는','그녀가','여자가','여자는','아내가','아내는','여친이','여친은','전여친이','전여친은']
};`;
replaceOnce(roleKwOld,roleKwNew,'ROLE_KW');

const extractOld=`  const hasMale=text.includes('남주');
  const hasFemale=text.includes('여주');
  if(hasMale&&hasFemale) req.character_role='남주+여주';
  else if(hasMale) req.character_role='남주';
  else if(hasFemale) req.character_role='여주';
  else {
    for(const [role,kws] of Object.entries(ROLE_KW)){ if(kws.some(k=>text.includes(k))){ req.character_role=role; break; } }
  }`;
const extractNew=`  const exactRoles=[];
  for(const [role,kws] of Object.entries(ROLE_KW)){if(kws.some(k=>text.includes(k))&&!exactRoles.includes(role))exactRoles.push(role);}
  if(text.includes('남주')&&!exactRoles.includes('남주'))exactRoles.push('남주');
  if(text.includes('여주')&&!exactRoles.includes('여주'))exactRoles.push('여주');
  const ordered=K_STELLA_CAST.filter(r=>exactRoles.includes(r));
  if(ordered.length)req.character_role=ordered.join('+');`;
replaceOnce(extractOld,extractNew,'extractReq cast detection');

// 2) Hard style eligibility. Old mixed generated images cannot be silently reused.
const scoreAnchor="function scoreAsset(asset,req,ctx={}){\n  if(asset.status!=='active') return -999;";
const styleHelpers=`function isKStellaStyleAsset(asset={}){
  if(asset.status!=='active')return false;
  const role=String(asset.character_role||'');
  const castOk=role.split('+').some(x=>K_STELLA_CAST.includes(x.trim()))||role==='남주+여주';
  const meta=[asset.tags,asset.notes,asset.source,asset.filename].join(' ').toLowerCase();
  const locked=/kstella_style_lock_v1|k[ _-]?stella|스텔라웨이|스텔라 웨이|캐릭터풍/.test(meta);
  if(Number(asset.is_reference)===1&&castOk)return true;
  if(String(asset.source||'')==='generated')return locked&&castOk;
  return castOk&&(locked||String(asset.source||'')!=='generated');
}
function styleMatchesRequest(asset,req={}){
  if(!isKStellaStyleAsset(asset))return false;
  const wanted=requiredRoles(req);if(!wanted.length)return true;
  const have=new Set(String(asset.character_role||'').split('+').map(x=>x.trim()));
  return wanted.every(r=>have.has(r)||(!have.size&&String(asset.character_name||'')===String(req.character_name||'')));
}
function scoreAsset(asset,req,ctx={}){
  if(asset.status!=='active'||!styleMatchesRequest(asset,req)) return -999;`;
replaceOnce(scoreAnchor,styleHelpers,'scoreAsset style lock');

const refsOld=`async function getReferenceAssets(env,req){
  const roles=requiredRoles(req); if(!roles.length)return[];
  const out=[];
  for(const role of roles){
    const {results=[]}=await env.DB.prepare("SELECT * FROM assets WHERE status='active' AND is_reference=1 AND character_role=? ORDER BY id DESC LIMIT 2").bind(role).all();
    for(const r of results){ if(!out.some(x=>x.id===r.id))out.push(r); if(out.length>=4)return out; }
  }
  return out;
}`;
const refsNew=`async function getReferenceAssets(env,req){
  const roles=requiredRoles(req);if(!roles.length)return[];
  const out=[];
  for(const role of roles){
    let results=[];
    if(String(req.character_name||'').trim())({results=[]}=await env.DB.prepare("SELECT * FROM assets WHERE status='active' AND is_reference=1 AND character_role=? AND character_name=? ORDER BY id DESC LIMIT 2").bind(role,String(req.character_name).trim()).all());
    if(!results.length)({results=[]}=await env.DB.prepare("SELECT * FROM assets WHERE status='active' AND is_reference=1 AND character_role=? ORDER BY id DESC LIMIT 2").bind(role).all());
    for(const r of results){if(isKStellaStyleAsset(r)&&!out.some(x=>x.id===r.id))out.push(r);if(out.length>=4)return out;}
  }
  return out;
}`;
replaceOnce(refsOld,refsNew,'reference asset lookup');

replaceOnce(
"  const ranked=assets.map(asset=>({asset,score:scoreAsset(asset,req,{alreadyUsed:used.has(Number(asset.id)),recentCount:0,signatureCount:0,framingCount:0,compositionCount:0})})).sort((a,b)=>b.score-a.score);\n  const best=ranked.find(x=>x.score>0)||ranked[0];",
"  const ranked=assets.map(asset=>({asset,score:scoreAsset(asset,req,{alreadyUsed:used.has(Number(asset.id)),recentCount:0,signatureCount:0,framingCount:0,compositionCount:0})})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);\n  const best=ranked[0];",
'free cap random asset fallback'
);

replaceOnce(
"async function rebuildMissingGenerationQueue(env,projectId){",
"async function rebuildMissingGenerationQueue(env,projectId){\n  const {results:styleRows=[]}=await env.DB.prepare(`SELECT s.id scene_id,a.* FROM scenes s JOIN assets a ON a.id=s.selected_asset_id WHERE s.project_id=? AND s.selected_asset_id IS NOT NULL`).bind(projectId).all();\n  for(const row of styleRows){if(!isKStellaStyleAsset(row))await env.DB.prepare('UPDATE scenes SET selected_asset_id=NULL,missing=1,match_score=0 WHERE id=?').bind(row.scene_id).run();}",
'rebuildMissingGenerationQueue style invalidation'
);

replaceOnce(
"`Workers AI ${model} 자동 생성 · queue ${q.id}`",
"`KSTELLA_STYLE_LOCK_V1 · K 스텔라 웨이 캐릭터풍 · Workers AI ${model} 자동 생성 · queue ${q.id}`",
'generated asset style marker'
);

replaceOnce(
"hasReferences?'Use the supplied reference image(s) as the exact adult character identity reference. Preserve face, hair, approximate age, visual identity and established illustration style consistently.':'K STELLA WAY cinematic illustrated drama still, consistent adult Korean drama character design and polished premium visual style.',",
"hasReferences?'K STELLA WAY CHARACTER STYLE LOCK. Use the supplied reference image(s) as the exact approved character identity and illustration-style reference. Preserve the same face, hair, age, costume identity, linework, shading, proportions and established K STELLA WAY illustration style. Never switch to photorealistic, live-action, 3D, generic anime or a different illustration style.':'K STELLA WAY CHARACTER STYLE LOCK. Premium cinematic illustrated drama still in the established K STELLA WAY character style only. Never photorealistic, never live-action, never 3D, never generic anime, never change the approved character design.',",
'image prompt style lock'
);

// 3) Subtitle-only production: do not generate or mix human narration.
replaceOnce(
"      await ensureProjectImages(projectId,item);await prepareNarration(projectId,item);",
"      await ensureProjectImages(projectId,item);await markProductionItem(item,'processing','subtitles');",
'production narration call'
);

const manualOld=`    setRenderProgress('1/4 한국어 나레이션을 확인하고 있습니다.',5);let nd=await api('/api/narration?project_id='+encodeURIComponent(projectId));if(!nd.narration){setRenderProgress('1/4 한국어 나레이션을 자동 생성하고 있습니다.',12);nd=await api('/api/narration/generate',{method:'POST',body:JSON.stringify({project_id:projectId})});}renderNarrationBox(nd.narration);
    setRenderProgress('2/4 기존 자산과 음악으로 영상 타임라인을 설계합니다.',25);const manifest=await buildVideoPlan(projectId);`;
const manualNew=`    setRenderProgress('1/3 장면 자막과 감정선을 확인하고 있습니다.',8);
    setRenderProgress('2/3 장면 감정에 맞는 음악 구간으로 타임라인을 설계합니다.',25);const manifest=await buildVideoPlan(projectId);`;
replaceOnce(manualOld,manualNew,'manual narration generation');

// 4) Scene-aware multi-segment music selection. Keep a primary asset for DB/backward compatibility.
const chooseStart=source.indexOf('async function chooseMusic(env,project,scenes){');
const chooseEnd=source.indexOf('\nfunction subtitleChunks',chooseStart);
if(chooseStart<0||chooseEnd<0)fail('chooseMusic boundaries not found');
const chooseReplacement=`function sceneMusicIntent(text='',req={},phase=''){
  const hay=[text,req.emotion,(req.tags||[]).join(' '),phase].join(' ').toLowerCase();
  if(/긴장|충격|분노|불안|질투|위험|heartbeat|dark/.test(hay))return 'tension';
  if(/슬픔|우울|후회|그리움|외로움|눈물|과거|past/.test(hay))return 'melancholy';
  if(/반전|비밀|reveal|진짜|결론/.test(hay))return 'reveal';
  if(/안도|행복|기쁨|평화|차분|calm|lavender/.test(hay))return 'calm';
  if(/설렘|연애|재회|유혹|romantic/.test(hay))return 'romantic';
  if(phase==='cta')return 'brand';
  return phase==='reveal'?'reveal':phase==='escalation'?'tension':'calm';
}
function scoreSceneMusicAsset(a,intent,text='',group='core',recentlyUsed=false){
  let score=scoreAudio(a,text,group,{recentlyUsed});
  const hay=[a.filename,a.mood,a.tags].join(' ').toLowerCase(),energy=safeNum(a.energy);
  const words={
    tension:['tension','tense','dark','heartbeat','긴장','불안','충격'],
    melancholy:['sad','past','memory','melancholy','그리움','슬픔','후회'],
    reveal:['reveal','mystery','crown','message','past','비밀','반전','dramatic'],
    calm:['calm','peace','soft','lavender','ambient','평화','차분'],
    romantic:['romantic','love','heart','설렘','연애','재회'],
    brand:['stella','스텔라','star','cinematic']
  }[intent]||[];
  for(const w of words)if(hay.includes(w))score+=9;
  const target={tension:8,melancholy:4,reveal:7,calm:3,romantic:5,brand:6}[intent]||5;
  if(energy)score+=Math.max(0,8-Math.abs(target-energy)*1.5);
  return score;
}
async function chooseMusic(env,project,scenes){
  const {results=[]}=await env.DB.prepare("SELECT * FROM audio_assets WHERE status='active' AND kind='music' ORDER BY id DESC LIMIT 500").all();
  if(!results.length)return null;
  const usedRows=project.batch_id?(await env.DB.prepare(`SELECT DISTINCT v.music_asset_id FROM video_plans v JOIN projects p ON p.id=v.project_id WHERE p.batch_id=? AND p.id<>? AND v.music_asset_id IS NOT NULL`).bind(project.batch_id,project.id).all()).results||[]:[];
  const recentlyUsed=new Set(usedRows.map(x=>Number(x.music_asset_id)));
  const phases=['hook','tension','escalation','reveal','cta'],phaseChoices={};
  for(const phase of phases){
    const bucket=scenes.filter((_,i)=>{const r=i/Math.max(1,scenes.length);return phase==='hook'?i===0:phase==='tension'?r<.34:phase==='escalation'?r>=.34&&r<.68:phase==='reveal'?r>=.68&&r<.9:i===scenes.length-1;});
    const text=[project.title,project.hook,...bucket.map(s=>s.scene_text)].join(' ');
    let req={};for(const s of bucket){try{const x=JSON.parse(s.requirement_json||'{}');if(x.emotion){req=x;break;}}catch(_){}}
    const intent=sceneMusicIntent(text,req,phase);
    const ranked=results.map(a=>({a,score:scoreSceneMusicAsset(a,intent,text,project.content_group,recentlyUsed.has(Number(a.id)))})).sort((x,y)=>y.score-x.score);
    if(ranked[0])phaseChoices[phase]={...publicAudio(ranked[0].a),match_score:Math.round(ranked[0].score*100)/100,intent};
  }
  const primary=phaseChoices.tension||phaseChoices.hook||phaseChoices.escalation||phaseChoices.reveal||phaseChoices.cta;
  return primary?{...primary,phase_choices:phaseChoices}:null;
}`;
source=source.slice(0,chooseStart)+chooseReplacement+source.slice(chooseEnd);

// 5) Manifest: narration off, subtitles required, 2-4 emotion-aware music segments with varied source offsets.
replaceOnce(
"quality_targets:{duration_min:50,duration_max:70,aspect:'9:16',narration_required:true,cta_required:true}",
"quality_targets:{duration_min:50,duration_max:70,aspect:'9:16',narration_required:false,subtitle_required:true,scene_music_required:true,cta_required:true}",
'manifest quality targets'
);

const manifestReturnAnchor="  return{version:11,project_id:project.id,title:project.title,hook:project.hook,cta:{headline:'고르는 사주가 아니라, 질문하는 사주.',subline:'@kstellaway · 프로필 링크'},";
if(!source.includes(manifestReturnAnchor))fail('manifest return anchor not found');
source=source.replace(manifestReturnAnchor,`  const phaseMap=music?.phase_choices||{};const rawMusic=[];
  for(const shot of shots){const key=shot.phase==='hook'?'hook':shot.phase==='tension'?'tension':shot.phase==='escalation'?'escalation':shot.phase==='reveal'?'reveal':'cta',m=phaseMap[key]||music;if(!m?.media_url)continue;const prev=rawMusic[rawMusic.length-1];if(prev&&prev.asset_id===m.id&&prev.intent===(m.intent||key)&&Math.abs(prev.end-shot.start)<.05){prev.end=shot.end;prev.duration=Math.round((prev.end-prev.start)*100)/100;continue;}rawMusic.push({asset_id:m.id,filename:m.filename,url:m.media_url,start:shot.start,end:shot.end,duration:shot.duration,intent:m.intent||key,source_offset:Math.max(0,Math.round(((shot.start*1.7+Number(m.id||0)*3.1)%48)*10)/10),volume:(m.intent==='tension'||m.intent==='reveal')?.62:.48,fade_in:.55,fade_out:.65,license_status:m.license_status||'unknown',license_note:m.license_note||'',source_url:m.source_url||'',match_score:m.match_score||0});}
  const musicSegments=rawMusic.slice(0,4);if(rawMusic.length>4){musicSegments[3].end=rawMusic[rawMusic.length-1].end;musicSegments[3].duration=Math.round((musicSegments[3].end-musicSegments[3].start)*100)/100;}
  return{version:11,project_id:project.id,title:project.title,hook:project.hook,cta:{headline:'고르는 사주가 아니라, 질문하는 사주.',subline:'@kstellaway · 프로필 링크'},`);

const oldMusicNarr=`music:music?{asset_id:music.id,filename:music.filename,url:music.media_url,bpm:music.bpm,tempo_class:music.tempo_class,energy:music.energy,mood:music.mood,match_score:music.match_score,license_status:music.license_status||'unknown',license_note:music.license_note||'',source_url:music.source_url||'',duck_under_narration:true,target_lufs:-18}:null,narration:narration?{id:narration.id,url:narration.media_url,mime_type:narration.mime_type,model:narration.model,lang:narration.lang,text:project.script,pace:'natural_drama'}:{text:project.script,language:'ko-KR',pace:'natural_drama',status:'not_generated'},shots`;
const newMusicNarr=`music:music?{asset_id:music.id,filename:music.filename,url:music.media_url,bpm:music.bpm,tempo_class:music.tempo_class,energy:music.energy,mood:music.mood,match_score:music.match_score,license_status:music.license_status||'unknown',license_note:music.license_note||'',source_url:music.source_url||''}:null,music_segments:musicSegments,narration:null,shots`;
replaceOnce(oldMusicNarr,newMusicNarr,'manifest music/narration');

// 6) Browser renderer: schedule music segments with source offsets and crossfades; never mix narration.
const audioOld=`  const AudioCtx=window.AudioContext||window.webkitAudioContext,ac=AudioCtx?new AudioCtx():null,dest=ac?ac.createMediaStreamDestination():null,audios=[],scheduledSfx=[];
  if(ac){await ac.resume();if(manifest.music?.url){const m=await makeAudioTrack(manifest.music.url,ac,dest,(manifest.narration?.url ? 0.18 : 0.55),true);if(m)audios.push(m);}if(manifest.narration?.url){const n=await makeAudioTrack(manifest.narration.url,ac,dest,.95,false);if(n)audios.push(n);}for(const shot of manifest.shots||[]){for(const cue of shot.sfx_assets||[]){try{const t=await makeAudioTrack(cue.url,ac,dest,Number(cue.volume||.4),false);if(t)scheduledSfx.push({track:t,start:Number(cue.start??shot.start??0)});}catch(e){console.warn('SFX load',e);}}}}`;
const audioNew=`  const AudioCtx=window.AudioContext||window.webkitAudioContext,ac=AudioCtx?new AudioCtx():null,dest=ac?ac.createMediaStreamDestination():null,musicSegments=[],scheduledSfx=[];
  if(ac){await ac.resume();for(const seg of manifest.music_segments||[]){try{const t=await makeAudioTrack(seg.url,ac,dest,0,false);if(t)musicSegments.push({track:t,...seg});}catch(e){console.warn('music segment load',e);}}for(const shot of manifest.shots||[]){for(const cue of shot.sfx_assets||[]){try{const t=await makeAudioTrack(cue.url,ac,dest,Number(cue.volume||.4),false);if(t)scheduledSfx.push({track:t,start:Number(cue.start??shot.start??0)});}catch(e){console.warn('SFX load',e);}}}}`;
replaceOnce(audioOld,audioNew,'renderer audio construction');

const startOld=`  const stopped=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error('영상 렌더링 오류'));});rec.start(1000);for(const x of audios){try{x.el.currentTime=0;await x.el.play();}catch(e){console.warn(e);}}const sfxTimers=scheduledSfx.map(x=>setTimeout(()=>{try{x.track.el.currentTime=0;x.track.el.play().catch(()=>{});}catch(_){}},Math.max(0,x.start*1000)));`;
const startNew=`  const stopped=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error('영상 렌더링 오류'));});rec.start(1000);const musicTimers=[];for(const seg of musicSegments){const startMs=Math.max(0,Number(seg.start||0)*1000),playMs=Math.max(300,Number(seg.end-seg.start||seg.duration||1)*1000);musicTimers.push(setTimeout(()=>{try{const el=seg.track.el,g=seg.track.gain,now=ac.currentTime,fadeIn=Math.max(.15,Number(seg.fade_in||.5)),fadeOut=Math.max(.15,Number(seg.fade_out||.6)),vol=Math.max(.05,Math.min(.8,Number(seg.volume||.5))),dur=Math.max(.5,playMs/1000),mediaDur=Number(el.duration||0),maxOffset=mediaDur>dur?Math.max(0,mediaDur-dur-.1):0;el.loop=mediaDur>0&&mediaDur<dur;el.currentTime=Math.min(Math.max(0,Number(seg.source_offset||0)),maxOffset);g.gain.cancelScheduledValues(now);g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(vol,now+fadeIn);g.gain.setValueAtTime(vol,now+Math.max(fadeIn,dur-fadeOut));g.gain.linearRampToValueAtTime(0,now+dur);el.play().catch(()=>{});setTimeout(()=>{try{el.pause();}catch(_){}},playMs+120);}catch(e){console.warn('music segment play',e);}},startMs));}const sfxTimers=scheduledSfx.map(x=>setTimeout(()=>{try{x.track.el.currentTime=0;x.track.el.play().catch(()=>{});}catch(_){}},Math.max(0,x.start*1000)));`;
replaceOnce(startOld,startNew,'renderer segment scheduling');

replaceOnce(
"  for(const timer of sfxTimers)clearTimeout(timer);for(const x of [...audios,...scheduledSfx.map(x=>x.track)]){try{x.el.pause();}catch(_){ }}rec.stop();",
"  for(const timer of [...musicTimers,...sfxTimers])clearTimeout(timer);for(const x of [...musicSegments.map(x=>x.track),...scheduledSfx.map(x=>x.track)]){try{x.el.pause();}catch(_){ }}rec.stop();",
'renderer cleanup'
);

replaceOnce("detail:'음악·나레이션 합성'","detail:'장면별 음악·효과음 합성'",'client preflight audio label');

// 7) Quality gate: subtitles and scene-matched music replace narration as hard requirements.
replaceOnce(
"push('narration',!!narr,!!narr?'info':'fail',narr?'나레이션 있음':'나레이션 없음');push('music',!!manifest.music,!!manifest.music?'info':'warn',manifest.music?'배경음악 있음':'배경음악 없음');",
"push('narration_policy',true,'info','사람 목소리 나레이션 미사용 · 자막형 영상');const subtitleShots=(manifest.shots||[]).filter(s=>Array.isArray(s.subtitle?.chunks)&&s.subtitle.chunks.length>0).length;push('subtitle_coverage',total>0&&subtitleShots===total,total>0&&subtitleShots===total?'info':'fail',`자막 장면 ${subtitleShots}/${total}`);const musicSegments=Array.isArray(manifest.music_segments)?manifest.music_segments:[];const musicCovered=musicSegments.reduce((n,s)=>n+Math.max(0,Number(s.end||0)-Number(s.start||0)),0);push('scene_music',musicSegments.length>=2&&musicCovered>=duration*.8,musicSegments.length>=2&&musicCovered>=duration*.8?'info':'fail',`감정 음악 구간 ${musicSegments.length}개 · ${musicCovered.toFixed(1)}초`);push('music',musicSegments.length>0,musicSegments.length>0?'info':'warn',musicSegments.length?'장면별 배경음악 있음':'배경음악 없음');",
'quality narration/music checks'
);

// All expected safety markers must survive assembly.
for(const token of [
  "const K_STELLA_CAST=['남주','여주','남주 친구','여주 친구','새로운 남자']",
  'function isKStellaStyleAsset',
  'KSTELLA_STYLE_LOCK_V1',
  'Never switch to photorealistic',
  "await markProductionItem(item,'processing','subtitles')",
  'narration_required:false',
  'subtitle_required:true',
  'scene_music_required:true',
  'music_segments:musicSegments',
  'narration:null',
  'function sceneMusicIntent',
  'scoreSceneMusicAsset',
  'musicSegments.push',
  'source_offset',
  "'narration_policy'",
  "'subtitle_coverage'",
  "'scene_music'"
])if(!source.includes(token))fail('required marker missing: '+token);

if(source.includes("await ensureProjectImages(projectId,item);await prepareNarration(projectId,item);"))fail('production narration call still present');
if(source.includes("if(manifest.narration?.url){const n=await makeAudioTrack"))fail('renderer narration mix still present');
if(source.includes("const best=ranked.find(x=>x.score>0)||ranked[0]"))fail('unsafe random asset fallback still present');

fs.writeFileSync(file,source);
console.log('STELLA PRODUCTION PATCH OK: five-character K STELLA WAY style lock, subtitle-only production, narration disabled, scene-aware multi-segment music with source offsets/crossfades, strict style-safe free reuse, and updated QC.');
