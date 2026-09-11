import fs from 'node:fs';

const src = fs.readFileSync('src/index.js', 'utf8');
const needles = [
  '/api/lineups/generate',
  'lineups/generate',
  'generateLineup',
  'lineup_date',
  'env.AI.run',
  '@cf/',
  'Workers AI',
  'generateQueueImage',
  "assertUsageWithinLimit(env,'image_generations'",
  'generation_queue q JOIN projects'
];

const windows = [];
for (const needle of needles) {
  let from = 0;
  let count = 0;
  while (count < 10) {
    const at = src.indexOf(needle, from);
    if (at < 0) break;
    const start = Math.max(0, at - 4000);
    const end = Math.min(src.length, at + 9000);
    if (!windows.some((w) => Math.abs(w.at - at) < 2500)) windows.push({ needle, at, start, end });
    from = at + needle.length;
    count += 1;
  }
}

windows.sort((a, b) => a.at - b.at);
console.log(`SOURCE_LENGTH=${src.length} WINDOWS=${windows.length}`);
for (const [i, w] of windows.entries()) {
  console.log(`\n=== WINDOW ${i + 1} needle=${JSON.stringify(w.needle)} at=${w.at} ===`);
  console.log(src.slice(w.start, w.end));
}
