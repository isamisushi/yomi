# Docs Deployment

The public documentation site is a VitePress app deployed to Fly.io.

Production URL:

```txt
https://yomi-docs.fly.dev/
```

## Local Preview

```bash
npm run docs:dev
```

## Build

```bash
npm run docs:build
```

## Deploy to Fly.io

Confirm the Fly account first:

```bash
flyctl auth whoami
```

Deploy from the repository root with the docs-specific Fly config:

```bash
npm run docs:deploy
```

This runs:

```bash
flyctl deploy . --config docs/fly.toml
```

## Files

- `docs/fly.toml` - Fly app config for `yomi-docs`.
- `docs/Dockerfile` - builds the VitePress site and serves it with nginx.
- `docs/nginx.conf` - static file and clean URL fallback config.
- `.dockerignore` - root-level Docker context ignore file. This stays at the
  repository root because Docker/Fly read it from the build context root.
