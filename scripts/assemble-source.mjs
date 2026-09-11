import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = 'src/chunks';
const expected = 'a8e05868bb3b8dfeb5aea87cfdb4a4ed25bde761d9db5a084d8dbf81c24e3509';
const parts = fs.readdirSync(dir).filter(x => x.startsWith('index.js.b64.part')).sort();
if (!parts.length) {
  console.error('No source chunks found');
  process.exit(1);
}
const b64 = parts.map(x => fs.readFileSync(path.join(dir, x), 'utf8').trim()).join('');
const bytes = Buffer.from(b64, 'base64');
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha !== expected) {
  console.error(`Source SHA-256 mismatch: ${sha}`);
  process.exit(1);
}
fs.writeFileSync('src/index.js', bytes);
console.log(`Source assembled and verified: ${parts.length} parts, ${bytes.length} bytes, sha256=${sha}`);
