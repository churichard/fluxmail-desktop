---
name: release
description: Cut, publish, repair, or replace a Fluxmail Desktop GitHub release from the repository's main branch. Use when the user invokes $release, asks to cut or publish a release, pushes a Fluxmail version tag, wants the full preflight, pull request, merge, tag, GitHub Actions, and artifact verification workflow handled, or asks to rebuild or replace existing release assets.
---

# Release

Publish the version in the root `package.json` unless the user supplies a version. Treat an invocation of this skill as authorization to run checks, commit release-related changes, push the workspace branch, open and merge its pull request, push a new version tag, monitor GitHub Actions, and verify the GitHub Release.

Do not expose secret values, move an existing tag, force-push, or bypass branch protection. Stop when a required review, credential, or repository permission needs the user. Require a separate explicit request before replacing assets on an existing release.

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

Check local tags, remote tags, and GitHub Releases:

```sh
git tag --list "<tag>"
git ls-remote --tags origin "refs/tags/<tag>" "refs/tags/<tag>^{}"
gh release view "<tag>" --json tagName,url,isDraft,isPrerelease,body,assets
```

An existing tag is immutable. Never delete, recreate, or retarget it without a separate explicit request. Stop a new-release workflow if the target tag exists. If the user explicitly asks to repair or replace that release, record the tag object, peeled commit, release metadata, asset names, and digests, then follow [manual publishing and release repair](references/manual-publishing.md).

## 2. Validate credentials and signing mode

Read secret names only. Never request or print their values.

Google OAuth overrides are optional. Accept either none or both of these:

- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID`
- `FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET`

With neither Google secret, use the OAuth app bundled with the pinned Fluxmail package. Confirm that the checked-out submodule contains default OAuth support. A pending change in the Fluxmail repository is not enough; this repository must pin a commit that provides the defaults. Stop if only one Google override is configured or if the current pin still requires manual Google credentials.

Apple certificate signing is optional. Treat these as the signing group:

- `MACOS_CERTIFICATE_P12_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`

Treat these as the notarization group:

- `APPLE_API_KEY_P8_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Accept one of three modes:

- With neither group, require ad hoc signing and no notarization.
- With the complete signing group only, require the persistent self-signed Fluxmail identity, no hardened runtime, and no notarization.
- With both complete groups, require Developer ID signing, hardened runtime, and notarization.

Stop if either group is partial or the notarization group is present without the signing group. Never create a new self-signed identity during a release. Reuse the encrypted P12 so each version keeps the same certificate and designated requirement. Confirm that a private backup exists outside GitHub; repository secrets cannot be downloaded later.

Do not describe fallback builds as unsigned. For ad hoc signing in `forge.config.ts`, use an explicit identity and disable hardened runtime and timestamping for every signed file:

```ts
osxSign: {
  identity: "-",
  identityValidation: false,
  optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
},
osxNotarize: undefined,
```

Do not use `osxSign: true` for this fallback. It searches for a signing identity. Do not rely on a top-level `hardenedRuntime: false`; use `optionsForFile` so nested Electron frameworks receive the same setting. Add or retain a config test that checks this behavior.

For a self-signed build, set `APPLE_SIGNING_IDENTITY`, set `identityValidation: false`, disable hardened runtime and timestamping for every signed file, and leave notarization undefined. `@electron/osx-sign` otherwise searches the generic identity policy, which does not return this code-signing-only identity. Keep `continueOnError: false` so Forge cannot silently emit a broken fallback bundle. The default designated requirement must contain the stable bundle identifier and the self-signed certificate hash. Verify that requirement on both architectures with `codesign -d -r-`. Do not add `anchor trusted`; recipients do not trust a private certificate.

## 3. Prepare the release notes

Write the notes in [Common Changelog](https://common-changelog.org/) format before publishing:

```markdown
## [<version>](<release-url>) - YYYY-MM-DD

_<Signing and notarization notice, when needed>_

### Added

- Describe a user-visible change ([#123](<pull-request-url>))
```

Use only relevant Common Changelog sections, in this order: `Changed`, `Added`, `Removed`, and `Fixed`. Write each change as one self-describing line that starts with a present-tense imperative verb. Put linked pull requests or commits at the end of the same line. Sort changes by importance and keep the summary focused on user-visible impact.

Use at most one single-sentence notice before the change groups. Do not add `Contributors`, `New contributors`, or similar credit sections. Do not use GitHub's generated notes as the final release body. Save the prepared body under `.context/` so it can be passed to `gh release create --notes-file` or `gh release edit --notes-file`.

For an ad hoc-signed release, include this notice:

> First release; these artifacts use ad hoc signatures and have not been notarized by Apple, so macOS will require approval before opening the app.

Adjust `First release` for later versions. Do not claim that ad hoc signing prevents all Gatekeeper prompts.

For a self-signed release, replace `ad hoc signatures` with `Fluxmail's self-signed certificate`. State that Apple has not notarized the artifacts and macOS will still require approval. Do not claim that a self-signed certificate makes Gatekeeper trust the app. Note during handoff that the first self-signed build may prompt once for existing Keychain items before later builds inherit access.

## 4. Run the release preflight

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

## 5. Merge release-related changes

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

Do not tag a commit while its main-branch CI run is pending or failing because of code or tests. If GitHub Actions cannot run because of billing, quota, or a service outage, distinguish that infrastructure failure from a test failure. After the complete local preflight passes, ask for explicit authorization to substitute local CI and publish manually. Follow [manual publishing and release repair](references/manual-publishing.md) only after the user approves that fallback.

## 6. Create the release tag

Create an annotated tag on the recorded `origin/main` SHA, then verify it before pushing:

```sh
git tag -a "<tag>" "$release_sha" -m "Fluxmail <tag>"
git rev-list -n 1 "<tag>"
git push origin "<tag>"
```

The tag push is the release event. The workflow at `.github/workflows/release.yml` builds Apple Silicon and Intel artifacts and publishes the matching GitHub Release.

## 7. Monitor the release workflow

Find the `Release` workflow run for both the target tag and recorded SHA. Do not assume the newest run belongs to this release. Watch it until completion:

```sh
gh run list --workflow release.yml --limit 20 \
  --json databaseId,headBranch,headSha,status,conclusion,url
gh run watch <run-id> --exit-status
```

If the run fails, inspect it with `gh run view <run-id> --log-failed`. Rerun failed jobs once only when the failure is clearly transient, such as a runner or network failure. If code, configuration, signing, or packaging caused the failure, do not move the tag to a fix.

If the workflow cannot run because of billing, quota, or a service outage, and the user authorizes a manual release, follow [manual publishing and release repair](references/manual-publishing.md). A manual release must meet the same architecture, signing, packaging, notes, and verification requirements as the workflow.

## 8. Normalize and verify the published release

Replace generated release notes with the prepared Common Changelog body:

```sh
gh release edit "<tag>" --notes-file ".context/<notes-file>.md"
gh release view "<tag>" \
  --json tagName,url,isDraft,isPrerelease,body,assets
```

Confirm:

- The tag matches the requested version and still resolves to the recorded release SHA.
- The release is published, not a draft or prerelease.
- The body follows Common Changelog and has no contributor sections.
- There are two DMGs and two ZIPs.
- Both `arm64` and `x64` artifacts are present.
- Every asset has a nonzero size and an uploaded state.
- GitHub's asset SHA-256 digests match the verified local files.
- The signing notice matches Developer ID, self-signed, or ad hoc signing.

Finish with the version, release SHA, workflow or manual-publish result, release URL, signing status, artifact names, and verification summary. If the process stops early, give the exact blocker and completed steps. Do not claim that a release exists until `gh release view` confirms it.
