# Agent Skills

Yomi can install command guidance as project-local agent skills through the
Crust skills plugin.

```bash
npx @isamisushi/yomi-cli@latest skill --all --scope project
```

In this repository:

```bash
npm run yomi -- skill --all --scope project
```

For an installed CLI:

```bash
yomi skill --all --scope project
```

## Included Skills

Yomi currently ships:

- `yomi` - generated command guidance for the CLI.
- `yomi-react-repair` - how an agent should use `repair`, evidence trails, and
  do-not-start hints during React bug work.
- `yomi-react-instrumentation` - how an agent should use `plan-trace` and
  `instrument` to collect runtime history without tracing the whole app.

## Generated vs Bundled Skills

The `yomi` skill is generated from the Crust command tree. It is the best place
for an agent to check exact command names, flags, defaults, and help text.

The React skills are bundled workflow skills:

- `yomi-react-repair` tells the agent how to use repair briefs without blindly
  editing display-only components.
- `yomi-react-instrumentation` tells the agent when to add focused runtime trace
  points and when to avoid broad instrumentation.

Use both kinds together. The generated skill answers "what command exists?" The
workflow skills answer "when should the agent use it?"

## Install Location

With `--scope project`, Yomi writes skills into project-local agent directories.
Current Crust skill installation writes the universal agent skill path and any
detected agent-specific paths, such as:

```txt
.agents/skills/
.claude/skills/
```

This keeps the guidance inside the repository instead of relying on every
developer's global agent setup.

Use project scope for OSS examples, team repositories, and benchmark fixtures.
Use global scope only for your own machine:

```bash
yomi skill --all --scope global
```

## Update Skills

Re-run installation when the CLI changes:

```bash
yomi skill update --all --scope project
```

Do this after upgrading `@isamisushi/yomi-cli`, changing command names, or changing
the bundled workflow skills. Otherwise an agent may follow stale flags or stale
workflow rules.

## Agent Setup Flow

For a new repository, the recommended setup is:

```bash
npx @isamisushi/yomi-cli@latest index --force
npx @isamisushi/yomi-cli@latest doctor
npx @isamisushi/yomi-cli@latest skill --all --scope project
```

Then commit the generated project-local skills only if you want every coding
agent working in the repo to share the same Yomi workflow guidance.

## Why Skills Matter

The CLI output is JSON, but agents also need operating discipline. The skills
encode rules such as:

- start from the visible symptom
- trust `editTarget` as the first inspection point, not a blind patch location
- treat `doNotStartFrom` as evidence-only unless source inspection proves the
  graph is stale
- use `plan-trace` before choosing broad instrumentation
- verify the visible behavior after editing

This keeps Yomi from being just another command list. It gives an agent a
repeatable repair workflow.
