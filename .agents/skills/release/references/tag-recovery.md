# Failed tag recovery

Use this procedure only when a release workflow failed after a tag push and GitHub never published a Release for that tag. Prefer fixing the defect and cutting a new version.

Never use this procedure for a published GitHub Release, even if its assets are broken. Keep that tag fixed and follow the asset-replacement procedure in `manual-publishing.md`, or publish the fix under a new version.

## Preconditions

Require a separate user request that identifies the existing tag and explicitly authorizes deleting and recreating it. A general release approval, `approve`, `confirmed`, or a request to repair assets is not enough.

Before requesting authorization:

1. Confirm that `gh release view "<tag>"` reports no GitHub Release.
2. Record the local tag object, remote tag object, and remote peeled commit.
3. Fix the release defect through a pull request.
4. Run the complete local preflight and require pull request and main-branch CI to pass.
5. Record the replacement `origin/main` commit.
6. Present a revised approval packet with the old tag object and commit, the replacement commit, the complete release notes, the fix summary, and the signing mode.

Approval expires if the replacement commit or release contents change.

## Replace the failed tag

After explicit approval, confirm again that no GitHub Release exists and that both commits match the approval packet. Only an HTTP 404 proves that the release does not exist. Stop on authentication, network, rate-limit, and other GitHub errors.

Delete and recreate the tag with a lease tied to the approved tag object:

```sh
approved_tag_object="<recorded-tag-object>"

git ls-remote --tags origin \
  "refs/tags/<tag>" "refs/tags/<tag>^{}"

release_probe=$(mktemp)
trap 'rm -f "$release_probe"' EXIT
release_probe_status=0
gh api --include --silent \
  "repos/{owner}/{repo}/releases/tags/<tag>" \
  >"$release_probe" 2>&1 || release_probe_status=$?

if [[ "$release_probe_status" -eq 0 ]]; then
  echo "A GitHub Release exists for <tag>; do not move the tag." >&2
  exit 1
fi
if ! grep -Eq '^HTTP/[0-9.]+ 404([[:space:]]|$)' "$release_probe"; then
  sed -n '1,20p' "$release_probe" >&2
  echo "Could not confirm that <tag> has no GitHub Release." >&2
  exit 1
fi

git push \
  --force-with-lease="refs/tags/<tag>:${approved_tag_object}" \
  origin ":refs/tags/<tag>"
git tag -d "<tag>"
git tag -a "<tag>" "<replacement-sha>" -m "Fluxmail <tag>"
git rev-list -n 1 "<tag>"
git push origin "<tag>"
```

Stop if a GitHub Release appears, the old tag no longer matches the recorded object and commit, or the replacement commit changes.

After pushing, read the remote tag object and peeled commit. Require the peeled commit to equal the approved replacement SHA, then monitor and verify the new release through the main workflow. Include both the old and new tag objects and commits in the final handoff.
