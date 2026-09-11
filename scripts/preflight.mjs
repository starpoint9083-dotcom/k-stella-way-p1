import fs from 'node:fs';

const source = fs.readFileSync('src/index.js', 'utf8');
const tpl = fs.readFileSync('wrangler.template.toml', 'utf8');
const requiredSource = [
  'K STELLA WAY Shorts Factory V11',
  'export default',
  '/healthz',
  'ASSETS_BUCKET',
  'env.DB',
  'env.AI'
];
const requiredConfig = [
  'name = "k-stella-shorts-factory"',
  'binding = "DB"',
  'database_name = "k-stella-shorts-factory"',
  'binding = "ASSETS_BUCKET"',
  'bucket_name = "k-stella-shorts-assets"',
  'binding = "AI"'
];
const missing = [];
for (const token of requiredSource) if (!source.includes(token)) missing.push(`source:${token}`);
for (const token of requiredConfig) if (!tpl.includes(token)) missing.push(`config:${token}`);
if (/CLOUDFLARE_API_TOKEN\s*=|api[_-]?token\s*[:=]\s*["'][^"']+/i.test(source)) {
  missing.push('security: possible hard-coded API token');
}
if (missing.length) {
  console.error('PREFLIGHT FAILED');
  for (const item of missing) console.error('-', item);
  process.exit(1);
}
console.log('PREFLIGHT OK: P1 V11 + DB/R2/AI contract verified');
