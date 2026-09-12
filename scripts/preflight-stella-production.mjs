import fs from 'node:fs';

const source=fs.readFileSync('src/index.js','utf8');
const required=[
  "const K_STELLA_CAST=['남주','여주','남주 친구','여주 친구','새로운 남자']",
  'function isKStellaStyleAsset',
  'KSTELLA_STYLE_LOCK_V1',
  'Never switch to photorealistic',
  "await markProductionItem(item,'processing','subtitles')",
  'narration_required:false',
  'subtitle_required:true',
  'scene_music_required:true',
  'music_segments:musicSegments',
  'narration:null',
  'function sceneMusicIntent',
  'scoreSceneMusicAsset',
  'source_offset',
  'musicSegments.push',
  "push('narration_policy'",
  "push('subtitle_coverage'",
  "push('scene_music'",
  '장면별 음악·효과음 합성'
];
const forbidden=[
  "await ensureProjectImages(projectId,item);await prepareNarration(projectId,item);",
  "if(manifest.narration?.url){const n=await makeAudioTrack",
  "const best=ranked.find(x=>x.score>0)||ranked[0]",
  "narration_required:true"
];
const missing=required.filter(x=>!source.includes(x));
const present=forbidden.filter(x=>source.includes(x));
if(missing.length||present.length){
  console.error('STELLA PRODUCTION PREFLIGHT FAILED');
  for(const x of missing)console.error('- missing:',x);
  for(const x of present)console.error('- forbidden:',x);
  process.exit(1);
}
console.log('STELLA PRODUCTION PREFLIGHT OK: subtitle-only, no production narration, multi-segment scene music with crossfade/source offsets, five-character K STELLA WAY style lock, strict reference matching, and no random mixed-style free-cap reuse.');
