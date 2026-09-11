import fs from 'node:fs';

const file='src/index.js';
let source=fs.readFileSync(file,'utf8');

const exact=`      else await env.DB.prepare("UPDATE production_items SET status='queued',stage='resume',last_error='',attempt_count=0,last_retry_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status IN ('processing','failed')").bind(run.id).run();`;
const replacement=`      else await env.DB.prepare("UPDATE production_items SET status='queued',stage='resume',last_error='',attempt_count=0,last_retry_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=? AND status IN ('processing','failed')").bind(run.id).run();
      const queueResume=await env.DB.prepare("UPDATE generation_queue SET status='waiting',last_error='',updated_at=CURRENT_TIMESTAMP WHERE project_id IN (SELECT project_id FROM lineup_items WHERE lineup_id=?) AND status='cancelled'").bind(lineupId).run();
      await logEvent(env,'info','production','queue_resume','취소된 부족 장면 큐 복구','',{lineup_id:lineupId,run_id:run.id,restored:Number(queueResume?.meta?.changes||0)});`;

const count=source.split(exact).length-1;
if(count!==1){
  console.error(`Production queue resume patch failed: expected production resume line once, found ${count}.`);
  process.exit(1);
}

source=source.replace(exact,replacement);

for(const token of [
  "status='cancelled'",
  "SET status='waiting',last_error=''",
  "'queue_resume'",
  "취소된 부족 장면 큐 복구"
]){
  if(!source.includes(token)){
    console.error('Production queue resume patch failed: required marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file,source);
console.log('PRODUCTION QUEUE RESUME PATCH OK: production resume restores cancelled missing-scene queues to waiting so zero-cost asset reuse can run before rendering.');
