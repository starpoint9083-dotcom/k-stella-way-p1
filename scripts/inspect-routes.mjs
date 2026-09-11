import fs from 'node:fs';
const src = fs.readFileSync('src/index.js', 'utf8');
for (const needle of ['async function requireAuth','function requireAuth','ADMIN_TOKEN','admin_hash']) {
  const i = src.indexOf(needle);
  console.log(`\n===== ${needle} at ${i} =====`);
  if (i >= 0) console.log(src.slice(Math.max(0,i-1200), Math.min(src.length,i+4200)).replace(/\r/g,''));
}
