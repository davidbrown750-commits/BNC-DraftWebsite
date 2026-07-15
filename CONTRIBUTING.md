# Contributing to the Berkeley Nucleonics website

This repository is the live **www.berkeleynucleonics.com** site. Make all website edits here. This is the one and only website repo. (An older copy, `bnc-website-source-STALE-do-not-use`, is deprecated. Do not edit or deploy from it.)

## Make changes on a branch and open a pull request

Do not push straight to `main`, and do not fork the repo. Same repo, a branch, a pull request that David reviews and merges.

1. `git checkout main && git pull`
2. `git checkout -b short-name-for-your-change`
3. Make the edit.
4. `git add -A && git commit -m "what changed and why"`
5. `git push -u origin short-name-for-your-change`
6. Open a pull request (the button on GitHub, or `gh pr create`), then tell David.

## First-time setup so your pushes work

Run these once on your machine. This is usually what's behind a tool saying it "does not have access":

1. `gh auth login` — choose GitHub.com and HTTPS, and log in.
2. `gh auth setup-git` — lets git push using your GitHub login.
3. If a push ever reports an access error, run `gh auth status` to confirm you are logged in.

## Keep it on-brand

Visual changes and new pages follow the BNC design system and the site's SEO title and meta conventions, the same as the rest of the site.
