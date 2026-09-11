import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');

const marker=`async function generateQueueImage(env,queueId){
  if(!env.AI) throw new Error('Workers AI 바인딩이 필요합니다.');
  await assertUsageWithinLimit(env,'image_generations','daily_image_limit',60);
  if(!env.ASSETS_BUCKET) throw new Error('ASSETS_BUCKET 바인딩이 필요합니다.');
  const q=await env.DB.prepare('SELECT q.*,p.title,p.hook FROM generation_queue q JOIN projects p ON p.id=q.project_id WHERE q.id=?').bind(queueId).first();
  if(!q) throw new Error('생성 큐를 찾을 수 없습니다.');
  if(q.status==='linked'&&q.linked_asset_id){const a=await env.DB.prepare('SELECT * FROM assets WHERE id=?').bind(q.linked_asset_id).first();return {scene_no:q.scene_no,asset:publicAsset(a),reused:true};}
  const req=JSON.parse(q.requirement_json||'{}');`;

if(!source.includes(marker)){
  console.error('Free asset reuse patch failed: generateQueueImage marker not found.');
  process.exit(1);
}

const replacement=`async function reuseExistingAssetAtFreeLimit(env,q,req){
  const assets=await listActiveAssets(env);
  if(!assets.length)return null;
  const usedRows=(await env.DB.prepare('SELECT selected_asset_id AS id FROM scenes WHERE project_id=? AND selected_asset_id IS NOT NULL').bind(q.project_id).all()).results||[];
  const used=new Set(usedRows.map(x=>x.id).filter(Boolean));
  const ranked=assets.map(a=>({asset:a,score:scoreAsset(a,req,{alreadyUsed:used.has(a.id),recentCount:0,signatureCount:0,framingCount:0,compositionCount:0})})).sort((a,b)=>b.score-a.score);
  const best=ranked.find(x=>x.score>0)||ranked[0];
  if(!best?.asset)return null;
  await linkAssetToQueue(env,q,best.asset.id);
  await env.DB.prepare('UPDATE assets SET usage_count=usage_count+1,last_used_at=CURRENT_TIMESTAMP WHERE id=?').bind(best.asset.id).run();
  await logEvent(env,'FREE_LIMIT_ASSET_REUSED',{queue_id:q.id,project_id:q.project_id,scene_no:q.scene_no,asset_id:best.asset.id,match_score:best.score});
  return {scene_no:q.scene_no,asset:publicAsset(best.asset),reused:true,reused_due_to_free_limit:true,match_score:best.score};
}
async function generateQueueImage(env,queueId){
  if(!env.ASSETS_BUCKET) throw new Error('ASSETS_BUCKET 바인딩이 필요합니다.');
  const q=await env.DB.prepare('SELECT q.*,p.title,p.hook FROM generation_queue q JOIN projects p ON p.id=q.project_id WHERE q.id=?').bind(queueId).first();
  if(!q) throw new Error('생성 큐를 찾을 수 없습니다.');
  if(q.status==='linked'&&q.linked_asset_id){const a=await env.DB.prepare('SELECT * FROM assets WHERE id=?').bind(q.linked_asset_id).first();return {scene_no:q.scene_no,asset:publicAsset(a),reused:true};}
  const req=JSON.parse(q.requirement_json||'{}');
  try{await assertUsageWithinLimit(env,'image_generations','daily_image_limit',60);}catch(err){
    if(String(err?.message||err).includes('image_generations')){
      const reused=await reuseExistingAssetAtFreeLimit(env,q,req);
      if(reused)return reused;
    }
    throw err;
  }
  if(!env.AI) throw new Error('Workers AI 바인딩이 필요합니다.');`;

source=source.replace(marker,replacement);

for(const token of [
  'reuseExistingAssetAtFreeLimit',
  'FREE_LIMIT_ASSET_REUSED',
  'reused_due_to_free_limit:true',
  "assertUsageWithinLimit(env,'image_generations','daily_image_limit',60)"
]){
  if(!source.includes(token)){
    console.error('Free asset reuse patch failed: required marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('FREE ASSET REUSE PATCH OK: when daily image generation is exhausted, the best existing active asset is linked instead of increasing paid AI usage.');
