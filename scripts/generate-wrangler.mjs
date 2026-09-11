import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const targetName = 'k-stella-shorts-factory';
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
fs.writeFileSync('wrangler.generated.toml', tpl.replace('__D1_DATABASE_ID__', id));
console.log(`Generated wrangler.generated.toml using existing D1 ${targetName}`);
