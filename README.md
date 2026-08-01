# CP4 Book 1 Tracker — public GitHub Pages edition

A minimal static checklist for the **current CPBook chapters 1–4**, limited to **Kattis and LeetCode**.

The repository may be public. Account usernames, passwords, and LeetCode cookies are read only from GitHub Actions repository secrets. They are not stored in committed files or added to the generated website.

## What the workflow does

The workflow in `.github/workflows/pages.yml`:

1. detects the small bootstrap catalogue on the first run;
2. scrapes every current Kattis and LeetCode problem in CPBook chapters 1–4;
3. resolves LeetCode numeric IDs to real title slugs;
4. marks CPBook starred problems;
5. validates that a full scrape contains at least 500 records;
6. commits the refreshed `data/problems.json` to the repository;
7. checks your accounts and creates an identity-free `data/solved.json`;
8. deploys the static site to GitHub Pages.

Account statuses refresh every six hours. The CPBook catalogue refreshes weekly and can also be refreshed manually.

## Status colours

- Green: solved
- Red: confirmed unsolved after a complete account sync
- Grey: unknown because an account is not configured, failed, or LeetCode returned only partial public history
- `★`: CPBook starred problem

## Repository secrets

Add these at **Settings → Secrets and variables → Actions**:

| Secret | Required | Purpose |
|---|---:|---|
| `KATTIS_USERNAME` | Recommended | Kattis account name |
| `KATTIS_PASSWORD` | Recommended | Kattis account password |
| `LEETCODE_USERNAME` | Recommended | LeetCode account name |
| `LEETCODE_SESSION` | Optional but recommended | Enables a complete authenticated LeetCode solved list |
| `LEETCODE_CSRF` | Optional but recommended | LeetCode `csrftoken` paired with the session |

Missing accounts are shown as **off** instead of making deployment fail.

## Privacy on a public repository

The workflow never runs on `pull_request`, so code from a public fork cannot receive your repository secrets. GitHub also does not pass Actions secrets to workflows triggered from forks.

The deployed site is public. Its generated `solved.json` therefore reveals which tracked problem slugs are solved, but not the account names or credentials.

Do not commit `.env` files, copied cookies, passwords, or a locally generated solved file containing extra personal fields.

## Publishing and updating

See [`PUBLISHING.md`](PUBLISHING.md) for exact macOS and GitHub CLI commands.

After replacing an older version of the project:

```bash
git add .
git commit -m "Update tracker and full catalogue workflow"
git push
```

Then run a forced catalogue refresh:

```bash
gh workflow run "Sync accounts and deploy" -f refresh_catalogue=true
gh run watch
```

The refreshed catalogue is committed by `github-actions[bot]`, and the same run deploys it.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run scrape
npm run test:full
npm run sync
npm test
npm run build
python3 -m http.server 8000 -d dist
```

Open `http://localhost:8000`.

For local account sync, set the same environment variables used by GitHub Secrets. Avoid typing secret values directly into commands on shared machines because shell history can retain them.

## Data-source note

CPBook’s online Methods to Solve catalogue is now the evolving CP4+5 classification, not a frozen copy of the July 2020 printed book. The tracker intentionally follows its current chapter 1–4 classification and includes newer Kattis and LeetCode additions.
