import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const input='scripts/patch-stella-subtitle-music-style.mjs';
const temp='scripts/.patch-stella-subtitle-music-style.normalized.mjs';
let patch=fs.readFileSync(input,'utf8');

const badSql="env.DB.prepare(`SELECT DISTINCT v.music_asset_id FROM video_plans v JOIN projects p ON p.id=v.project_id WHERE p.batch_id=? AND p.id<>? AND v.music_asset_id IS NOT NULL`)";
const goodSql='env.DB.prepare("SELECT DISTINCT v.music_asset_id FROM video_plans v JOIN projects p ON p.id=v.project_id WHERE p.batch_id=? AND p.id<>? AND v.music_asset_id IS NOT NULL")';
if(!patch.includes(badSql)){
  console.error('STELLA PATCH RUNNER FAILED: expected SQL template anchor not found');
  process.exit(1);
}
patch=patch.replace(badSql,goodSql);

// The UI block has minor whitespace differences across V11 assembly. Remove the fragile exact-string patch
// and apply a bounded regex to the assembled source after the main production patch succeeds.
const manualStart=patch.indexOf('const manualOld=');
const manualEnd=patch.indexOf('// 4) Scene-aware multi-segment music selection.',manualStart);
if(manualStart<0||manualEnd<0){
  console.error('STELLA PATCH RUNNER FAILED: manual-render normalization anchors not found');
  process.exit(1);
}
patch=patch.slice(0,manualStart)+"// manual-render narration removal is applied by the runner after the core patch.\n\n"+patch.slice(manualEnd);

fs.writeFileSync(temp,patch);
try{
  await import(pathToFileURL(path.resolve(temp)).href+'?v='+Date.now());

  let app=fs.readFileSync('src/index.js','utf8');
  const buttonStart=app.indexOf("$('#autoRenderBtn').onclick=async()=>{");
  const buttonEnd=app.indexOf("\n};",buttonStart);
  if(buttonStart<0||buttonEnd<0){
    console.error('STELLA PATCH RUNNER FAILED: auto render button block not found');
    process.exit(1);
  }
  let block=app.slice(buttonStart,buttonEnd+3);
  const narrationStart=block.indexOf("setRenderProgress('1/4 한국어 나레이션");
  const planAnchor="setRenderProgress('2/4 기존 자산과 음악으로 영상 타임라인을 설계합니다.',25);const manifest=await buildVideoPlan(projectId);";
  const narrationEnd=block.indexOf(planAnchor);
  if(narrationStart<0||narrationEnd<0){
    console.error('STELLA PATCH RUNNER FAILED: manual narration range not found');
    process.exit(1);
  }
  block=block.slice(0,narrationStart)+"setRenderProgress('1/3 장면 자막과 감정선을 확인하고 있습니다.',8);setRenderProgress('2/3 장면 감정에 맞는 음악 구간으로 타임라인을 설계합니다.',25);const manifest=await buildVideoPlan(projectId);"+block.slice(narrationEnd+planAnchor.length);
  block=block.replace("setRenderProgress('3/4 휴대폰에서 실제 쇼츠 파일을 렌더링합니다.',38);","setRenderProgress('3/3 휴대폰에서 자막형 쇼츠 파일을 렌더링합니다.',38);");
  block=block.replace("setRenderProgress('4/4 완성 영상을 확인합니다.',100);","");
  if(block.includes('/api/narration/generate')||block.includes("/api/narration?project_id=")){
    console.error('STELLA PATCH RUNNER FAILED: manual render still contains narration API');
    process.exit(1);
  }
  app=app.slice(0,buttonStart)+block+app.slice(buttonEnd+3);
  fs.writeFileSync('src/index.js',app);
  console.log('STELLA MANUAL RENDER PATCH OK: manual renderer is subtitle-only and does not request narration.');
} finally {
  try{fs.unlinkSync(temp);}catch(_){ }
}
