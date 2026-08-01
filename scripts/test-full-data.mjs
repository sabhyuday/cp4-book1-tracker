import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/problems.json', import.meta.url), 'utf8'));
const problems = (data.chapters || []).flatMap(chapter =>
  (chapter.sections || []).flatMap(section => section.problems || [])
);

const minimum = Number(process.env.MIN_EXPECTED_PROBLEMS || 500);
if (problems.length < minimum) {
  throw new Error(`Expected at least ${minimum} problems after a full scrape, found ${problems.length}. Refusing to deploy a partial catalogue.`);
}
if (data.metadata?.demo) {
  throw new Error('The full catalogue is still marked as demo data.');
}

const platformCounts = problems.reduce((counts, problem) => {
  counts[problem.platform] = (counts[problem.platform] || 0) + 1;
  return counts;
}, {});
if (!platformCounts.kattis || !platformCounts.leetcode) {
  throw new Error(`Full catalogue must contain both platforms: ${JSON.stringify(platformCounts)}`);
}

console.log(`Full catalogue check passed: ${problems.length} problems (${platformCounts.kattis} Kattis, ${platformCounts.leetcode} LeetCode).`);
