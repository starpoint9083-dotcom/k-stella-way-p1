import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const input='scripts/patch-stella-subtitle-music-style.mjs';
const temp='scripts/.patch-stella-subtitle-music-style.normalized.mjs';
let patch=fs.readFileSync(input,'utf8');

const badSql="env.DB.prepare(`SELECT DISTINCT v.music_asset_id FROM video_plans v JOIN projects p ON p.id=v.project_id WHERE p.batch_id=? AND p.id<>? AND v.music_asset_id IS NOT NULL`)";
const goodSql='env.DB.prepare("SELECT DISTINCT v.music_asset_id FROM video_plans v JOIN projects p ON p.id=v.project_id WHERE p.batch_id=? AND p.id<>? AND v.music_asset_id IS NOT NULL")';
if(!patch.includes(badSql)){console.error('STELLA PATCH RUNNER FAILED: expected SQL template anchor not found');process.exit(1);}
patch=patch.replace(badSql,goodSql);

// Client code lives inside the assembled APP_JS template. Remove fragile exact-string client replacements
// from the core patch, then patch the embedded client by bounded anchors after server-side changes succeed.
const manualStart=patch.indexOf('const manualOld=');
const manualEnd=patch.indexOf('// 4) Scene-aware multi-segment music selection.',manualStart);
if(manualStart<0||manualEnd<0){console.error('STELLA PATCH RUNNER FAILED: manual-render normalization anchors not found');process.exit(1);}
patch=patch.slice(0,manualStart)+"// manual client patch deferred to runner.\n\n"+patch.slice(manualEnd);

const renderStart=patch.indexOf('// 6) Browser renderer:');
const renderEnd=patch.indexOf('// 7) Quality gate:',renderStart);
if(renderStart<0||renderEnd<0){console.error('STELLA PATCH RUNNER FAILED: renderer normalization anchors not found');process.exit(1);}
patch=patch.slice(0,renderStart)+"// browser renderer patch deferred to runner.\n\n"+patch.slice(renderEnd);

const verifyStart=patch.indexOf('// All expected safety markers must survive assembly.');
const writeStart=patch.indexOf('fs.writeFileSync(file,source);',verifyStart);
if(verifyStart<0||writeStart<0){console.error('STELLA PATCH RUNNER FAILED: verification normalization anchors not found');process.exit(1);}
patch=patch.slice(0,verifyStart)+"// final policy verification is performed by runner + preflight after embedded client patching.\n\n"+patch.slice(writeStart);

fs.writeFileSync(temp,patch);
try{
  await import(pathToFileURL(path.resolve(temp)).href+'?v='+Date.now());

  let app=fs.readFileSync('src/index.js','utf8');

  // Manual render: subtitle-only. Never call narration APIs.
  const buttonStart=app.indexOf("$('#autoRenderBtn').onclick=async()=>{");
  const buttonEnd=app.indexOf("\n};",buttonStart);
  if(buttonStart<0||buttonEnd<0){console.error('STELLA PATCH RUNNER FAILED: auto render button block not found');process.exit(1);}
  let block=app.slice(buttonStart,buttonEnd+3);
  const narrationStart=block.indexOf("setRenderProgress('1/4 한국어 나레이션");
  const planAnchor="setRenderProgress('2/4 기존 자산과 음악으로 영상 타임라인을 설계합니다.',25);const manifest=await buildVideoPlan(projectId);";
  const narrationEnd=block.indexOf(planAnchor);
  if(narrationStart<0||narrationEnd<0){console.error('STELLA PATCH RUNNER FAILED: manual narration range not found');process.exit(1);}
  block=block.slice(0,narrationStart)+"setRenderProgress('1/3 장면 자막과 감정선을 확인하고 있습니다.',8);setRenderProgress('2/3 장면 감정에 맞는 음악 구간으로 타임라인을 설계합니다.',25);const manifest=await buildVideoPlan(projectId);"+block.slice(narrationEnd+planAnchor.length);
  block=block.replace("setRenderProgress('3/4 휴대폰에서 실제 쇼츠 파일을 렌더링합니다.',38);","setRenderProgress('3/3 휴대폰에서 자막형 쇼츠 파일을 렌더링합니다.',38);");
  block=block.replace("setRenderProgress('4/4 완성 영상을 확인합니다.',100);","");
  if(block.includes('/api/narration/generate')||block.includes("/api/narration?project_id=")){console.error('STELLA PATCH RUNNER FAILED: manual render still contains narration API');process.exit(1);}
  app=app.slice(0,buttonStart)+block+app.slice(buttonEnd+3);

  // Renderer setup: load only scene-matched music segments + SFX. No narration track and no one-song loop.
  const audioStart=app.indexOf('const AudioCtx=window.AudioContext||window.webkitAudioContext');
  const streamAnchor='const stream=canvas.captureStream(30);';
  const audioEnd=app.indexOf(streamAnchor,audioStart);
  if(audioStart<0||audioEnd<0){console.error('STELLA PATCH RUNNER FAILED: renderer audio bounds not found');process.exit(1);}
  const audioReplacement="const AudioCtx=window.AudioContext||window.webkitAudioContext,ac=AudioCtx?new AudioCtx():null,dest=ac?ac.createMediaStreamDestination():null,musicSegments=[],scheduledSfx=[];if(ac){await ac.resume();for(const seg of manifest.music_segments||[]){try{const t=await makeAudioTrack(seg.url,ac,dest,0,false);if(t)musicSegments.push({track:t,...seg});}catch(e){console.warn('music segment load',e);}}for(const shot of manifest.shots||[]){for(const cue of shot.sfx_assets||[]){try{const t=await makeAudioTrack(cue.url,ac,dest,Number(cue.volume||.4),false);if(t)scheduledSfx.push({track:t,start:Number(cue.start??shot.start??0)});}catch(e){console.warn('SFX load',e);}}}}";
  app=app.slice(0,audioStart)+audioReplacement+app.slice(audioEnd);

  // Renderer start: schedule each emotional music segment with a different source section and crossfade.
  const recStart=app.indexOf('const stopped=new Promise((resolve,reject)=>',audioStart);
  const totalAnchor='const total=Number(manifest.actual_duration)||60,start=performance.now();';
  const recEnd=app.indexOf(totalAnchor,recStart);
  if(recStart<0||recEnd<0){console.error('STELLA PATCH RUNNER FAILED: recorder scheduling bounds not found');process.exit(1);}
  const scheduleReplacement="const stopped=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error('영상 렌더링 오류'));});rec.start(1000);const musicTimers=[];for(const seg of musicSegments){const startMs=Math.max(0,Number(seg.start||0)*1000),playMs=Math.max(300,Number((seg.end||0)-(seg.start||0)||seg.duration||1)*1000);musicTimers.push(setTimeout(()=>{try{const el=seg.track.el,g=seg.track.gain,now=ac.currentTime,fadeIn=Math.max(.15,Number(seg.fade_in||.5)),fadeOut=Math.max(.15,Number(seg.fade_out||.6)),vol=Math.max(.05,Math.min(.8,Number(seg.volume||.5))),dur=Math.max(.5,playMs/1000),mediaDur=Number(el.duration||0),maxOffset=mediaDur>dur?Math.max(0,mediaDur-dur-.1):0;el.loop=mediaDur>0&&mediaDur<dur;el.currentTime=Math.min(Math.max(0,Number(seg.source_offset||0)),maxOffset);g.gain.cancelScheduledValues(now);g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(vol,now+fadeIn);g.gain.setValueAtTime(vol,now+Math.max(fadeIn,dur-fadeOut));g.gain.linearRampToValueAtTime(0,now+dur);el.play().catch(()=>{});setTimeout(()=>{try{el.pause();}catch(_){}},playMs+120);}catch(e){console.warn('music segment play',e);}},startMs));}const sfxTimers=scheduledSfx.map(x=>setTimeout(()=>{try{x.track.el.currentTime=0;x.track.el.play().catch(()=>{});}catch(_){}},Math.max(0,x.start*1000)));";
  app=app.slice(0,recStart)+scheduleReplacement+app.slice(recEnd);

  const cleanupStart=app.indexOf('for(const timer of sfxTimers)clearTimeout(timer);',recEnd);
  const cleanupEnd=app.indexOf('rec.stop();',cleanupStart);
  if(cleanupStart<0||cleanupEnd<0){console.error('STELLA PATCH RUNNER FAILED: renderer cleanup bounds not found');process.exit(1);}
  const cleanupReplacement="for(const timer of [...musicTimers,...sfxTimers])clearTimeout(timer);for(const x of [...musicSegments.map(x=>x.track),...scheduledSfx.map(x=>x.track)]){try{x.el.pause();}catch(_){ }}rec.stop();";
  app=app.slice(0,cleanupStart)+cleanupReplacement+app.slice(cleanupEnd+'rec.stop();'.length);
  app=app.replace("detail:'음악·나레이션 합성'","detail:'장면별 음악·효과음 합성'");

  const required=["const K_STELLA_CAST=['남주','여주','남주 친구','여주 친구','새로운 남자']",'function isKStellaStyleAsset','KSTELLA_STYLE_LOCK_V1','Never switch to photorealistic',"await markProductionItem(item,'processing','subtitles')",'narration_required:false','subtitle_required:true','scene_music_required:true','music_segments:musicSegments','narration:null','function sceneMusicIntent','scoreSceneMusicAsset','musicSegments.push','source_offset',"'narration_policy'","'subtitle_coverage'","'scene_music'",'장면별 음악·효과음 합성'];
  for(const token of required)if(!app.includes(token)){console.error('STELLA PATCH RUNNER FAILED: required final marker missing: '+token);process.exit(1);}
  if(app.includes("await ensureProjectImages(projectId,item);await prepareNarration(projectId,item);")){console.error('STELLA PATCH RUNNER FAILED: production narration call remains');process.exit(1);}
  if(app.includes("if(manifest.narration?.url){const n=await makeAudioTrack")){console.error('STELLA PATCH RUNNER FAILED: narration mix remains');process.exit(1);}
  if(app.includes("const best=ranked.find(x=>x.score>0)||ranked[0]")){console.error('STELLA PATCH RUNNER FAILED: unsafe random asset fallback remains');process.exit(1);}
  fs.writeFileSync('src/index.js',app);
  console.log('STELLA CLIENT PATCH OK: subtitle-only renderer, scene music segments with source offsets/crossfades, no narration APIs or narration mix.');
} finally {
  try{fs.unlinkSync(temp);}catch(_){ }
}
