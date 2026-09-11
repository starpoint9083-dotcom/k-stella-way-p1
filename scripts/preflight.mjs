import fs from 'node:fs';

const source = fs.readFileSync('src/index.js', 'utf8');
const tpl = fs.readFileSync('wrangler.template.toml', 'utf8');
const requiredSource = [
  'K STELLA WAY Shorts Factory V11',
  'export default',
  '/healthz',
  'ASSETS_BUCKET',
  'env.DB',
  'env.AI',
  'KSTELLA_KV_MAX_VALUE',
  'kstellaAdaptFreeEnv',
  'env.P3_BRIDGE_TOKEN&&token===env.P3_BRIDGE_TOKEN'
];
const requiredConfig = [
  'name = "k-stella-shorts-factory"',
  'binding = "DB"',
  'database_name = "k-stella-shorts-factory"',
  '[[kv_namespaces]]',
  'binding = "ASSETS_BUCKET"',
  'id = "__KV_NAMESPACE_ID__"',
  'STORAGE_MODE = "kv-free"',
  'binding = "AI"'
];
const forbiddenConfig = [
  '[[r2_buckets]]',
  'bucket_name = "k-stella-shorts-assets"'
];
const missing = [];
for (const token of requiredSource) if (!source.includes(token)) missing.push(`source:${token}`);
for (const token of requiredConfig) if (!tpl.includes(token)) missing.push(`config:${token}`);
for (const token of forbiddenConfig) if (tpl.includes(token)) missing.push(`zero-cost violation:${token}`);
if (/CLOUDFLARE_API_TOKEN\s*=|api[_-]?token\s*[:=]\s*["'][^"']+/i.test(source)) {
  missing.push('security: possible hard-coded API token');
}
if (/P3_BRIDGE_TOKEN\s*=\s*["'][^"']+/i.test(source)) {
  missing.push('security: hard-coded P3 bridge token');
}
if (missing.length) {
  console.error('PREFLIGHT FAILED');
  for (const item of missing) console.error('-', item);
  process.exit(1);
}
console.log('PREFLIGHT OK: P1 V11 + D1/KV-free/AI + isolated P3 bridge auth verified; no R2 billing dependency or embedded bridge secret.');
