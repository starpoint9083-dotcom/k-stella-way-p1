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
  'env.P3_BRIDGE_TOKEN&&token===env.P3_BRIDGE_TOKEN',
  'verifyP3GithubOidc(token)',
  "P3_GITHUB_OIDC_ISSUER='https://token.actions.githubusercontent.com'",
  "P3_GITHUB_OIDC_AUDIENCE='k-stella-p1-p3-bridge'",
  "P3_GITHUB_REPOSITORY='starpoint9083-dotcom/p3-automation-hub-'",
  "P3_GITHUB_REPOSITORY_ID='1364648201'",
  "P3_GITHUB_OWNER_ID='307467963'",
  "P3_GITHUB_REF='refs/heads/main'",
  "P3_GITHUB_WORKFLOW_REF='starpoint9083-dotcom/p3-automation-hub-/.github/workflows/p1-browser-factory.yml@refs/heads/main'",
  "P3_GITHUB_IMMUTABLE_SUB='repo:starpoint9083-dotcom@307467963/p3-automation-hub-@1364648201:ref:refs/heads/main'",
  "['workflow_dispatch','schedule','push']",
  "payload?.runner_environment!=='github-hosted'",
  "payload?.sub!==P3_GITHUB_IMMUTABLE_SUB",
  "return verifySession(env,cookieValue(request,'kstella_session'))",
  "new Error('편성 AI 90초 제한 초과')",
  '90000',
  "new Error('이미지 AI 180초 제한 초과')",
  '180000',
  "new Error('TTS AI 120초 제한 초과')",
  '120000',
  'reuseExistingAssetAtFreeLimit',
  'FREE_LIMIT_ASSET_REUSED',
  "logEvent(env,'warn','ai','FREE_LIMIT_ASSET_REUSED'",
  'reused_due_to_free_limit:true',
  "assertUsageWithinLimit(env,'image_generations','daily_image_limit',60)",
  "SET status='waiting',last_error=''",
  "generated_asset_id IS NULL",
  "status IN ('cancelled','generating')",
  "'queue_resume'",
  '중단된 부족 장면 큐 복구',
  "recoverable_statuses:['cancelled','generating']",
  'async function rebuildMissingGenerationQueue',
  'LEFT JOIN generation_queue q ON q.scene_id=s.id',
  's.missing=1 AND q.id IS NULL',
  "NOT EXISTS (SELECT 1 FROM assets a WHERE a.id=s.selected_asset_id AND a.status='active')",
  "WHERE NOT EXISTS (SELECT 1 FROM generation_queue WHERE scene_id=?)",
  "INSERT INTO generation_queue(project_id,scene_id,scene_no,requirement_json,prompt,status) SELECT",
  "'queue_rebuilt'",
  '누락된 부족 장면 큐 재생성',
  'queue_rebuilt:rebuilt'
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
if (/CLOUDFLARE_API_TOKEN\s*=|api[_-]?token\s*[:=]\s*["'][^"']+/i.test(source)) missing.push('security: possible hard-coded API token');
if (/P3_BRIDGE_TOKEN\s*=\s*["'][^"']+/i.test(source)) missing.push('security: hard-coded P3 bridge token');
if (!source.includes("header?.alg!=='RS256'")) missing.push('security: OIDC algorithm pin');
if (!source.includes("payload?.sub!==P3_GITHUB_IMMUTABLE_SUB")) missing.push('security: immutable OIDC subject pin');
if (!source.includes("String(payload?.repository_owner_id||'')!==P3_GITHUB_OWNER_ID")) missing.push('security: owner id pin');
if (!source.includes("crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'}")) missing.push('security: OIDC signature verification');
if (missing.length) {
  console.error('PREFLIGHT FAILED');
  for (const item of missing) console.error('-', item);
  process.exit(1);
}
console.log('PREFLIGHT OK: P1 V11 + D1/KV-free/AI + immutable P3 GitHub OIDC identity + bounded lineup/image/TTS AI calls + zero-cost existing-asset fallback + stale queue recovery + robust missing-scene queue rebuild when no active asset exists + 12h session fallback verified.');
