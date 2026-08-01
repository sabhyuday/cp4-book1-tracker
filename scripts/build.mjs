import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'data'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await cp(path.join(root, file), path.join(dist, file));
}
for (const file of ['problems.json', 'solved.json']) {
  await cp(path.join(root, 'data', file), path.join(dist, 'data', file));
}
await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built static site in ${dist}`);
