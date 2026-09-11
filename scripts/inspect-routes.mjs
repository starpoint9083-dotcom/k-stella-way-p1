import fs from 'node:fs';
const src = fs.readFileSync('src/index.js', 'utf8');
for (const needle of ['async function hmacB64','async function issueSession','/api/admin/login','/api/bootstrap/status','const path=','url.pathname','async fetch(request,env){']) {
  let from=0, count=0;
  console.log(`\n===== ${needle} =====`);
  while(count<5){
    const i=src.indexOf(needle,from); if(i<0) break; count++;
    console.log(`--- ${count} at ${i} ---`);
    console.log(src.slice(Math.max(0,i-1800), Math.min(src.length,i+needle.length+5000)).replace(/\r/g,''));
    from=i+needle.length;
  }
  if(!count) console.log('NOT FOUND');
}
