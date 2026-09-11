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

source = adapter + '\n' + source;
source = source.replace(marker, `${marker}\n    env = kstellaAdaptFreeEnv(env);`);
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

fs.writeFileSync(file, source);
console.log('ZERO-COST PATCH OK: KV adapter injected, render bitrate capped at 2.2 Mbps, paid-use warnings replaced with free-limit stop behavior.');
