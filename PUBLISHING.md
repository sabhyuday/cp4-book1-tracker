# Publish from a Mac terminal

This guide creates a **private GitHub repository** and deploys the static tracker with GitHub Pages.

> Important: GitHub Pro allows Pages to use a private source repository, but the resulting Pages website is public. The project therefore keeps account identities and credentials out of the deployed files. Your solved CP4 problem slugs are visible to anyone who can access the site URL.

## 1. Extract the download

The easiest method is to double-click the ZIP in Finder. Then open Terminal and move into the extracted folder, for example:

```bash
cd ~/Downloads/cp4-book1-tracker-private-pages
```

Use `pwd` and `ls` to confirm that you can see `package.json`, `index.html`, and `.github`.

## 2. Install Apple's command-line tools

Check Git:

```bash
git --version
```

If macOS says the developer tools are missing, install them:

```bash
xcode-select --install
```

Complete the macOS installer, then run `git --version` again.

## 3. Install Homebrew, when needed

Check whether Homebrew is already installed:

```bash
brew --version
```

If `brew` is not found, install Homebrew using its official installer:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

At the end, Homebrew prints one or two commands for adding it to your shell `PATH`. Run the exact commands it shows, then verify:

```bash
brew --version
```

## 4. Install GitHub CLI

```bash
brew install gh
gh --version
```

## 5. Log into GitHub

```bash
gh auth login
```

Choose:

```text
GitHub.com
HTTPS
Login with a web browser
```

When asked whether GitHub CLI should authenticate Git as well, choose **Yes**. Copy the one-time code, press Enter to open the browser, sign in, and authorise GitHub CLI.

Verify the login:

```bash
gh auth status
```

## 6. Configure your Git author details

Use the name and verified email associated with your GitHub account:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Check them:

```bash
git config --global --get user.name
git config --global --get user.email
```

## 7. Create the private repository and push the code

From inside the extracted project folder:

```bash
git init
git add .
git commit -m "Initial CP4 tracker"
git branch -M main
gh repo create cp4-book1-tracker --private --source=. --remote=origin --push
```

You can replace `cp4-book1-tracker` with another repository name.

Open the private repository in your browser:

```bash
gh repo view --web
```

## 8. Add account secrets safely

Each command opens a hidden-value prompt. Paste the requested value and press Enter. The value is encrypted before GitHub CLI sends it to GitHub.

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

Confirm that the secret **names** exist; their values will not be shown:

```bash
gh secret list
```

Do not place these values in files, commits, screenshots, issue posts, or command-line arguments.

### Finding LeetCode cookies

1. Sign in to LeetCode in your browser.
2. Open Developer Tools.
3. Open **Application** or **Storage** → **Cookies** → `https://leetcode.com`.
4. Copy the values of `LEETCODE_SESSION` and `csrftoken`.
5. Store `csrftoken` as the `LEETCODE_CSRF` GitHub secret.

Treat both values like passwords. They expire and may need to be replaced later.

## 9. Enable GitHub Pages with Actions

Enable Pages from the terminal:

```bash
gh api --method POST repos/{owner}/{repo}/pages -f build_type=workflow
```

The `{owner}` and `{repo}` placeholders are understood by `gh api` when you run it inside this repository.

If GitHub reports that the Pages site already exists, update it instead:

```bash
gh api --method PUT repos/{owner}/{repo}/pages -f build_type=workflow
```

Browser fallback:

```bash
gh repo view --web
```

Then choose:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

The project already contains the required workflow, so do not generate a replacement workflow.

## 10. Run the first account sync and deployment

```bash
gh workflow run "Sync accounts and deploy"
```

Watch it:

```bash
gh run watch
```

After it succeeds, inspect the Pages deployment URL:

```bash
gh api repos/{owner}/{repo}/pages --jq .html_url
```

Open the site:

```bash
open "$(gh api repos/{owner}/{repo}/pages --jq .html_url)"
```

The `{owner}` and `{repo}` placeholders are understood by `gh api` when run inside the repository.

## 11. Updating the project later

After editing files:

```bash
git add .
git commit -m "Update tracker"
git push
```

A push to `main` automatically syncs the accounts and redeploys the site. The scheduled workflow also refreshes account data every six hours.

To trigger a refresh manually:

```bash
gh workflow run "Sync accounts and deploy"
gh run watch
```

## Troubleshooting

### `brew: command not found`

Run the shell setup commands printed by the Homebrew installer, close and reopen Terminal, then try `brew --version`.

### `gh: command not found`

```bash
brew update
brew install gh
```

### GitHub CLI is logged into the wrong account

```bash
gh auth status
gh auth logout
gh auth login
```

### Workflow says a secret is missing

```bash
gh secret list
```

Re-enter the missing one using `gh secret set SECRET_NAME`.

### Kattis login fails

Re-enter both Kattis secrets. Some accounts may use a login setup that Kattis' email-login form does not accept; verify that the same username and password work on the Kattis website.

### LeetCode is partial or grey

Refresh `LEETCODE_SESSION` and `LEETCODE_CSRF`; the cookies can expire. Without valid cookies, only the public recent-accepted list is available.

### Pages returns 404

Confirm that **Settings → Pages → Source** is set to **GitHub Actions**, then inspect the most recent run:

```bash
gh run list --workflow "Sync accounts and deploy"
gh run view --log-failed
```
