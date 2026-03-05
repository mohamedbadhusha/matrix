/**
 * Updates all handlers to use getDhanBase(broker) instead of DHAN_BASE.
 * Run: node scripts/fix-dhan-base.js
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../api/_handlers');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

let fixed = 0;
files.forEach(file => {
  const fp = path.join(dir, file);
  let content = fs.readFileSync(fp, 'utf8');

  // Skip if already uses getDhanBase
  if (content.includes('getDhanBase')) {
    console.log('Already updated:', file);
    return;
  }

  // Skip if doesn't use DHAN_BASE at all
  if (!content.includes('DHAN_BASE')) {
    console.log('No DHAN_BASE:', file);
    return;
  }

  // 1. Update import: replace DHAN_BASE with getDhanBase in import line
  content = content.replace(
    /,\s*DHAN_BASE\s*}/,
    ', getDhanBase }'
  );

  // 2. Add `const dhanBase = getDhanBase(broker);` after the broker check line
  //    Pattern: line that ends with 'Broker account not found' });
  content = content.replace(
    /(if \(bErr \|\| !broker\) return res\.status\(404\)\.json\(\{ error: 'Broker account not found' \}\);)/,
    "$1\n  const dhanBase = getDhanBase(broker);"
  );

  // 3. Replace all ${DHAN_BASE} with ${dhanBase}
  content = content.replace(/\$\{DHAN_BASE\}/g, '${dhanBase}');

  fs.writeFileSync(fp, content);
  console.log('Fixed:', file);
  fixed++;
});

console.log(`\nTotal fixed: ${fixed}`);
