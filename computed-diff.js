/**
 * Diff computed-baseline.json vs a fresh capture (computed-current.json).
 * Usage: node computed-baseline.js && node computed-diff.js
 * Or: node computed-diff.js  (expects computed-current.json already written)
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BASE = path.join(ROOT, '_archive', 'proof', 'computed-baseline.json');
const CUR = path.join(ROOT, '_archive', 'proof', 'computed-current.json');
const OUT = path.join(ROOT, '_archive', 'proof', 'computed-diff.json');

function flatten(obj, prefix = '', acc = {}) {
  if (obj === null || typeof obj !== 'object') {
    acc[prefix] = obj;
    return acc;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, acc);
    else acc[key] = v;
  }
  return acc;
}

const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
if (!fs.existsSync(CUR)) {
  console.error('Missing computed-current.json — copy baseline script output or re-run capture as current');
  process.exit(1);
}
const cur = JSON.parse(fs.readFileSync(CUR, 'utf8'));

const flatB = flatten({ stylesheets: base.stylesheets, snapshots: base.snapshots });
const flatC = flatten({ stylesheets: cur.stylesheets, snapshots: cur.snapshots });

const changed = [];
const missing = [];
const added = [];

for (const k of Object.keys(flatB)) {
  if (!(k in flatC)) missing.push(k);
  else if (String(flatB[k]) !== String(flatC[k])) {
    changed.push({ key: k, before: flatB[k], after: flatC[k] });
  }
}
for (const k of Object.keys(flatC)) {
  if (!(k in flatB)) added.push(k);
}

const report = {
  comparedAt: new Date().toISOString(),
  changedCount: changed.length,
  missingCount: missing.length,
  addedCount: added.length,
  // Ignore stylesheet URL/query differences when listing "significant" style diffs
  styleChanges: changed.filter((c) => !c.key.startsWith('stylesheets')),
  stylesheetChanges: changed.filter((c) => c.key.startsWith('stylesheets')),
  missing,
  added,
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('DIFF', OUT);
console.log('styleChanges', report.styleChanges.length);
console.log('stylesheetChanges', report.stylesheetChanges.length);
if (report.styleChanges.length) {
  console.log('FIRST 30 STYLE DIFFS:');
  report.styleChanges.slice(0, 30).forEach((c) => {
    console.log(`  ${c.key}\n    before: ${c.before}\n    after:  ${c.after}`);
  });
} else {
  console.log('NO STYLE PROPERTY DIFFS');
}
