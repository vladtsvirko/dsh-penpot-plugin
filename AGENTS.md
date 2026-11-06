# Release rules

This repository is a DSH plugin, versioned on its own — it is **not** released
together with `dsh-tg-docker-setup` or `dsh-telegram-connector`.

- Semver: `0.x` is the compatible line; a breaking change is `1.0.0`.
- Tags are `v` + `package.json` version, and immutable once pushed.
- Every release states the DSH range and the Penpot versions it was tested
  against in `COMPATIBILITY.md`; CI fails a tag whose version is not in the
  table (`scripts/check-version.mjs`).
- Penpot's RPC is internal and moves between 2.x minors. A shape or command
  change is a compatibility event: test, then either widen the tested row or cut
  a release.
- Credentials never go in `cordis.patch.yml`; the row reads them from the
  environment.
- Every tag is a release: `.github/workflows/publish.yml` publishes that exact
  version to npm with provenance. The workflow needs the repository secret
  `NPM_TOKEN` with publish rights.

## Repository metadata

The upstream DSH README asks plugin repositories to carry the GitHub topic
`dsh-plugin` (the About box, not a file). Keep it set, along with
`deepseek-harness` and the product topic (`telegram` or `penpot`). Topics need
repository administration rights; `gh repo edit --add-topic dsh-plugin` or the
API's `PUT /repos/{owner}/{repo}/topics` are the two ways to set them.

## Release checklist

1. `npm run typecheck && npm test && npm run build` and `npm publish --dry-run`.
2. Update `package.json`, `package-lock.json`, `CHANGELOG.md` and the
   `COMPATIBILITY.md` row.
3. Commit, tag `v<version>`, push. CI validates the tag, and `publish.yml`
   uploads that exact version to npm.
4. After the npm version exists, optionally bump the setup's `plugins.json`
   `spec`/`fallback`/`minimum`.
