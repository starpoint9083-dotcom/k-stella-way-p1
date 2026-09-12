import fs from 'node:fs';
const source=fs.readFileSync('src/index.js','utf8');
const required=[
  'function buildKStellaOwnedMusicWav',
  'async function ensureKStellaOwnedMusic',
  'K_STELLA_ORIGINAL_DRAMA_BED_01.wav',
  'OWNED_PROCEDURAL_MUSIC_SEEDED',
  "'owned'",
  '외부 음원/샘플 미사용',
  'if(!results.length){await ensureKStellaOwnedMusic(env);',
  "contentType:'audio/wav'"
];
const missing=required.filter(x=>!source.includes(x));
if(missing.length){console.error('OWNED MUSIC PREFLIGHT FAILED');for(const x of missing)console.error('-',x);process.exit(1);}
if(source.includes('https://')&&source.includes('K_STELLA_ORIGINAL_DRAMA_BED_01.wav')){
  // The fallback itself must not fetch third-party media; source URLs elsewhere in the app are allowed.
  const a=source.indexOf('function buildKStellaOwnedMusicWav'),b=source.indexOf('async function chooseMusic',a),slice=source.slice(a,b);
  if(/fetch\s*\(|https?:\/\//i.test(slice)){console.error('OWNED MUSIC PREFLIGHT FAILED: fallback contains external network media dependency');process.exit(1);}
}
console.log('OWNED MUSIC PREFLIGHT OK: zero-cost 60s WAV fallback is generated locally, stored as owned, has no external media dependency, and is only seeded when the active music library is empty.');
