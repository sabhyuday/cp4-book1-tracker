import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'data', 'problems.json');
const FAST = process.argv.includes('--fast');
const USER_AGENT = 'CP4-Book1-Tracker-Scraper/1.1 (+personal tracker)';

const CHAPTERS = {
  1: 'Introduction',
  2: 'Data Structures and Libraries',
  3: 'Problem Solving Paradigms',
  4: 'Graph'
};


async function loadExistingProblemCache() {
  try {
    const current = JSON.parse(await readFile(OUTPUT, 'utf8'));
    const problems = (current.chapters || []).flatMap(chapter =>
      (chapter.sections || []).flatMap(section => section.problems || [])
    );
    const cache = new Map();
    for (const problem of problems) {
      if (problem?.platform && problem?.slug && problem?.title) {
        cache.set(`${problem.platform}:${problem.slug}`, problem);
      }
      if (problem?.platform && problem?.sourceId && problem?.title) {
        cache.set(`${problem.platform}:source:${String(problem.sourceId).toLowerCase()}`, problem);
      }
    }
    return cache;
  } catch {
    return new Map();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchResponse(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          ...(options.headers || {})
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      await sleep(600 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchText(url, options = {}) {
  return (await fetchResponse(url, options)).text();
}

async function fetchJson(url, options = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: { accept: 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}`);
  }
}

function normaliseSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normaliseLeetCodeNumber(value) {
  const digits = String(value || '').replace(/^lc/i, '').replace(/^0+/, '');
  return digits || '0';
}

function parseSection(sectionText, fallbackChapter) {
  const clean = normaliseSpace(sectionText);
  const match = clean.match(/^(\d+\.[\w.]+)\s*,\s*(.+)$/);
  if (match) return { code: match[1], title: match[2], chapter: Number(match[1].split('.')[0]) };
  const codeMatch = clean.match(/^(\d+)\./);
  return {
    code: codeMatch ? clean.split(',')[0] : `${fallbackChapter}.misc`,
    title: clean || 'Miscellaneous',
    chapter: codeMatch ? Number(codeMatch[1]) : fallbackChapter
  };
}

export function parseCpbookHtml(html, platform, chapterNumber) {
  const $ = cheerio.load(html);
  const rows = [];

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const sourceId = normaliseSpace(cells.eq(0).text()).toLowerCase();
    const titleCell = cells.eq(1);
    const sectionText = normaliseSpace(cells.eq(2).text());
    if (!sourceId || !sectionText) return;

    const wantedHost = platform === 'kattis' ? 'open.kattis.com/problems/' : 'leetcode.com/problems/';
    let href = titleCell.find(`a[href*="${wantedHost}"]`).last().attr('href') || '';
    if (href.startsWith('/')) {
      href = `${platform === 'kattis' ? 'https://open.kattis.com' : 'https://leetcode.com'}${href}`;
    }

    const section = parseSection(sectionText, chapterNumber);
    if (section.chapter !== chapterNumber) return;

    let slug = '';
    if (platform === 'kattis') {
      slug = href.match(/\/problems\/([^/?#]+)/)?.[1] || sourceId;
      href ||= `https://open.kattis.com/problems/${slug}`;
    } else {
      slug = href.match(/\/problems\/([^/?#]+)/)?.[1] || '';
    }

    const rawTitle = normaliseSpace(titleCell.clone().find('img').remove().end().text());
    rows.push({
      platform,
      sourceId,
      slug,
      title: rawTitle && !/replace with leetcode link/i.test(rawTitle) ? rawTitle : '',
      url: href,
      sectionCode: section.code,
      sectionTitle: section.title,
      chapter: chapterNumber,
      hint: normaliseSpace(cells.eq(3).text()),
      dacu: Number(normaliseSpace(cells.eq(4).text())) || null,
      points: Number(normaliseSpace(cells.eq(5).text())) || null
    });
  });

  return rows;
}

async function getCpbookRows(platform, chapter, quality) {
  const url = `https://cpbook.net/methodstosolve?difficulty=all&oj=${platform}&quality=${quality}&topic=ch${chapter}`;
  console.log(`Fetching ${platform}, chapter ${chapter}, ${quality}…`);
  return parseCpbookHtml(await fetchText(url), platform, chapter);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await mapper(items[current], current);
      } catch (error) {
        results[current] = { error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function addLeetCodeCatalogItems(byId, questions) {
  for (const item of questions || []) {
    const frontendId = item?.frontendQuestionId ?? item?.questionFrontendId;
    const number = normaliseLeetCodeNumber(frontendId);
    if (number !== '0' && item?.titleSlug) byId.set(number, item);
  }
  return byId;
}

async function fetchLeetCodeCatalogGraphQL() {
  const query = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      problemsetQuestionList: questionList(
        categorySlug: $categorySlug
        limit: $limit
        skip: $skip
        filters: $filters
      ) {
        total: totalNum
        questions: data {
          frontendQuestionId: questionFrontendId
          title
          titleSlug
          difficulty
          isPaidOnly
        }
      }
    }
  `;

  const byId = new Map();
  let skip = 0;
  const limit = 100;
  let total = Infinity;

  while (skip < total) {
    const payload = await fetchJson('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        referer: 'https://leetcode.com/problemset/'
      },
      body: JSON.stringify({
        operationName: 'problemsetQuestionList',
        query,
        variables: { categorySlug: '', skip, limit, filters: {} }
      })
    });

    if (payload?.errors?.length) throw new Error(payload.errors.map(item => item.message).join('; '));
    const result = payload?.data?.problemsetQuestionList;
    if (!Array.isArray(result?.questions)) throw new Error('LeetCode GraphQL catalogue shape changed');
    if (!result.questions.length) break;

    total = Number(result.total) || result.questions.length;
    addLeetCodeCatalogItems(byId, result.questions);
    skip += result.questions.length;
    console.log(`LeetCode catalogue ${Math.min(skip, total)}/${total}`);
    await sleep(120);
  }

  if (!byId.size) throw new Error('LeetCode GraphQL catalogue was empty');
  return byId;
}

async function fetchLeetCodeCatalogLegacy() {
  const payload = await fetchJson('https://leetcode.com/api/problems/all/', {
    headers: { referer: 'https://leetcode.com/problemset/' }
  });
  const pairs = payload?.stat_status_pairs;
  if (!Array.isArray(pairs)) throw new Error('LeetCode legacy catalogue shape changed');

  const byId = new Map();
  for (const pair of pairs) {
    const stat = pair?.stat || {};
    const number = normaliseLeetCodeNumber(stat.frontend_question_id);
    if (number === '0' || !stat.question__title_slug) continue;
    byId.set(number, {
      frontendQuestionId: String(stat.frontend_question_id),
      title: stat.question__title,
      titleSlug: stat.question__title_slug,
      difficulty: ({ 1: 'Easy', 2: 'Medium', 3: 'Hard' })[pair?.difficulty?.level] || null,
      isPaidOnly: Boolean(pair?.paid_only)
    });
  }
  if (!byId.size) throw new Error('LeetCode legacy catalogue was empty');
  return byId;
}

async function fetchLeetCodeCatalog() {
  try {
    return await fetchLeetCodeCatalogGraphQL();
  } catch (graphqlError) {
    console.warn(`LeetCode GraphQL catalogue failed: ${graphqlError.message}`);
    try {
      return await fetchLeetCodeCatalogLegacy();
    } catch (legacyError) {
      throw new Error(`Could not resolve LeetCode IDs. GraphQL: ${graphqlError.message}. Legacy API: ${legacyError.message}`);
    }
  }
}

async function enrichKattisTitles(problems) {
  if (FAST) return problems;
  console.log(`Enriching ${problems.length} Kattis titles…`);
  const enriched = await mapLimit(problems, 6, async (problem, index) => {
    if (problem.title && problem.title.toLowerCase() !== problem.slug.toLowerCase()) return problem;
    const html = await fetchText(`https://open.kattis.com/problems/${encodeURIComponent(problem.slug)}`);
    const $ = cheerio.load(html);
    const title = normaliseSpace($('h1').first().text())
      || normaliseSpace($('meta[property="og:title"]').attr('content'))
      || normaliseSpace($('title').text().split('–')[0]);
    if (index % 50 === 0) console.log(`Kattis titles ${index}/${problems.length}`);
    await sleep(80);
    return { ...problem, title: title || problem.slug };
  });
  return enriched.map((item, index) => item?.error ? problems[index] : item);
}

function makeId(platform, slug) {
  return `${platform}:${slug}`;
}

export function validateProblem(problem) {
  if (!problem.slug || !problem.url || !problem.title) {
    throw new Error(`Incomplete problem record: ${problem.platform}:${problem.sourceId}`);
  }
  if (problem.platform === 'leetcode') {
    if (/^lc\d+$/i.test(problem.slug)) throw new Error(`Unresolved LeetCode slug: ${problem.sourceId}`);
    const expected = `https://leetcode.com/problems/${problem.slug}/`;
    if (problem.url !== expected) throw new Error(`Bad LeetCode URL for ${problem.sourceId}: ${problem.url}`);
  }
  if (problem.platform === 'kattis') {
    const expected = `https://open.kattis.com/problems/${problem.slug}`;
    if (problem.url !== expected) throw new Error(`Bad Kattis URL for ${problem.sourceId}: ${problem.url}`);
  }
}

async function main() {
  const existingCache = await loadExistingProblemCache();
  const allRows = [];
  const starredKeys = new Set();

  for (const chapter of [1, 2, 3, 4]) {
    for (const platform of ['kattis', 'leetcode']) {
      const all = await getCpbookRows(platform, chapter, 'all');
      const starred = await getCpbookRows(platform, chapter, 'starred');
      allRows.push(...all);
      for (const row of starred) starredKeys.add(`${platform}:${row.sourceId}`);
    }
  }

  const hasLeetCode = allRows.some(row => row.platform === 'leetcode');
  const leetCodeCatalog = hasLeetCode ? await fetchLeetCodeCatalog() : new Map();
  const unresolvedLeetCode = [];

  let problems = allRows.flatMap(row => {
    if (row.platform === 'leetcode') {
      const numeric = normaliseLeetCodeNumber(row.sourceId);
      const catalog = leetCodeCatalog.get(numeric);
      if (!catalog) {
        unresolvedLeetCode.push(row.sourceId);
        return [];
      }
      row.slug = catalog.titleSlug;
      row.title = catalog.title;
      row.url = `https://leetcode.com/problems/${catalog.titleSlug}/`;
      row.difficulty = catalog.difficulty;
      row.paidOnly = Boolean(catalog.isPaidOnly);
    } else {
      row.url = `https://open.kattis.com/problems/${row.slug}`;
      const cached = existingCache.get(`kattis:${row.slug}`)
        || existingCache.get(`kattis:source:${String(row.sourceId).toLowerCase()}`);
      if ((!row.title || row.title.toLowerCase() === row.slug.toLowerCase()) && cached?.title) {
        row.title = cached.title;
      }
      if (!row.title) row.title = row.slug;
    }

    row.starred = starredKeys.has(`${row.platform}:${row.sourceId}`);
    row.id = makeId(row.platform, row.slug);
    validateProblem(row);
    return [row];
  });

  if (unresolvedLeetCode.length) {
    throw new Error(`Refusing to write broken links: ${unresolvedLeetCode.length} LeetCode IDs were unresolved (${unresolvedLeetCode.slice(0, 12).join(', ')}${unresolvedLeetCode.length > 12 ? ', …' : ''})`);
  }

  const kattisRows = problems.filter(problem => problem.platform === 'kattis');
  const enrichedKattis = await enrichKattisTitles(kattisRows);
  const kattisMap = new Map(enrichedKattis.map(problem => [problem.id, problem]));
  problems = problems.map(problem => kattisMap.get(problem.id) || problem);

  const unique = new Map();
  for (const problem of problems) {
    validateProblem(problem);
    const key = `${problem.platform}:${problem.slug}`;
    const existing = unique.get(key);
    if (!existing) unique.set(key, problem);
    else {
      existing.starred ||= problem.starred;
      if (!existing.title && problem.title) existing.title = problem.title;
    }
  }

  const chapters = Object.entries(CHAPTERS).map(([numberText, title]) => {
    const number = Number(numberText);
    const chapterProblems = [...unique.values()].filter(problem => problem.chapter === number);
    const sectionMap = new Map();
    for (const problem of chapterProblems) {
      const key = `${problem.sectionCode}|${problem.sectionTitle}`;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, { code: problem.sectionCode, title: problem.sectionTitle, problems: [] });
      }
      sectionMap.get(key).problems.push(problem);
    }

    const sections = [...sectionMap.values()]
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .map(section => ({
        ...section,
        problems: section.problems.sort((a, b) => {
          if (a.starred !== b.starred) return a.starred ? -1 : 1;
          return a.title.localeCompare(b.title);
        })
      }));

    return { number, title, sections };
  });

  const flat = chapters.flatMap(chapter => chapter.sections).flatMap(section => section.problems);
  flat.forEach(validateProblem);
  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'CPBook Methods to Solve, current CP4+5 classification',
      scope: 'Book 1 chapters 1-4; Kattis and LeetCode only',
      note: 'Automatically refreshed from CPBook. LeetCode IDs are resolved through LeetCode catalogue data, and the scraper aborts instead of generating lc#### links when resolution fails.',
      demo: false,
      counts: {
        total: flat.length,
        kattis: flat.filter(problem => problem.platform === 'kattis').length,
        leetcode: flat.filter(problem => problem.platform === 'leetcode').length,
        starred: flat.filter(problem => problem.starred).length
      }
    },
    chapters
  };

  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${flat.length} validated problems to ${OUTPUT}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
