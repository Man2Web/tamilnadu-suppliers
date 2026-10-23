import fs from 'fs';
import path from 'path';

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

const imports = new Set<string>();
walk('src').forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const matches = [...content.matchAll(/from\s+["']@\/lib\/db\/store["']/g)];
  if (matches.length > 0) {
    // print the import line
    content.split('\n').forEach(line => {
      if (line.includes('@/lib/db/store')) {
        imports.add(line.trim());
      }
    });
  }
});

console.log('All import statements referencing @/lib/db/store:');
Array.from(imports).sort().forEach(imp => console.log('  ' + imp));
