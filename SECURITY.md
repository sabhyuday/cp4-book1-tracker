# Security notes

This repository is safe to publish only when account values remain in GitHub Actions repository secrets.

Never commit:

- Kattis usernames or passwords;
- LeetCode usernames, `LEETCODE_SESSION`, or `csrftoken` values;
- `.env` files containing account data;
- browser cookie exports.

The deployment workflow does not run for pull requests. Review any proposed workflow or script change before merging it, because code running on the default branch can access explicitly supplied repository secrets.

The deployed static website intentionally publishes tracked solved-problem slugs. It does not publish account names or profile URLs.
