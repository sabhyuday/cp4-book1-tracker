# Publish the tracker from a Mac terminal

This edition is designed for a **public GitHub repository**. All usernames, passwords, and cookies remain in GitHub Actions repository secrets.

The Pages website and its solved-problem slugs are public. Account identities and credentials are not included in deployed files.

## 1. Extract and enter the project

Double-click the ZIP in Finder, then run:

```bash
cd ~/Downloads/cp4-book1-tracker-public-full
ls -la
```

You should see `package.json`, `index.html`, `data`, `scripts`, and `.github`.

## 2. Install Git tools

Check Git:

```bash
git --version
```

When macOS asks for developer tools, install them with:

```bash
xcode-select --install
```

Check Homebrew:

```bash
brew --version
```

When Homebrew is missing, install it:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Run the shell setup commands printed by Homebrew, then install GitHub CLI and Node.js:

```bash
brew install gh node
gh --version
node --version
npm --version
```

## 3. Log into GitHub

```bash
gh auth login
```

Choose:

```text
GitHub.com
HTTPS
Login with a web browser
```

Allow GitHub CLI to configure Git authentication. Verify:

```bash
gh auth status
```

## 4. Configure your Git author

```bash
git config --global user.name "Your Name"
git config --global user.email "your-verified-github-email@example.com"
```

## 5A. Create a new public repository

From inside the extracted project:

```bash
git init
git add .
git commit -m "Initial CP4 tracker"
git branch -M main
gh repo create cp4-book1-tracker --public --source=. --remote=origin --push
```

## 5B. Replace an existing tracker repository

Copy the new project files into your existing local repository, keeping its `.git` directory. Then run:

```bash
git status
git add .
git commit -m "Update full CP4 catalogue tracker"
git push
```

## 6. Add account secrets

Each command opens a hidden prompt. Paste the value and press Enter:

```bash
gh secret set KATTIS_USERNAME
gh secret set KATTIS_PASSWORD
gh secret set LEETCODE_USERNAME
```

For complete LeetCode checking, also add:

```bash
gh secret set LEETCODE_SESSION
gh secret set LEETCODE_CSRF
```

Check only the secret names:

```bash
gh secret list
```

Do not put secret values in repository files, commits, issue posts, screenshots, or command-line arguments.

### Find the optional LeetCode cookies

1. Sign in to LeetCode.
2. Open browser Developer Tools.
3. Open **Application/Storage → Cookies → `https://leetcode.com`**.
4. Store the `LEETCODE_SESSION` value as the secret of the same name.
5. Store the `csrftoken` value as `LEETCODE_CSRF`.

These cookies are equivalent to login credentials and expire periodically.

## 7. Enable GitHub Pages Actions deployment

From inside the repository:

```bash
gh api --method POST repos/{owner}/{repo}/pages -f build_type=workflow
```

When GitHub says the Pages site already exists, run:

```bash
gh api --method PUT repos/{owner}/{repo}/pages -f build_type=workflow
```

Browser alternative:

```text
Repository → Settings → Pages → Build and deployment → Source → GitHub Actions
```

## 8. Fetch every problem and deploy

Force the first full catalogue refresh:

```bash
gh workflow run "Sync accounts and deploy" -f refresh_catalogue=true
gh run watch
```

This run may be longer than ordinary syncs because it:

- reads all chapter 1–4 Kattis and LeetCode rows from CPBook;
- resolves real LeetCode slugs;
- retrieves missing Kattis titles;
- validates that the result is a full dataset;
- commits `data/problems.json` using `github-actions[bot]`;
- checks your accounts and deploys the site.

After success, update your local branch because the bot committed the catalogue:

```bash
git pull --rebase
```

Open the deployed site:

```bash
open "$(gh api repos/{owner}/{repo}/pages --jq .html_url)"
```

## 9. Normal operation

- Solved statuses refresh every six hours.
- The complete CPBook catalogue refreshes every Sunday.
- Pushes redeploy the site.
- A manual full refresh is available with:

```bash
gh workflow run "Sync accounts and deploy" -f refresh_catalogue=true
gh run watch
```

A normal account-only refresh is:

```bash
gh workflow run "Sync accounts and deploy"
gh run watch
```

## Public-repository safety

- The workflow has no `pull_request` trigger.
- Forked pull requests do not receive your repository secrets.
- Only merge workflow changes you have reviewed.
- Protect `main` if other people can write to the repository.
- The generated Pages site exposes solved problem slugs, because static website data is public.

## Troubleshooting

### The first workflow starts before secrets are added

That is okay. Missing accounts appear as **off**. Add the secrets, then run the workflow manually again.

### Full catalogue validation fails

Open the failed log:

```bash
gh run view --log-failed
```

Retry the forced refresh. A temporary CPBook, Kattis, or LeetCode rate limit can interrupt the scrape. The workflow refuses to replace the existing catalogue with a suspiciously small result.

### The bot cannot push `data/problems.json`

Open:

```text
Settings → Actions → General → Workflow permissions
```

Select **Read and write permissions**, then rerun the workflow. Also check branch-protection rules if `main` requires pull requests.

### Kattis sync fails

Re-enter both Kattis secrets and verify the same credentials work on Kattis:

```bash
gh secret set KATTIS_USERNAME
gh secret set KATTIS_PASSWORD
```

### LeetCode stays partial or grey

Refresh the cookie secrets:

```bash
gh secret set LEETCODE_SESSION
gh secret set LEETCODE_CSRF
```

Without valid cookies, only the public recent-accepted list may be available, so unseen problems remain grey.

### Pages returns 404

Confirm **Settings → Pages → Source** is **GitHub Actions**, then inspect:

```bash
gh run list --workflow "Sync accounts and deploy"
gh run view --log-failed
```
