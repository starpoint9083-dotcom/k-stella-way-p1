import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const targetName = 'k-stella-shorts-factory';
const kvId = String(process.env.KV_NAMESPACE_ID || '').trim();
if (!kvId) {
  console.error('KV_NAMESPACE_ID is missing. The workflow must resolve/create the free KV namespace first.');
  process.exit(1);
}

let raw;
try {
  raw = execFileSync('npx', ['wrangler', 'd1', 'list', '--json'], { encoding: 'utf8', stdio: ['ignore','pipe','inherit'] });
} catch (e) {
  console.error('Failed to list D1 databases. Check CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID.');
  process.exit(1);
}
let dbs;
try { dbs = JSON.parse(raw); } catch {
  console.error('Could not parse `wrangler d1 list --json` output.');
  process.exit(1);
}
const hit = dbs.find(x => x.name === targetName);
if (!hit) {
  console.error(`Existing D1 database not found: ${targetName}`);
  process.exit(1);
}
const id = hit.uuid || hit.id;
if (!id) {
  console.error(`D1 database found but id/uuid missing: ${targetName}`);
  process.exit(1);
}
const tpl = fs.readFileSync('wrangler.template.toml', 'utf8');
const generated = tpl
  .replace('__D1_DATABASE_ID__', id)
  .replace('__KV_NAMESPACE_ID__', kvId);
if (generated.includes('__D1_DATABASE_ID__') || generated.includes('__KV_NAMESPACE_ID__')) {
  console.error('Generated Wrangler config still contains unresolved placeholders.');
  process.exit(1);
}
fs.writeFileSync('wrangler.generated.toml', generated);
console.log(`Generated wrangler.generated.toml using D1 ${targetName} + zero-cost KV namespace.`);
