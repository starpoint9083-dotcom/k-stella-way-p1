import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');

const exactStart=`async function generateQueueImage(env,queueId){
  if(!env.AI) throw new Error('Workers AI 바인딩 AI가 연결되지 않았습니다.');
  await assertUsageWithinLimit(env,'image_generations','daily_image_limit',60);
  if(!env.ASSETS_BUCKET) throw new Error('R2 바인딩 ASSETS_BUCKET가 연결되지 않았습니다.');
  const q=await env.DB.prepare(\`SELECT q.*,p.episode_no,p.title project_title,s.scene_text FROM generation_queue q JOIN projects p ON p.id=q.project_id JOIN scenes s ON s.id=q.scene_id WHERE q.id=?\`).bind(Number(queueId)).first();
  if(!q) throw new Error('생성 대기 장면을 찾을 수 없습니다.');
  if(q.status==='linked'&&q.generated_asset_id){ const a=await env.DB.prepare('SELECT * FROM assets WHERE id=?').bind(q.generated_asset_id).first(); return {scene_no:q.scene_no,asset:publicAsset(a),already_done:true}; }
  const req=JSON.parse(q.requirement_json||'{}');`;

const helper=`async function reuseExistingAssetAtFreeLimit(env,q,req){
  const assets=await listActiveAssets(env);
  if(!assets.length)return null;
  const usedRows=(await env.DB.prepare('SELECT selected_asset_id AS id FROM scenes WHERE project_id=? AND selected_asset_id IS NOT NULL').bind(q.project_id).all()).results||[];
  const used=new Set(usedRows.map(x=>Number(x.id)).filter(Boolean));
  const ranked=assets.map(asset=>({asset,score:scoreAsset(asset,req,{alreadyUsed:used.has(Number(asset.id)),recentCount:0,signatureCount:0,framingCount:0,compositionCount:0})})).sort((a,b)=>b.score-a.score);
  const best=ranked.find(x=>x.score>0)||ranked[0];
  if(!best?.asset)return null;
  await linkAssetToQueue(env,q.id,best.asset.id);
  await env.DB.prepare('UPDATE assets SET usage_count=usage_count+1,last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(best.asset.id).run();
  await logEvent(env,'warn','ai','FREE_LIMIT_ASSET_REUSED','무료 이미지 한도 도달 · 기존 자산 재사용',q.project_id,{queue_id:q.id,scene_no:q.scene_no,asset_id:best.asset.id,match_score:best.score});
  return {scene_no:q.scene_no,asset:publicAsset(best.asset),reused:true,reused_due_to_free_limit:true,match_score:best.score};
}

`;

const replacement=`async function generateQueueImage(env,queueId){
  if(!env.ASSETS_BUCKET) throw new Error('R2 바인딩 ASSETS_BUCKET가 연결되지 않았습니다.');
  const q=await env.DB.prepare(\`SELECT q.*,p.episode_no,p.title project_title,s.scene_text FROM generation_queue q JOIN projects p ON p.id=q.project_id JOIN scenes s ON s.id=q.scene_id WHERE q.id=?\`).bind(Number(queueId)).first();
  if(!q) throw new Error('생성 대기 장면을 찾을 수 없습니다.');
  if(q.status==='linked'&&q.generated_asset_id){ const a=await env.DB.prepare('SELECT * FROM assets WHERE id=?').bind(q.generated_asset_id).first(); return {scene_no:q.scene_no,asset:publicAsset(a),already_done:true}; }
  const req=JSON.parse(q.requirement_json||'{}');
  try{
    await assertUsageWithinLimit(env,'image_generations','daily_image_limit',60);
  }catch(err){
    if(String(err?.message||err).includes('image_generations')){
      const reused=await reuseExistingAssetAtFreeLimit(env,q,req);
      if(reused)return reused;
    }
    throw err;
  }
  if(!env.AI) throw new Error('Workers AI 바인딩 AI가 연결되지 않았습니다.');`;

const count=source.split(exactStart).length-1;
if(count!==1){
  console.error(`Free asset reuse patch failed: expected exact generateQueueImage start once, found ${count}.`);
  process.exit(1);
}

source=source.replace(exactStart,helper+replacement);

for(const token of [
  'reuseExistingAssetAtFreeLimit',
  'FREE_LIMIT_ASSET_REUSED',
  'reused_due_to_free_limit:true',
  "assertUsageWithinLimit(env,'image_generations','daily_image_limit',60)",
  "logEvent(env,'warn','ai','FREE_LIMIT_ASSET_REUSED'"
]){
  if(!source.includes(token)){
    console.error('Free asset reuse patch failed: required marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('FREE ASSET REUSE PATCH OK: daily image cap remains 60; after the free cap is reached, the best existing active asset is linked and AI image generation is not called.');
