import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const input='scripts/patch-stella-subtitle-music-style.mjs';
const temp='scripts/.patch-stella-subtitle-music-style.normalized.mjs';
let source=fs.readFileSync(input,'utf8');
const bad="env.DB.prepare(`SELECT DISTINCT v.music_asset_id FROM video_plans v JOIN projects p ON p.id=v.project_id WHERE p.batch_id=? AND p.id<>? AND v.music_asset_id IS NOT NULL`)";
const good='env.DB.prepare("SELECT DISTINCT v.music_asset_id FROM video_plans v JOIN projects p ON p.id=v.project_id WHERE p.batch_id=? AND p.id<>? AND v.music_asset_id IS NOT NULL")';
if(!source.includes(bad)){
  console.error('STELLA PATCH RUNNER FAILED: expected SQL template anchor not found');
  process.exit(1);
}
source=source.replace(bad,good);
fs.writeFileSync(temp,source);
try{
  await import(pathToFileURL(path.resolve(temp)).href+'?v='+Date.now());
} finally {
  try{fs.unlinkSync(temp);}catch(_){ }
}
