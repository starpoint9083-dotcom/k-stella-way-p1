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

const apiAnchor=`  if(path==='/api/health'&&request.method==='GET')`;
const apiAnchorCount=source.split(apiAnchor).length-1;
if(apiAnchorCount!==1){
  console.error(`Explicit lineup recovery API patch failed: expected health API anchor once, found ${apiAnchorCount}.`);
  process.exit(1);
}
const recoveryRoute=`  if(path==='/api/maintenance/recover-lineup-queues'&&request.method==='POST'){
    const d=await readJson(request),lineupId=String(d.lineup_id||'');
    if(!lineupId)return json({ok:false,error:'편성표 ID가 필요합니다.'},400);
    try{
      const lineup=await env.DB.prepare('SELECT id FROM daily_lineups WHERE id=?').bind(lineupId).first();
      if(!lineup)return json({ok:false,error:'편성표를 찾을 수 없습니다.'},404);
      const {results=[]}=await env.DB.prepare('SELECT slot_no,project_id FROM lineup_items WHERE lineup_id=? AND project_id IS NOT NULL ORDER BY slot_no').bind(lineupId).all();
      let rebuilt=0,reconciled=0;const projects=[];
      for(const row of results){
        const projectId=String(row.project_id||'');if(!projectId)continue;
        const recovery=await rebuildMissingGenerationQueue(env,projectId);
        const status=await updateProjectStatus(env,projectId);
        const sceneStat=await env.DB.prepare('SELECT COUNT(*) total,SUM(CASE WHEN selected_asset_id IS NULL OR missing=1 THEN 1 ELSE 0 END) missing FROM scenes WHERE project_id=?').bind(projectId).first();
        const {results:waitingRows=[]}=await env.DB.prepare("SELECT id,project_id,scene_id,scene_no,status FROM generation_queue WHERE project_id=? AND status='waiting' ORDER BY scene_no,id").bind(projectId).all();
        rebuilt+=Number(recovery.rebuilt||0);reconciled+=Number(recovery.reconciled||0);
        projects.push({slot_no:Number(row.slot_no||0),project_id:projectId,rebuilt:Number(recovery.rebuilt||0),reconciled:Number(recovery.reconciled||0),missing:Number(sceneStat?.missing||0),waiting:waitingRows.length,waiting_queue:waitingRows.map(q=>({id:Number(q.id),project_id:String(q.project_id||projectId),scene_id:String(q.scene_id||''),scene_no:Number(q.scene_no||0),status:String(q.status||'waiting')})),status});
      }
      await logEvent(env,'warn','production','lineup_queue_recovery','편성표 부족 장면 큐 명시 복구','',{lineup_id:lineupId,project_count:projects.length,rebuilt,reconciled});
      return json({ok:true,lineup_id:lineupId,project_count:projects.length,rebuilt,reconciled,projects});
    }catch(e){
      await logEvent(env,'error','production','lineup_queue_recovery_failed',e.message||String(e),'',{lineup_id:lineupId});
      return json({ok:false,error:e.message||String(e)},500);
    }
  }

`;
source=source.replace(apiAnchor,recoveryRoute+apiAnchor);

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
  'scene_reconciled:recovery.reconciled',
  "/api/maintenance/recover-lineup-queues",
  "SELECT id,project_id,scene_id,scene_no,status FROM generation_queue WHERE project_id=? AND status='waiting'",
  'waiting_queue:waitingRows.map',
  "'lineup_queue_recovery'",
  '편성표 부족 장면 큐 명시 복구',
  'project_count:projects.length,rebuilt,reconciled,projects'
]){
  if(!source.includes(token)){
    console.error('Production queue recovery patch failed: required marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('PRODUCTION QUEUE RECOVERY PATCH OK: explicit authenticated lineup recovery API now returns concrete waiting queue ids; stale missing flags reconcile, truly asset-less scenes rebuild queues, stale queues resume, and zero-cost asset reuse remains intact.');
