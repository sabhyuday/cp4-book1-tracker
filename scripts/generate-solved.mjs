import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROBLEMS_FILE = path.join(ROOT, 'data', 'problems.json');
const OUTPUT_FILE = path.join(ROOT, 'data', 'solved.json');
const KATTIS_BASE_URL = (process.env.KATTIS_BASE_URL || 'https://open.kattis.com').replace(/\/$/, '');
const USER_AGENT = process.env.BROWSER_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function cleanUsername(value) {
  return String(value || '').trim().replace(/^@/, '').slice(0, 100);
}

function assertUsername(value, platform) {
  if (value && !/^[a-zA-Z0-9_.-]+$/.test(value)) {
    throw new Error(`${platform} username contains unsupported characters.`);
  }
}

function normaliseSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (fallback !== null && error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function fetchResponse(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'en-GB,en;q=0.9',
          ...(options.headers || {})
        }
      });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(700 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: { accept: 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Upstream returned invalid JSON.');
  }
  if (payload?.errors?.length) {
    throw new Error(payload.errors.map(item => item.message).filter(Boolean).join('; ') || 'GraphQL request failed.');
  }
  return payload;
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map(item => item.trim()).filter(Boolean);
}

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  return splitSetCookieHeader(response.headers.get('set-cookie'));
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(response) {
    for (const header of responseCookies(response)) {
      const pair = header.split(';', 1)[0];
      const equals = pair.indexOf('=');
      if (equals <= 0) continue;
      this.cookies.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim());
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

async function fetchWithCookies(url, options, jar, redirectsLeft = 6) {
  const cookie = jar.header();
  const response = await fetchResponse(url, {
    ...options,
    redirect: 'manual',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(options?.headers || {})
    }
  });
  jar.absorb(response);

  if ([301, 302, 303, 307, 308].includes(response.status) && redirectsLeft > 0) {
    const location = response.headers.get('location');
    if (!location) return response;
    const nextUrl = new URL(location, url).href;
    const method = String(options?.method || 'GET').toUpperCase();
    const convertToGet = response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === 'POST');
    const nextOptions = convertToGet
      ? { method: 'GET', headers: { referer: url }, timeoutMs: options?.timeoutMs }
      : { ...options, headers: { ...(options?.headers || {}), referer: url } };
    if (convertToGet) delete nextOptions.body;
    return fetchWithCookies(nextUrl, nextOptions, jar, redirectsLeft - 1);
  }

  return response;
}

async function loginToKattis(username, password) {
  const jar = new CookieJar();
  const loginUrl = `${KATTIS_BASE_URL}/login/email`;
  const page = await fetchWithCookies(loginUrl, { method: 'GET' }, jar);
  const html = await page.text();
  if (!page.ok) throw new Error(`Kattis login page returned ${page.status}.`);

  const $ = cheerio.load(html);
  const csrf = $('input[name="csrf_token"]').attr('value') ||
    html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)/i)?.[1];
  if (!csrf) throw new Error('Kattis login form changed: CSRF token not found.');

  const body = new URLSearchParams({ csrf_token: csrf, user: username, password });
  const result = await fetchWithCookies(loginUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: KATTIS_BASE_URL,
      referer: loginUrl
    },
    body
  }, jar);
  const resultHtml = await result.text();
  const resultPath = new URL(result.url || loginUrl).pathname;

  if (!result.ok || /^\/login(?:\/email)?\/?$/.test(resultPath) ||
      /incorrect|invalid password|could not log|login failed/i.test(resultHtml)) {
    throw new Error('Kattis login failed. Check the username and password.');
  }

  return jar;
}

function extractKattisSolved(html) {
  const $ = cheerio.load(html);
  const solved = new Set();
  $('tbody tr a[href*="/problems/"]').each((_, node) => {
    const href = $(node).attr('href') || '';
    const slug = href.match(/\/problems\/([^/?#]+)/)?.[1];
    if (slug) solved.add(normaliseSlug(slug));
  });
  return solved;
}

function extractKattisNextPage(html, currentUrl) {
  const $ = cheerio.load(html);
  for (const node of $('a[href]').toArray()) {
    const text = $(node).text().trim().toLowerCase();
    const aria = String($(node).attr('aria-label') || '').toLowerCase();
    const rel = String($(node).attr('rel') || '').toLowerCase();
    if (!(rel.includes('next') || aria.includes('next') || ['next', '›', '»', '→'].includes(text))) continue;
    const href = $(node).attr('href');
    if (!href) continue;
    const url = new URL(href, currentUrl);
    if (url.origin === new URL(KATTIS_BASE_URL).origin && url.pathname === '/problems') return url.href;
  }
  return null;
}

async function syncKattis(username, password) {
  if (!password) throw new Error('KATTIS_PASSWORD is not configured in GitHub Secrets.');
  const jar = await loginToKattis(username, password);
  const solved = new Set();
  const visited = new Set();
  let pagesRead = 0;
  let nextUrl = `${KATTIS_BASE_URL}/problems?order=problem_difficulty&f_solved=on&f_partial-score=off&f_tried=off&f_untried=off&f_language=-1`;

  while (nextUrl && !visited.has(nextUrl) && pagesRead < 250) {
    visited.add(nextUrl);
    const response = await fetchWithCookies(nextUrl, {
      method: 'GET',
      headers: { referer: KATTIS_BASE_URL }
    }, jar);
    const html = await response.text();
    if (!response.ok) throw new Error(`Kattis solved-problem page returned ${response.status}.`);
    if (/^\/login(?:\/email)?\/?$/.test(new URL(response.url || nextUrl).pathname)) {
      throw new Error('Kattis session expired while reading solved problems.');
    }

    for (const slug of extractKattisSolved(html)) solved.add(slug);
    pagesRead += 1;
    nextUrl = extractKattisNextPage(html, nextUrl);
  }

  return {
    solved: [...solved],
    complete: true,
    source: `Authenticated Kattis archive (${pagesRead} page${pagesRead === 1 ? '' : 's'})`,
    totalSolved: solved.size
  };
}

function leetCodeCookieHeader(sessionValue, csrf) {
  const parts = [];
  const session = String(sessionValue || '').trim();
  if (session) parts.push(session.includes('LEETCODE_SESSION=') ? session : `LEETCODE_SESSION=${session}`);
  if (csrf && !parts.some(part => /(?:^|;\s*)csrftoken=/.test(part))) parts.push(`csrftoken=${csrf}`);
  return parts.join('; ');
}

async function syncLeetCodeAuthenticated(session, csrf) {
  const query = `
    query userProgressQuestionList($filters: UserProgressQuestionListInput) {
      userProgressQuestionList(filters: $filters) {
        totalNum
        questions { titleSlug }
      }
    }
  `;
  const solved = new Set();
  let skip = 0;
  const limit = 100;
  let total = Infinity;
  const cookie = leetCodeCookieHeader(session, csrf);

  while (skip < total) {
    const payload = await fetchJson('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrftoken': csrf,
        referer: 'https://leetcode.com/progress/',
        cookie
      },
      body: JSON.stringify({
        operationName: 'userProgressQuestionList',
        query,
        variables: { filters: { questionStatus: 'SOLVED', skip, limit } }
      })
    });

    const result = payload?.data?.userProgressQuestionList;
    if (!Array.isArray(result?.questions)) throw new Error('Authenticated LeetCode response shape changed.');
    total = Number(result.totalNum);
    if (!Number.isFinite(total)) total = skip + result.questions.length;
    for (const item of result.questions) {
      if (item?.titleSlug) solved.add(normaliseSlug(item.titleSlug));
    }
    if (!result.questions.length) break;
    skip += result.questions.length;
    if (result.questions.length < limit) break;
    await sleep(150);
  }

  return {
    solved: [...solved],
    complete: true,
    source: 'Authenticated LeetCode progress list',
    totalSolved: Number.isFinite(total) ? total : solved.size
  };
}

async function syncLeetCodePublic(username) {
  const query = `
    query publicProfileSync($username: String!, $limit: Int!) {
      matchedUser(username: $username) {
        username
        submitStatsGlobal { acSubmissionNum { difficulty count } }
      }
      recentAcSubmissionList(username: $username, limit: $limit) { titleSlug }
    }
  `;
  const payload = await fetchJson('https://leetcode.com/graphql/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      referer: `https://leetcode.com/u/${encodeURIComponent(username)}/`
    },
    body: JSON.stringify({
      operationName: 'publicProfileSync',
      query,
      variables: { username, limit: 20 }
    })
  });

  const user = payload?.data?.matchedUser;
  if (!user) throw new Error('LeetCode user not found.');
  const solved = [...new Set((payload?.data?.recentAcSubmissionList || [])
    .map(item => normaliseSlug(item?.titleSlug))
    .filter(Boolean))];
  const totalSolved = Number(user?.submitStatsGlobal?.acSubmissionNum
    ?.find(item => item.difficulty === 'All')?.count);

  return {
    solved,
    complete: Number.isFinite(totalSolved) && totalSolved <= solved.length,
    source: 'LeetCode public recent-accepted list',
    totalSolved: Number.isFinite(totalSolved) ? totalSolved : null
  };
}

async function syncLeetCode(username) {
  const session = String(process.env.LEETCODE_SESSION || '').trim();
  const csrf = String(process.env.LEETCODE_CSRF || '').trim();
  if (session && csrf) return syncLeetCodeAuthenticated(session, csrf);
  return syncLeetCodePublic(username);
}

function trackedSlugs(problemsData, platform) {
  return new Set((problemsData?.chapters || []).flatMap(chapter => chapter.sections || [])
    .flatMap(section => section.problems || [])
    .filter(problem => problem.platform === platform)
    .map(problem => normaliseSlug(problem.slug)));
}

function makeUnconfigured() {
  return {
    configured: false,
    complete: false,
    source: null,
    error: null,
    totalSolved: null,
    solved: []
  };
}

async function runPlatform({ username, sync, tracked }) {
  if (!username) return makeUnconfigured();
  const attemptedAt = new Date().toISOString();
  try {
    const result = await sync();
    const solved = [...new Set((result.solved || []).map(normaliseSlug).filter(slug => tracked.has(slug)))].sort();
    return {
      configured: true,
      complete: Boolean(result.complete),
      source: result.source || null,
      error: null,
      attemptedAt,
      lastSuccessfulAt: attemptedAt,
      totalSolved: Number.isFinite(result.totalSolved) ? result.totalSolved : null,
      solved
    };
  } catch (error) {
    return {
      configured: true,
      complete: false,
      source: null,
      error: error?.message || String(error),
      attemptedAt,
      lastSuccessfulAt: null,
      totalSolved: null,
      solved: []
    };
  }
}

async function main() {
  const problems = await readJson(PROBLEMS_FILE);
  const kattisUsername = cleanUsername(process.env.KATTIS_USERNAME);
  const leetcodeUsername = cleanUsername(process.env.LEETCODE_USERNAME);
  assertUsername(kattisUsername, 'Kattis');
  assertUsername(leetcodeUsername, 'LeetCode');

  const kattisTracked = trackedSlugs(problems, 'kattis');
  const leetcodeTracked = trackedSlugs(problems, 'leetcode');
  const [kattis, leetcode] = await Promise.all([
    runPlatform({
      username: kattisUsername,
      tracked: kattisTracked,
      sync: () => syncKattis(kattisUsername, String(process.env.KATTIS_PASSWORD || ''))
    }),
    runPlatform({
      username: leetcodeUsername,
      tracked: leetcodeTracked,
      sync: () => syncLeetCode(leetcodeUsername)
    })
  ]);

  const output = {
    generatedAt: new Date().toISOString(),
    accounts: { kattis, leetcode }
  };
  await writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);

  for (const [name, account] of Object.entries(output.accounts)) {
    if (!account.configured) console.log(`${name}: not configured`);
    else if (account.error) console.error(`${name}: ${account.error}`);
    else console.log(`${name}: ${account.solved.length} tracked solved (${account.complete ? 'complete' : 'partial'})`);
  }
  console.log(`Wrote ${OUTPUT_FILE}`);

  if (process.env.STRICT_SYNC === '1') {
    const failures = Object.entries(output.accounts)
      .filter(([, account]) => account.configured && account.error)
      .map(([name, account]) => `${name}: ${account.error}`);
    if (failures.length) throw new Error(`Account sync failed. ${failures.join(' | ')}`);
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
