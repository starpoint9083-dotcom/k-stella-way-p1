const url = process.env.DEPLOY_URL;
if (!url) { console.error('DEPLOY_URL is missing'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = '';
for (let i = 1; i <= 12; i++) {
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/healthz`, { redirect: 'follow' });
    const text = await r.text();
    last = `${r.status} ${text.slice(0, 1000)}`;
    if (r.ok) {
      let j; try { j = JSON.parse(text); } catch {}
      if (j && Number(j.version) === 11 && j.db === true && j.r2 === true && j.ai === true) {
        console.log(`E2E OK on attempt ${i}: version=11 db/r2/ai=true`);
        process.exit(0);
      }
    }
  } catch (e) { last = String(e); }
  console.log(`Health check ${i}/12 not ready yet: ${last.slice(0, 300)}`);
  if (i < 12) await sleep(10000);
}
console.error(`E2E FAILED after retries: ${last}`);
process.exit(1);
