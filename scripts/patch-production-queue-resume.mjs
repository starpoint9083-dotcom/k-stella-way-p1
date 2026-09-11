import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');

const productionExact=`      else await env.DB.prepare("UPDATE production_items SET status='queued',stage='resume',last_error='',attempt_count=0,last_retry_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status IN ('processing','failed')").bind(run.id).run();`;
const productionReplacement=`      else await env.DB.prepare("UPDATE production_items SET status='queued',stage='resume',last_error='',attempt_count=0,last_retry_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status IN ('processing','failed')").bind(run.id).run();
      const queueResume=await env.DB.prepare("UPDATE generation_queue SET status='waiting',last_error='',updated_at=CURRENT_TIMESTAMP WHERE project_id IN (SELECT project_id FROM lineup_items WHERE lineup_id=?) AND generated_asset_id IS NULL AND status IN ('cancelled','generating')").bind(lineupId).run();
      await logEvent(env,'info','production','queue_resume','중단된 부족 장면 큐 복구','',{lineup_id:lineupId,run_id:run.id,restored:Number(queueResume?.meta?.changes||0),recoverable_statuses:['cancelled','generating']});`;

const productionCount=source.split(productionExact).length-1;
if(productionCount!==1){
  console.error(`Production queue resume patch failed: expected production resume line once, found ${productionCount}.`);
  process.exit(1);
}
source=source.replace(productionExact,productionReplacement);

const ensureAnchor=`async function ensureLineupProjects(env,lineupId){`;
const ensureCount=source.split(ensureAnchor).length-1;
if(ensureCount!==1){
  console.error(`Missing queue rebuild patch failed: expected ensureLineupProjects once, found ${ensureCount}.`);
  process.exit(1);
}

const rebuildHelper=`async function rebuildMissingGenerationQueue(env,projectId){
  const {results=[]}=await env.DB.prepare(\`SELECT s.id,s.scene_no,s.scene_text,s.requirement_json,s.selected_asset_id FROM scenes s LEFT JOIN generation_queue q ON q.scene_id=s.id WHERE s.project_id=? AND s.missing=1 AND q.id IS NULL ORDER BY s.scene_no\`).bind(projectId).all();
  let rebuilt=0,reconciled=0;
  for(const scene of results){
    const activeAsset=scene.selected_asset_id?await env.DB.prepare("SELECT id FROM assets WHERE id=? AND status='active'").bind(scene.selected_asset_id).first():null;
    if(activeAsset){
      await env.DB.prepare('UPDATE scenes SET missing=0 WHERE id=?').bind(scene.id).run();
      reconciled++;
      continue;
    }
    let req={};try{req=JSON.parse(scene.requirement_json||'{}');}catch(_){req={};}
    const refs=await getReferenceAssets(env,req),prompt=buildPrompt(scene.scene_text,req,refs.length>0),requirementJson=String(scene.requirement_json||JSON.stringify(req));
    const inserted=await env.DB.prepare(\`INSERT INTO generation_queue(project_id,scene_id,scene_no,requirement_json,prompt,status) SELECT ?,?,?,?,?, 'waiting' WHERE NOT EXISTS (SELECT 1 FROM generation_queue WHERE scene_id=?)\`).bind(projectId,scene.id,scene.scene_no,requirementJson,prompt,scene.id).run();
    const changes=Number(inserted?.meta?.changes||0);
    if(changes){await env.DB.prepare('UPDATE scenes SET missing=1 WHERE id=?').bind(scene.id).run();rebuilt+=changes;}
  }
  if(reconciled)await logEvent(env,'info','production','scene_state_reconciled','기존 active 자산 장면 상태 복구',projectId,{reconciled});
  if(rebuilt)await logEvent(env,'warn','production','queue_rebuilt','누락된 부족 장면 큐 재생성',projectId,{rebuilt});
  return {rebuilt,reconciled};
}

`;
source=source.replace(ensureAnchor,rebuildHelper+ensureAnchor);

const reusedExact=`    if(item.project_id){planned.push({slot_no:item.slot_no,project_id:item.project_id,reused:true});continue;}`;
const reusedReplacement=`    if(item.project_id){const recovery=await rebuildMissingGenerationQueue(env,item.project_id),status=await updateProjectStatus(env,item.project_id);planned.push({slot_no:item.slot_no,project_id:item.project_id,reused:true,status,queue_rebuilt:recovery.rebuilt,scene_reconciled:recovery.reconciled});continue;}`;
const reusedCount=source.split(reusedExact).length-1;
if(reusedCount!==1){
  console.error(`Missing queue rebuild patch failed: expected reused-project branch once, found ${reusedCount}.`);
  process.exit(1);
}
source=source.replace(reusedExact,reusedReplacement);

for(const token of [
  "generated_asset_id IS NULL",
  "status IN ('cancelled','generating')",
  "SET status='waiting',last_error=''",
  "'queue_resume'",
  "중단된 부족 장면 큐 복구",
  "recoverable_statuses:['cancelled','generating']",
  'async function rebuildMissingGenerationQueue',
  'LEFT JOIN generation_queue q ON q.scene_id=s.id',
  's.missing=1 AND q.id IS NULL',
  "SELECT id FROM assets WHERE id=? AND status='active'",
  "UPDATE scenes SET missing=0 WHERE id=?",
  "'scene_state_reconciled'",
  '기존 active 자산 장면 상태 복구',
  "WHERE NOT EXISTS (SELECT 1 FROM generation_queue WHERE scene_id=?)",
  "'queue_rebuilt'",
  '누락된 부족 장면 큐 재생성',
  'queue_rebuilt:recovery.rebuilt',
  'scene_reconciled:recovery.reconciled'
]){
  if(!source.includes(token)){
    console.error('Production queue recovery patch failed: required marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('PRODUCTION QUEUE RECOVERY PATCH OK: stale missing flags with valid active assets are reconciled; only truly asset-less missing scenes rebuild absent queues; stale queue recovery and zero-cost asset reuse remain intact.');
