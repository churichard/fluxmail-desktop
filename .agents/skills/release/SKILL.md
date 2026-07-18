---
name: release
description: Cut a complete Fluxmail Desktop GitHub release from the repository's main branch. Use when the user invokes $release, asks to cut or publish a release, pushes a Fluxmail version tag, or wants the full preflight, pull request, merge, tag, GitHub Actions, and artifact verification workflow handled for them.
---

# Release

Publish the version in the root `package.json` unless the user supplies a version. Treat an invocation of this skill as authorization to run checks, commit release-related changes, push the workspace branch, open and merge its pull request, push the version tag, monitor GitHub Actions, and verify the GitHub Release.

Do not expose secret values, move an existing tag, force-push, or bypass branch protection. Stop when a required review, credential, or repository permission needs the user.

## 1. Inspect the release state

Run these checks before changing anything:

```sh
git status --short --branch
git remote -v
git fetch origin --prune --tags
git log -1 --oneline --decorate
git diff --check
node -p "require('./package.json').version"
gh repo view --json nameWithOwner,defaultBranchRef,url
gh secret list --app actions
```

Require the default branch to be `main` and use `origin/main` as the release source. Do not switch or rename the current Conductor workspace branch.

Use an explicitly requested version when provided. Otherwise, read `package.json`. Normalize the tag to `v<version>` and require a valid semantic version. If the requested version differs from `package.json`, update the manifest with:

```sh
pnpm version <version> --no-git-tag-version
```

Include that version change in the release pull request. Do not infer a new version when the package version already has a remote tag. Ask the user which version to use.

Check local tags, remote tags, and GitHub Releases. Stop if any of them already uses the target tag:

```sh
git tag --list "<tag>"
git ls-remote --tags origin "refs/tags/<tag>"
gh release view "<tag>"
```

An existing tag is immutable for this workflow. Never delete, recreate, or retarget it without a separate explicit request.

## 2. Validate credentials

Read secret names only. Never request or print their values.

Google OAuth overrides are optional. Accept either none or both of these:

- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID`
- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET`

With neither Google secret, use the OAuth app bundled with the pinned Fluxmail package. Confirm that the checked-out submodule actually contains default OAuth support. A pending change in the Fluxmail repository is not enough; this repository must pin a commit that provides the defaults. Stop if only one Google override is configured or if the current pin still requires manual Google credentials.

Apple signing is optional. Accept either none or all of these:

- `MACOS_CERTIFICATE_P12_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_KEY_P8_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Stop if only some Apple secrets are configured. With no Apple secrets, state that the release will not have a Developer ID signature or Apple notarization. Do not block an unsigned release for that reason.

## 3. Run the release preflight

Initialize the pinned Fluxmail submodule and reproduce CI locally:

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm build:mcp
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm make
```

Run `pnpm test:e2e` because every release affects the packaged Electron application. Confirm that `pnpm make` creates a DMG and ZIP under `out/make` for the local architecture.

If a check fails, diagnose it. Fix failures caused by release-related changes, rerun the narrow check, then rerun the full preflight. Do not absorb unrelated user changes into the release.

## 4. Merge release-related changes

Compare the workspace with `origin/main`:

```sh
git diff --stat origin/main...
git diff origin/main...
git log --oneline origin/main..HEAD
```

If the workspace contains release-related changes that are not on `origin/main`:

1. Review the diff and preserve unrelated user work.
2. Stage only the intended files.
3. Commit with a concise message that describes the change.
4. Push the current branch without renaming it.
5. Create or reuse a pull request targeting `main`.
6. Watch all pull request checks to completion.
7. Merge with the repository's allowed merge method. Prefer squash merge for this repository and do not delete the workspace branch.

Use `gh pr status`, `gh pr view`, `gh pr checks --watch`, and `gh pr merge --squash` as appropriate. If branch protection requires human review, report the pull request URL and wait for approval instead of bypassing it.

If the workspace has unrelated dirty changes that cannot be separated safely, stop and identify the files. Do not stash, discard, or commit them.

After merging, fetch `origin/main` again. Wait for the `CI` workflow on the exact release commit to pass. Record the full release SHA:

```sh
git fetch origin --prune --tags
release_sha=$(git rev-parse origin/main)
```

Do not tag a commit while its main-branch CI run is pending or failing.

## 5. Create the release tag

Create an annotated tag on the recorded `origin/main` SHA, then verify it before pushing:

```sh
git tag -a "<tag>" "$release_sha" -m "Fluxmail <tag>"
git rev-list -n 1 "<tag>"
git push origin "<tag>"
```

The tag push is the release event. The workflow at `.github/workflows/release.yml` builds Apple Silicon and Intel artifacts and publishes the matching GitHub Release.

## 6. Monitor the release workflow

Find the `Release` workflow run for both the target tag and recorded SHA. Do not assume the newest run belongs to this release. Watch it until completion:

```sh
gh run list --workflow release.yml --limit 20 \
  --json databaseId,headBranch,headSha,status,conclusion,url
gh run watch <run-id> --exit-status
```

If the run fails, inspect it with `gh run view <run-id> --log-failed`. Rerun failed jobs once only when the failure is clearly transient, such as runner or network failure. If code, configuration, signing, or packaging caused the failure, do not move the tag to a fix. Report the failure and explain that a new commit requires a new version unless the user separately authorizes tag deletion before a release exists.

## 7. Verify the published release

Read the release metadata and confirm:

- The tag matches the requested version.
- The release is published, not a draft or prerelease.
- There are two DMGs and two ZIPs.
- Both `arm64` and `x64` artifacts are present.
- Every asset has a nonzero size.
- An unsigned release includes the warning added by the workflow.

Use:

```sh
gh release view "<tag>" \
  --json tagName,url,isDraft,isPrerelease,body,assets
```

Finish with the version, release SHA, workflow result, release URL, signing status, and artifact names. If the process stops early, give the exact blocker and the completed steps. Do not claim that a release exists until `gh release view` confirms it.
