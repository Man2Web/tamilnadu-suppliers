import fs from 'fs';
import path from 'path';
import { supabaseStore } from '../src/lib/db/supabaseStore';

function walk(dir: string): string[] {
  let results: string[] = [];
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      if (!full.includes('node_modules') && !full.includes('.next') && !full.includes('.git')) {
        results = results.concat(walk(full));
      }
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('src');
const storeCalls = new Set<string>();

files.forEach(f => {
  if (f.includes('store.ts') || f.includes('supabaseStore.ts') || f.includes('mappers.ts')) return;
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line) => {
    const matches = [...line.matchAll(/store\.([a-zA-Z0-9_]+)\s*\(/g)];
    matches.forEach(m => {
      storeCalls.add(m[1]);
    });
  });
});

console.log('Total unique store methods used:', storeCalls.size);
const missingMethods: string[] = [];
storeCalls.forEach(method => {
  if (typeof (supabaseStore as any)[method] !== 'function') {
    missingMethods.push(method);
  }
});

console.log('Missing methods on supabaseStore:', missingMethods);
