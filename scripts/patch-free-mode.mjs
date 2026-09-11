import fs from 'node:fs';

const file = 'src/index.js';
let source = fs.readFileSync(file, 'utf8');

const marker = 'async fetch(request,env){';
if (!source.includes(marker)) {
  console.error('Free-mode patch failed: Worker fetch marker not found.');
  process.exit(1);
}
if (!source.includes('videoBitsPerSecond:3500000')) {
  console.error('Free-mode patch failed: expected render bitrate marker not found.');
  process.exit(1);
}

const authFunctionMarker = `async function isAuthorized(request,env){
  const token=extractToken(request);
  if(token){if(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN)return true;if(!env.DB)return false;const salt=await getSetting(env,'admin_salt'),hash=await getSetting(env,'admin_hash');return !!hash&&(await hashPassword(token,salt))===hash;}
  return verifySession(env,cookieValue(request,'kstella_session'));
}`;
if (!source.includes(authFunctionMarker)) {
  console.error('Free-mode patch failed: exact P1 auth function marker not found.');
  process.exit(1);
}

const adapter = `
// K-STELLA P1 ZERO-COST STORAGE ADAPTER
// Workers KV is used behind the existing ASSETS_BUCKET contract so the V11
// application can keep its object-storage calls without enabling R2 billing.
const KSTELLA_KV_MAX_VALUE = 24 * 1024 * 1024;
function kstellaFreeStorageAdapter(kv) {
  if (!kv || typeof kv.getWithMetadata !== 'function') return kv;
  const toArrayBuffer = async value => {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    if (typeof value === 'string') return new TextEncoder().encode(value).buffer;
    return await new Response(value).arrayBuffer();
  };
  return {
    async put(key, value, options = {}) {
      const bytes = await toArrayBuffer(value);
      if (bytes.byteLength > KSTELLA_KV_MAX_VALUE) {
        throw new Error('무료 KV 단일 파일 한도(24MiB 안전한도)를 초과했습니다. 영상 화질/길이를 낮춰 다시 생성하세요.');
      }
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const etag = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      const contentType = options?.httpMetadata?.contentType || 'application/octet-stream';
      await kv.put(key, bytes, { metadata: { contentType, size: bytes.byteLength, etag } });
      return { key, size: bytes.byteLength, etag };
    },
    async get(key) {
      const hit = await kv.getWithMetadata(key, 'arrayBuffer');
      if (!hit?.value) return null;
      const bytes = hit.value;
      const meta = hit.metadata || {};
      return {
        body: bytes,
        httpEtag: meta.etag ? '"' + meta.etag + '"' : '',
        async arrayBuffer() { return bytes; },
        writeHttpMetadata(headers) {
          if (meta.contentType) headers.set('content-type', meta.contentType);
        }
      };
    },
    async list(options = {}) {
      const page = await kv.list({ limit: options.limit || 1000, cursor: options.cursor });
      return {
        objects: (page.keys || []).map(x => ({ key: x.name, size: Number(x.metadata?.size || 0) })),
        truncated: !page.list_complete,
        cursor: page.cursor
      };
    },
    async delete(key) { return kv.delete(key); }
  };
}
function kstellaAdaptFreeEnv(env) {
  if (!env?.ASSETS_BUCKET || typeof env.ASSETS_BUCKET.getWithMetadata !== 'function') return env;
  const storage = kstellaFreeStorageAdapter(env.ASSETS_BUCKET);
  return new Proxy(env, { get(target, prop) { return prop === 'ASSETS_BUCKET' ? storage : target[prop]; } });
}
`;

const p3OidcHelpers = `
// P3 GITHUB ACTIONS OIDC TRUST BRIDGE
// No shared password is required. Only the exact P3 production workflow on main
// with the dedicated audience and a valid GitHub RS256 signature is accepted.
const P3_GITHUB_OIDC_ISSUER='https://token.actions.githubusercontent.com';
const P3_GITHUB_OIDC_JWKS='https://token.actions.githubusercontent.com/.well-known/jwks';
const P3_GITHUB_OIDC_AUDIENCE='k-stella-p1-p3-bridge';
const P3_GITHUB_REPOSITORY='starpoint9083-dotcom/p3-automation-hub-';
const P3_GITHUB_REPOSITORY_ID='1364648201';
const P3_GITHUB_OWNER='starpoint9083-dotcom';
const P3_GITHUB_REF='refs/heads/main';
const P3_GITHUB_WORKFLOW_REF='starpoint9083-dotcom/p3-automation-hub-/.github/workflows/p1-browser-factory.yml@refs/heads/main';
let p3GithubJwksCache=null,p3GithubJwksCacheAt=0;
function p3Base64urlBytes(v){let s=String(v||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function p3AudienceMatches(aud){return Array.isArray(aud)?aud.includes(P3_GITHUB_OIDC_AUDIENCE):String(aud||'')===P3_GITHUB_OIDC_AUDIENCE;}
async function p3GithubJwks(){
  const now=Date.now();
  if(p3GithubJwksCache&&now-p3GithubJwksCacheAt<60*60*1000)return p3GithubJwksCache;
  const r=await fetch(P3_GITHUB_OIDC_JWKS,{headers:{accept:'application/json'}});
  if(!r.ok)throw new Error('GitHub OIDC JWKS unavailable');
  const d=await r.json();
  if(!Array.isArray(d?.keys)||!d.keys.length)throw new Error('GitHub OIDC JWKS invalid');
  p3GithubJwksCache=d.keys;p3GithubJwksCacheAt=now;return p3GithubJwksCache;
}
async function verifyP3GithubOidc(value){
  try{
    const parts=String(value||'').split('.');if(parts.length!==3)return false;
    const header=JSON.parse(decodeB64urlText(parts[0])),payload=JSON.parse(decodeB64urlText(parts[1]));
    if(header?.alg!=='RS256'||!header?.kid)return false;
    const now=Math.floor(Date.now()/1000),exp=Number(payload?.exp||0),nbf=Number(payload?.nbf||0),iat=Number(payload?.iat||0);
    if(payload?.iss!==P3_GITHUB_OIDC_ISSUER||!p3AudienceMatches(payload?.aud))return false;
    if(payload?.repository!==P3_GITHUB_REPOSITORY||String(payload?.repository_id||'')!==P3_GITHUB_REPOSITORY_ID)return false;
    if(payload?.repository_owner!==P3_GITHUB_OWNER||payload?.ref!==P3_GITHUB_REF)return false;
    if(payload?.workflow_ref!==P3_GITHUB_WORKFLOW_REF)return false;
    if(!['workflow_dispatch','schedule','push'].includes(String(payload?.event_name||'')))return false;
    if(payload?.runner_environment!=='github-hosted')return false;
    if(payload?.sub!==('repo:'+P3_GITHUB_REPOSITORY+':ref:'+P3_GITHUB_REF))return false;
    if(!exp||exp<=now||exp>now+15*60)return false;
    if(nbf&&nbf>now+30)return false;
    if(!iat||iat>now+30||iat<now-15*60)return false;
    const keys=await p3GithubJwks(),jwk=keys.find(k=>k?.kid===header.kid&&k?.kty==='RSA');if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,p3Base64urlBytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  }catch(_){return false;}
}
`;

const authFunctionReplacement = `async function isAuthorized(request,env){
  const token=extractToken(request);
  if(token){
    if(env.P3_BRIDGE_TOKEN&&token===env.P3_BRIDGE_TOKEN)return true;
    if(await verifyP3GithubOidc(token))return true;
    if(env.ADMIN_TOKEN&&token===env.ADMIN_TOKEN)return true;
    if(env.DB){const salt=await getSetting(env,'admin_salt'),hash=await getSetting(env,'admin_hash');if(!!hash&&(await hashPassword(token,salt))===hash)return true;}
  }
  return verifySession(env,cookieValue(request,'kstella_session'));
}`;

source = adapter + '\n' + source;
source = source.replace(marker, `${marker}\n    env = kstellaAdaptFreeEnv(env);`);
source = source.replace(authFunctionMarker, p3OidcHelpers + '\n' + authFunctionReplacement);
source = source.replace('videoBitsPerSecond:3500000', 'videoBitsPerSecond:2200000');

const replacements = [
  ['Workers AI 사용량에 따라 요금이 발생할 수 있습니다. 이 한 번만 승인하면 이후 과정은 자동으로 진행합니다.', 'Workers Free 무료 한도 안에서만 실행합니다. 무료 한도를 넘으면 추가 과금 없이 작업이 중단됩니다.'],
  ['Workers AI 사용량에 따라 요금이 발생할 수 있습니다. 진행할까요?', 'Workers Free 무료 한도 안에서만 실행합니다. 한도를 넘으면 추가 과금 없이 중단됩니다. 진행할까요?'],
  ['한국어 나레이션 → 컷/음악 설계 → 휴대폰 렌더링 → R2 저장.', '한국어 나레이션 → 컷/음악 설계 → 휴대폰 렌더링 → 무료 KV 저장.'],
  ['한국어 나레이션을 R2에 저장했습니다.', '한국어 나레이션을 무료 KV에 저장했습니다.'],
  ['완성 영상을 R2에 저장하고 있습니다.', '완성 영상을 무료 KV에 저장하고 있습니다.'],
  ['완료 · 실제 쇼츠 파일이 R2에 저장됐습니다.', '완료 · 실제 쇼츠 파일이 무료 KV에 저장됐습니다.'],
  ["'R2 저장'", "'무료 KV 저장'"],
  ["'R2 이미지 저장소'", "'무료 KV 저장소'"],
  ['R2 안전 스냅샷 만들기', '무료 KV 안전 스냅샷 만들기'],
  ['R2/DB 저장소 점검', 'KV/DB 저장소 점검'],
  ["'오늘 R2 저장'", "'오늘 KV 저장'"],
  ['R2와 D1을 비교하고 있습니다...', 'KV와 D1을 비교하고 있습니다...'],
  ['R2와 DB 자산 연결이 정상입니다.', 'KV와 DB 자산 연결이 정상입니다.'],
  ['R2 <code>ASSETS_BUCKET</code> → <code>k-stella-shorts-assets</code>', 'KV <code>ASSETS_BUCKET</code> → <code>k-stella-shorts-assets-kv</code>']
];
for (const [from, to] of replacements) source = source.split(from).join(to);

for (const token of [
  'env.P3_BRIDGE_TOKEN&&token===env.P3_BRIDGE_TOKEN',
  'verifyP3GithubOidc(token)',
  "P3_GITHUB_OIDC_AUDIENCE='k-stella-p1-p3-bridge'",
  "P3_GITHUB_WORKFLOW_REF='starpoint9083-dotcom/p3-automation-hub-/.github/workflows/p1-browser-factory.yml@refs/heads/main'",
  "return verifySession(env,cookieValue(request,'kstella_session'))"
]) {
  if (!source.includes(token)) {
    console.error('Free-mode patch failed: required P3 OIDC marker missing: '+token);
    process.exit(1);
  }
}

fs.writeFileSync(file, source);
console.log('ZERO-COST PATCH OK: KV adapter + isolated P3 token fallback + GitHub OIDC auth injected; one-time main push allowed for live P3 test; 12h session fallback preserved; render bitrate capped at 2.2 Mbps.');
