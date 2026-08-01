const state = {
  problemsData: null,
  solvedData: null,
  solvedSets: { kattis: new Set(), leetcode: new Set() },
  platform: 'all',
  status: 'all',
  search: ''
};

const elements = {
  chapters: document.querySelector('#chapters'),
  accountSummary: document.querySelector('#accountSummary'),
  syncNotice: document.querySelector('#syncNotice'),
  solvedMetric: document.querySelector('#solvedMetric'),
  totalMetric: document.querySelector('#totalMetric'),
  starMetric: document.querySelector('#starMetric'),
  progressText: document.querySelector('#progressText'),
  progressBar: document.querySelector('#progressBar'),
  searchInput: document.querySelector('#searchInput'),
  platformFilters: document.querySelector('#platformFilters'),
  statusFilters: document.querySelector('#statusFilters'),
  problemTemplate: document.querySelector('#problemTemplate')
};

function normalise(value) {
  return String(value || '').trim().toLowerCase();
}

function flattenProblems(data) {
  return (data?.chapters || []).flatMap(chapter =>
    (chapter.sections || []).flatMap(section =>
      (section.problems || []).map(problem => ({
        ...problem,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        sectionCode: section.code,
        sectionTitle: section.title
      }))
    )
  );
}

function accountFor(platform) {
  return state.solvedData?.accounts?.[platform] || {
    configured: false,
    complete: false,
    solved: []
  };
}

function problemStatus(problem) {
  const account = accountFor(problem.platform);
  if (state.solvedSets[problem.platform]?.has(normalise(problem.slug))) return 'solved';
  if (account.complete) return 'unsolved';
  return 'unknown';
}

function matches(problem) {
  const status = problemStatus(problem);
  const query = state.search;
  const haystack = normalise([
    problem.title,
    problem.slug,
    problem.sourceId,
    problem.sectionCode,
    problem.sectionTitle
  ].join(' '));

  const platformMatch = state.platform === 'all' ||
    problem.platform === state.platform ||
    (state.platform === 'starred' && problem.starred);
  const statusMatch = state.status === 'all' || status === state.status;
  const searchMatch = !query || haystack.includes(query);
  return platformMatch && statusMatch && searchMatch;
}

function createAccountBadge(platform, label) {
  const account = accountFor(platform);
  const badge = document.createElement('span');
  badge.className = 'account';

  if (account.error) {
    badge.classList.add('error');
    badge.textContent = `${label} error`;
  } else if (account.complete) {
    badge.classList.add('complete');
    badge.textContent = `${label} synced`;
  } else if (account.configured) {
    badge.classList.add('partial');
    badge.textContent = `${label} partial`;
  } else {
    badge.textContent = `${label} off`;
  }

  badge.title = account.error || account.source || 'No account configured';
  return badge;
}

function renderAccounts() {
  elements.accountSummary.replaceChildren(
    createAccountBadge('kattis', 'Kattis'),
    createAccountBadge('leetcode', 'LeetCode')
  );
}

function renderNotice() {
  const messages = [];
  let level = '';
  const generatedAt = state.solvedData?.generatedAt;
  const metadata = state.problemsData?.metadata;

  if (generatedAt) {
    const date = new Date(generatedAt);
    messages.push(`Account data updated ${Number.isNaN(date.valueOf()) ? generatedAt : date.toLocaleString()}.`);
  } else {
    messages.push('Account checking has not run yet. Add repository secrets and run the GitHub Action.');
    level = 'warning';
  }

  for (const [name, account] of Object.entries(state.solvedData?.accounts || {})) {
    if (account?.error) {
      messages.push(`${name === 'kattis' ? 'Kattis' : 'LeetCode'}: ${account.error}`);
      level = 'error';
    } else if (account?.configured && !account?.complete) {
      messages.push(`${name === 'kattis' ? 'Kattis' : 'LeetCode'} sync is partial, so unseen problems are grey rather than red.`);
      if (!level) level = 'warning';
    }
  }

  if (metadata?.demo) {
    messages.push('This is the bootstrap catalogue. Run the GitHub workflow once; it will fetch, validate, commit, and deploy the complete current CPBook list.');
    if (!level) level = 'warning';
  }

  elements.syncNotice.className = `notice ${level}`.trim();
  elements.syncNotice.textContent = messages.join(' ');
}

function renderSummary() {
  const problems = flattenProblems(state.problemsData);
  const solved = problems.filter(problem => problemStatus(problem) === 'solved');
  const starred = problems.filter(problem => problem.starred);
  const starredSolved = starred.filter(problem => problemStatus(problem) === 'solved');
  const percent = problems.length ? Math.round((solved.length / problems.length) * 100) : 0;

  elements.solvedMetric.textContent = solved.length;
  elements.totalMetric.textContent = problems.length;
  elements.starMetric.textContent = `${starredSolved.length}/${starred.length}`;
  elements.progressText.textContent = `${percent}%`;
  elements.progressBar.style.width = `${percent}%`;
}

function makeProblemRow(problem) {
  const row = elements.problemTemplate.content.firstElementChild.cloneNode(true);
  const status = problemStatus(problem);
  row.classList.add(status);
  row.querySelector('.problem-title').textContent = problem.title;
  row.querySelector('.problem-title').href = problem.url;
  row.querySelector('.platform').textContent = problem.platform;
  row.querySelector('.platform').classList.add(problem.platform);
  row.querySelector('.problem-id').textContent = problem.sourceId || problem.slug;
  row.querySelector('.status-text').textContent = status;

  const star = row.querySelector('.star');
  if (!problem.starred) star.remove();

  const difficulty = row.querySelector('.difficulty');
  const detail = problem.difficulty || (problem.points ? `${problem.points} pts` : '');
  if (detail) difficulty.textContent = detail;
  else difficulty.remove();

  return row;
}

function renderChapters() {
  const fragment = document.createDocumentFragment();
  let visibleProblems = 0;

  for (const chapter of state.problemsData?.chapters || []) {
    const visibleSections = [];
    for (const section of chapter.sections || []) {
      const problems = (section.problems || []).filter(matches);
      if (problems.length) visibleSections.push({ ...section, problems });
    }
    if (!visibleSections.length) continue;

    const chapterElement = document.createElement('article');
    chapterElement.className = 'chapter';
    const chapterProblemCount = visibleSections.reduce((sum, section) => sum + section.problems.length, 0);
    const chapterSolvedCount = visibleSections.reduce(
      (sum, section) => sum + section.problems.filter(problem => problemStatus(problem) === 'solved').length,
      0
    );
    visibleProblems += chapterProblemCount;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chapter-toggle';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.innerHTML = `
      <span class="chapter-number">${chapter.number}</span>
      <span class="chapter-name"><strong>${chapter.title}</strong><span>${visibleSections.length} sections</span></span>
      <span class="chapter-count">${chapterSolvedCount}/${chapterProblemCount} solved</span>
      <span class="chapter-chevron">⌄</span>
    `;
    toggle.addEventListener('click', () => {
      const collapsed = chapterElement.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });

    const body = document.createElement('div');
    body.className = 'chapter-body';

    for (const section of visibleSections) {
      const sectionElement = document.createElement('section');
      sectionElement.className = 'section';
      const sectionSolved = section.problems.filter(problem => problemStatus(problem) === 'solved').length;
      sectionElement.innerHTML = `
        <header class="section-header">
          <div><span class="section-code">${section.code}</span><span class="section-title">${section.title}</span></div>
          <span class="section-count">${sectionSolved}/${section.problems.length}</span>
        </header>
      `;

      const list = document.createElement('ul');
      list.className = 'problem-list';
      for (const problem of section.problems) list.append(makeProblemRow(problem));
      sectionElement.append(list);
      body.append(sectionElement);
    }

    chapterElement.append(toggle, body);
    fragment.append(chapterElement);
  }

  elements.chapters.replaceChildren(fragment);
  if (!visibleProblems) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No problems match these filters.';
    elements.chapters.append(empty);
  }
}

function render() {
  renderAccounts();
  renderNotice();
  renderSummary();
  renderChapters();
}

function bindFilterGroup(container, key) {
  container.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    for (const item of container.querySelectorAll('button')) item.classList.remove('active');
    button.classList.add('active');
    state[key] = button.dataset[key];
    renderChapters();
  });
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function initialise() {
  try {
    [state.problemsData, state.solvedData] = await Promise.all([
      loadJson('./data/problems.json'),
      loadJson('./data/solved.json')
    ]);
    state.solvedSets = {
      kattis: new Set((accountFor('kattis').solved || []).map(normalise)),
      leetcode: new Set((accountFor('leetcode').solved || []).map(normalise))
    };
    render();
  } catch (error) {
    elements.syncNotice.className = 'notice error';
    elements.syncNotice.textContent = `Could not load tracker data: ${error.message}`;
  }
}

elements.searchInput.addEventListener('input', event => {
  state.search = normalise(event.target.value);
  renderChapters();
});
bindFilterGroup(elements.platformFilters, 'platform');
bindFilterGroup(elements.statusFilters, 'status');
initialise();
