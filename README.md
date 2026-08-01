# CP4 Book 1 Tracker — private-source GitHub Pages edition

A minimal static checklist for the Kattis and LeetCode problems in CP4 Book 1.

The source repository can be **private** with GitHub Pro. The deployed GitHub Pages website is still publicly reachable, so the build publishes only:

- problem catalogue data;
- solved problem slugs for the tracked CP4 problems;
- sync state and timestamps.

It does **not** publish usernames, passwords, LeetCode cookies, or profile URLs. Every account value is read from GitHub Actions repository secrets.

## Status colours

- Green: solved
- Red: confirmed unsolved after a complete sync
- Grey: unknown because an account is disabled or the available LeetCode sync is partial
- `★`: CPBook starred problem

## Secrets

Add these in the repository's Actions secrets:

| Secret | Required | Purpose |
|---|---:|---|
| `KATTIS_USERNAME` | For Kattis | Kattis account name |
| `KATTIS_PASSWORD` | For Kattis | Kattis account password |
| `LEETCODE_USERNAME` | For LeetCode | LeetCode account name |
| `LEETCODE_SESSION` | Recommended | Enables the complete authenticated solved list |
| `LEETCODE_CSRF` | Recommended | LeetCode `csrftoken` paired with the session |

Without the two LeetCode cookie secrets, the updater uses LeetCode's public recent-accepted list. Seen problems become green, but unseen problems remain grey because that list may be incomplete.

## macOS terminal setup and publishing

Full commands are in [`PUBLISHING.md`](PUBLISHING.md).

## How deployment works

The workflow in `.github/workflows/pages.yml` runs after pushes, manually, and every six hours. It:

1. reads usernames and credentials from encrypted repository secrets;
2. logs into Kattis and checks LeetCode;
3. generates `data/solved.json` inside the temporary Actions runner;
4. validates the problem links and ensures no account identity is published;
5. builds the static `dist` directory;
6. deploys that artifact to GitHub Pages.

The generated account file is deployed directly and is not committed back to the repository.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
export KATTIS_USERNAME='your-kattis-name'
export KATTIS_PASSWORD='your-kattis-password'
export LEETCODE_USERNAME='your-leetcode-name'
export LEETCODE_SESSION='your-session-cookie-value' # optional
export LEETCODE_CSRF='your-csrftoken'                # optional
npm run sync
npm test
npm run build
python3 -m http.server 8000 -d dist
```

Open `http://localhost:8000`.

Avoid putting secrets directly into shell commands on shared machines, because shell history may retain them. GitHub CLI's interactive `gh secret set NAME` prompt is safer for publishing.

## Refreshing the CPBook catalogue

The included catalogue is the validated preview data from the previous build. To scrape the current CPBook chapters 1–4 for Kattis and LeetCode:

```bash
npm install
npm run scrape
npm test
```

The scraper refuses to save unresolved fake LeetCode slugs such as `lc2469`.
