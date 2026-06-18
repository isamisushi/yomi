# GitHub Publication Guide

This is the checklist for making Yomi understandable as a public GitHub project.

## Recommended Public Positioning

Use this as the short description:

> Agent-facing React repair context for AI coding agents.

The core claim should stay narrow:

> Yomi helps a coding agent move from a visible React UI symptom to the source
> owner, likely edit target, and verification trace.

Avoid positioning Yomi as:

- a general browser automation framework
- a generic code graph
- an AI UI generator
- a replacement for Playwright
- a replacement for React DevTools
- a generic agent protocol

Those categories are too broad and already crowded.

## Repository Structure

Recommended public structure:

```txt
README.md
docs/
  README.md
  getting-started.md
  agent-workflow.md
  architecture.md
  cli.md
  publication.md
fixtures/
src/
tests/
e2e/
```

The README should remain a short landing page. Long implementation details
belong in `docs/`.

## README Should Answer

The top-level README should answer, in this order:

1. What is Yomi?
2. Who is it for?
3. What problem does it solve?
4. How do I try it?
5. What is implemented today?
6. What is not implemented yet?
7. Where are the detailed docs?

Do not make the README a full changelog or benchmark report.

## Before Making the Repository Public

Required:

- Ensure `npm test` passes.
- Ensure `npm run typecheck` passes.
- Ensure `npm run test:e2e` passes, or document why it is skipped.
- Ensure `npm run build:cli:package` passes.
- Ensure `npm run package:cli` passes.
- Keep generated outputs ignored: `.yomi/`, `.crust/`, `dist/`, `test-results/`, `playwright-report/`, `coverage/`, `*.tgz`.
- Keep `LICENSE` and `package.json#license` aligned.
- Remove private notes, tokens, internal URLs, and unpublished strategy that should not be public.
- Set `private: false` only when npm publication is intended.

Recommended:

- Add `CONTRIBUTING.md`.
- Add `SECURITY.md` if accepting vulnerability reports.
- Add GitHub Actions for typecheck, unit tests, and E2E smoke tests.
- Add a short demo screenshot or terminal output once the CLI output format stabilizes.

## License

Yomi uses the MIT License.

MIT is a good fit for early frontend tooling adoption because it is permissive,
simple, and familiar to JavaScript ecosystem users.

## npm Publication Notes

The source `package.json` remains private, while staged npm packages are public:

```json
{ "name": "@isamisushi/yomi-cli", "private": true, "version": "0.1.0" }
```

Before npm publication:

- keep the CLI package under `@isamisushi/yomi-cli`; `yomi` is already taken on npm
- keep React runtime adapters under `@isamisushi/yomi`
- keep the source package private; publish from staged packages in `.crust/npm`
- stage macOS, Linux, and Windows CLI binaries for arm64 and x64 as GitHub Release assets
- upload release assets and `checksums.txt` before npm publication
- verify the `yomi` bin
- verify subpath exports such as `@isamisushi/yomi/react` and `@isamisushi/yomi/tanstack-query`
- verify package contents with `npm run package:cli`
- keep Crust staging output out of the committed tree

The release workflow in `.github/workflows/release.yml` is the intended publish
path. It runs on `v*` tags, stages packages and binary assets, verifies a packed
install through `YOMI_BINARY_PATH`, uploads GitHub Release assets, then publishes
`@isamisushi/yomi` and `@isamisushi/yomi-cli` to npm.

The tag must match `package.json` exactly. For version `0.1.0`, push `v0.1.0`.
The workflow fails before building when the tag and package version differ.

## What to Be Honest About

The public docs should explicitly say that Yomi is early.

Implemented today:

- static React/TypeScript extraction
- repair briefs
- runtime trace adapter APIs
- verifier scenarios
- benchmark examples
- package dry-run verification

Not complete yet:

- automatic production instrumentation
- complete React semantics
- full Next.js server component semantics
- every state/data library
- automatic code patching
- visual AI or screenshot understanding

This honesty matters. Overclaiming will make the project look weaker, not
stronger.
