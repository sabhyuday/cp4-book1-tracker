import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '..', 'data', 'problems.json');
const data = JSON.parse(await readFile(file, 'utf8'));
const problems = (data.chapters || []).flatMap(chapter =>
  (chapter.sections || []).flatMap(section => section.problems || [])
);

if (!problems.length) throw new Error('The dataset contains no problems.');

const ids = new Set();
for (const problem of problems) {
  if (!problem.id || !problem.platform || !problem.slug || !problem.title || !problem.url) {
    throw new Error(`Incomplete record: ${JSON.stringify(problem)}`);
  }
  if (ids.has(problem.id)) throw new Error(`Duplicate problem id: ${problem.id}`);
  ids.add(problem.id);

  if (problem.platform === 'leetcode') {
    if (/^lc\d+$/i.test(problem.slug)) {
      throw new Error(`Unresolved LeetCode slug for ${problem.sourceId}: ${problem.slug}`);
    }
    const expected = `https://leetcode.com/problems/${problem.slug}/`;
    if (problem.url !== expected) {
      throw new Error(`Bad LeetCode URL for ${problem.sourceId}: expected ${expected}, got ${problem.url}`);
    }
  } else if (problem.platform === 'kattis') {
    const expected = `https://open.kattis.com/problems/${problem.slug}`;
    if (problem.url !== expected) {
      throw new Error(`Bad Kattis URL for ${problem.sourceId}: expected ${expected}, got ${problem.url}`);
    }
  } else {
    throw new Error(`Unsupported platform: ${problem.platform}`);
  }
}

const regression = problems.find(problem => String(problem.sourceId).toLowerCase() === 'lc2469');
if (regression) {
  if (regression.slug !== 'convert-the-temperature') {
    throw new Error(`lc2469 regression: expected convert-the-temperature, got ${regression.slug}`);
  }
  if (regression.url !== 'https://leetcode.com/problems/convert-the-temperature/') {
    throw new Error(`lc2469 regression URL is wrong: ${regression.url}`);
  }
}

const metadataTotal = Number(data.metadata?.counts?.total);
if (Number.isFinite(metadataTotal) && metadataTotal !== problems.length) {
  throw new Error(`metadata.counts.total is ${metadataTotal}, but dataset contains ${problems.length}`);
}

console.log(`Validated ${problems.length} problem records; all links and slugs are structurally correct.`);
