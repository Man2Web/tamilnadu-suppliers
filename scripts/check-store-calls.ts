import fs from 'fs';
import path from 'path';

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.next') && !file.includes('.git')) {
        results = results.concat(walk(fullPath));
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('src');
const storeCalls = new Set<string>();
const unawaited: { file: string; lineNum: number; call: string; line: string }[] = [];

files.forEach(f => {
  if (f.includes('store.ts') || f.includes('supabaseStore.ts') || f.includes('mappers.ts')) return;
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const matches = [...line.matchAll(/store\.([a-zA-Z0-9_]+)\s*\(/g)];
    matches.forEach(m => {
      storeCalls.add(m[1]);
      if (!line.includes('await') && !line.includes('return store.') && !line.trim().startsWith('//')) {
        unawaited.push({ file: f, lineNum: idx + 1, call: m[1], line: line.trim() });
      }
    });
  });
});

console.log('Unique store methods called across src:', Array.from(storeCalls).sort().join(', '));
console.log('\nPotential unawaited calls count:', unawaited.length);
unawaited.forEach(u => console.log(`${u.file}:${u.lineNum} -> ${u.call} | ${u.line}`));
