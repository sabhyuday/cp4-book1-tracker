import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const problems = JSON.parse(await readFile(path.join(root, 'data', 'problems.json'), 'utf8'));
const solved = JSON.parse(await readFile(path.join(root, 'data', 'solved.json'), 'utf8'));

const tracked = new Map([
  ['kattis', new Set()],
  ['leetcode', new Set()]
]);
for (const chapter of problems.chapters || []) {
  for (const section of chapter.sections || []) {
    for (const problem of section.problems || []) tracked.get(problem.platform)?.add(problem.slug.toLowerCase());
  }
}

for (const platform of ['kattis', 'leetcode']) {
  const account = solved.accounts?.[platform];
  if (!account || !Array.isArray(account.solved)) throw new Error(`Missing solved account data for ${platform}.`);
  if ('username' in account || 'profileUrl' in account) {
    throw new Error(`${platform} solved data must not publish account identity.`);
  }
  const seen = new Set();
  for (const slug of account.solved) {
    if (seen.has(slug)) throw new Error(`Duplicate solved slug for ${platform}: ${slug}`);
    if (!tracked.get(platform).has(String(slug).toLowerCase())) {
      throw new Error(`Untracked solved slug for ${platform}: ${slug}`);
    }
    seen.add(slug);
  }
  if (account.complete && account.error) throw new Error(`${platform} cannot be complete and have an error.`);
}

console.log('Validated solved-account JSON.');
