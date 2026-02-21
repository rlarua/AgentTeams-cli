# @rlarua/agentteams-cli

A CLI for working with the AgentTeams API from your terminal.
It supports convention sync, status reporting, and plan/comment/report management.

## Installation

```bash
npm install -g @rlarua/agentteams-cli
```

Or run with `npx`:

```bash
npx @rlarua/agentteams-cli init
```

## Quick Start

### 1. Initialize

```bash
agentteams init
```

The `init` command:

- Opens a browser for OAuth authentication
- Creates `.agentteams/config.json`
- Saves the convention template to `.agentteams/convention.md`
- Syncs convention files into `.agentteams/<category>/*.md`

In SSH/remote environments, open the URL printed in the terminal manually.

### Service URLs (Defaults and Overrides)

The CLI talks to two services:

- Web app (OAuth flow): defaults to `https://agent-web.justin-mk.me`
- API: no hardcoded default; it is read from `.agentteams/config.json` (created by `init`) or overridden via `AGENTTEAMS_API_URL` (commonly `https://agent-api.justin-mk.me`)

Typical usage:

- Production: run `agentteams init` and do not set any URL overrides.
- If you need to point the CLI to a different environment, override URLs with environment variables.

Override examples (production):

```bash
export AGENTTEAMS_API_URL="https://agent-api.justin-mk.me"
```

Override examples (advanced):

```bash
# Override the web app used by `agentteams init` (OAuth authorize page)
export AGENTTEAMS_WEB_URL="https://your-agentteams-web.example.com"

# Override the API base URL used by all API calls
export AGENTTEAMS_API_URL="https://your-agentteams-api.example.com"
```

### 2. Protect Sensitive Data

`.agentteams` may contain API keys, so do not commit it to git.

```gitignore
# AgentTeams CLI config (contains API keys)
.agentteams
```

### 3. Use Conventions

```bash
agentteams convention list
agentteams convention show
agentteams convention download
agentteams convention create --file .agentteams/rules/new-rule.md
agentteams convention update --file .agentteams/rules/context.md
agentteams convention update --file .agentteams/rules/context.md --apply
agentteams convention delete --file .agentteams/rules/context.md
agentteams convention delete --file .agentteams/rules/context.md --apply
```

## Core Commands

### `init`

Initialize the CLI via OAuth and download conventions.

```bash
agentteams init
```

### `convention`

Manage project conventions.

```bash
agentteams convention list
agentteams convention show
agentteams convention download
agentteams convention create --file .agentteams/rules/new-rule.md
agentteams convention update --file .agentteams/rules/context.md
agentteams convention update --file .agentteams/rules/context.md --apply
agentteams convention delete --file .agentteams/rules/context.md
agentteams convention delete --file .agentteams/rules/context.md --apply
```

`convention download` saves files by category in `.agentteams/<category>/`.
If file names collide within the same category, suffixes like `-2`, `-3` are added.

#### `convention create`

Create a new convention.

- The input file must be under `.agentteams/<category>/*.md`, and `<category>` is inferred from the path.
- Frontmatter is optional. Supported fields: `trigger`, `description`, `agentInstruction`, `title` (optional).
- After creation, the CLI immediately updates `.agentteams/conventions.manifest.json`, so you can `update/delete` the same file right away.
- Run `agentteams convention download` if you want to refresh `convention.md` and the server-normalized (downloadable) markdown.

Examples:

```bash
agentteams convention create --file .agentteams/rules/new-rule.md
```

#### `convention update` / `convention delete`

- By default, `update` and `delete` run in **dry-run** mode. They print a diff/plan and do not modify the server.
- Use `--apply` to actually update/delete the server resource.
- Only files produced by `agentteams convention download` are allowed. The CLI uses `.agentteams/conventions.manifest.json` to map local files to server conventions.

Examples:

```bash
# Preview changes (dry-run)
agentteams convention update --file .agentteams/rules/context.md

# Apply update to server
agentteams convention update --file .agentteams/rules/context.md --apply

# Preview deletion (dry-run)
agentteams convention delete --file .agentteams/rules/context.md

# Apply deletion to server
agentteams convention delete --file .agentteams/rules/context.md --apply
```

Common errors:

- `403 Forbidden`: the server rejected the operation due to missing write permissions.
- `409 Conflict`: optimistic-lock conflict (someone else updated the convention). Download again and retry.

### `sync`

Resync convention files.

```bash
agentteams sync
```

### `status`

Manage agent statuses.

```bash
agentteams status report \
  --agent "my-agent" \
  --status "IN_PROGRESS" \
  --task "Working on task" \
  --issues "" \
  --remaining "next step"

agentteams status list
agentteams status get --id <status-id>
agentteams status update --id <status-id> --status "DONE"
agentteams status delete --id <status-id>
```

Note: `--agent` is optional, but your server may require it depending on your setup.

Status values: `IN_PROGRESS`, `DONE`, `BLOCKED`

### `plan`

Manage plans.

Note: Plans are always created as `DRAFT`. Even if you pass `--status` to `plan create`, the server will ignore it. Use `plan update` to change status after creation.

```bash
agentteams plan list
agentteams plan get --id <plan-id>

agentteams plan create \
  --title "Implement feature" \
  --content "Detailed content" \
  --priority "HIGH"

agentteams plan update --id <plan-id> --status "PENDING"
agentteams plan update --id <plan-id> --status "IN_PROGRESS"
agentteams plan assign --id <plan-id> --agent "agent-name"
agentteams plan download --id <plan-id>
agentteams plan cleanup --id <plan-id>
agentteams plan delete --id <plan-id>
```

Status values: `DRAFT`, `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED`

Priorities: `LOW`, `MEDIUM`, `HIGH`

### `comment`

Manage plan comments.

```bash
agentteams comment list --plan-id <plan-id>

agentteams comment create \
  --plan-id <plan-id> \
  --type GENERAL \
  --content "Work completed"

agentteams comment update --id <comment-id> --content "Updated content"
agentteams comment delete --id <comment-id>
```

Types: `RISK`, `MODIFICATION`, `GENERAL`

### `dependency`

Manage plan dependencies.

```bash
agentteams dependency list --plan-id <plan-id>
agentteams dependency create --plan-id <plan-id> --blocking-plan-id <blocking-plan-id>
agentteams dependency delete --plan-id <plan-id> --dep-id <dependency-id>
```

### `agent-config`

View or delete agent configurations.

```bash
agentteams agent-config list
agentteams agent-config get --id <config-id>
agentteams agent-config delete --id <config-id>
```

### `report`

Manage completion reports.

Tip: Include reproducible verification evidence (commands + outcomes), but keep outcomes short: `pass/fail + 1–3 lines of summary`. Do not paste long raw logs into the report body.

```bash
agentteams report list

agentteams report create \
  --title "AgentTeams completion report" \
  --content "## TL;DR\n- done" \
  --report-type IMPL_PLAN \
  --status COMPLETED
```

Report types: `IMPL_PLAN`, `COMMIT_RANGE`, `TASK_COMPLETION`

Status values: `COMPLETED`, `FAILED`, `PARTIAL`

### `postmortem`

Manage post mortems.

Tip: If you have platform guides downloaded under `.agentteams/platform/guides/`, prefer the template in `post-mortem-guide.md`.

```bash
agentteams postmortem list

agentteams postmortem create \
  --title "Deployment incident analysis" \
  --content "## Root cause\n- Missing configuration" \
  --action-items "Automate rollback,Pre-release checklist" \
  --status RESOLVED
```

Status values: `OPEN`, `IN_PROGRESS`, `RESOLVED`

### `config`

```bash
agentteams config whoami
agentteams config whoami --format text
```

`config whoami` prints current environment variable values for `AGENTTEAMS_API_KEY` and `AGENTTEAMS_API_URL`.

## Configuration

Configuration is merged in this priority order (highest first):

1. CLI options
2. Environment variables (`AGENTTEAMS_*`)
3. Project config (`.agentteams/config.json`)
4. Global config (`~/.agentteams/config.json`)

### Config File Example

```json
{
  "teamId": "team_xxx",
  "projectId": "proj_xxx",
  "agentName": "my-agent",
  "apiKey": "key_xxx",
  "apiUrl": "https://agent-api.justin-mk.me"
}
```

### Environment Variable Example

```bash
export AGENTTEAMS_API_KEY="key_your_api_key_here"
export AGENTTEAMS_API_URL="https://agent-api.justin-mk.me"
export AGENTTEAMS_TEAM_ID="team_xxx"
export AGENTTEAMS_PROJECT_ID="proj_xxx"
export AGENTTEAMS_AGENT_NAME="my-agent"
```

## Output Format

Most resource commands support `--format json|text`.

Output behavior by default:

- `plan create|update|start|finish`: prints short summary lines on stdout by default.
- `plan list|get` and other read-oriented commands: keep full output by default.
- `--verbose`: always prints full output to stdout.
- `--output-file <path>`: always writes full output to file and keeps stdout short.

Compatibility note:

- If you need full JSON on stdout for automation, pass `--format json` explicitly.

```bash
agentteams plan list --format json
agentteams plan list --format text
agentteams plan update --id <plan-id> --status IN_PROGRESS --format json
```

Note: `convention` does not support `--format`.

## Error Guide

The API may include an optional machine-readable `errorCode` in error responses:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Cross-project access denied",
  "errorCode": "CROSS_PROJECT_ACCESS_DENIED"
}
```

The CLI prioritizes `errorCode` when present and falls back to message/status-based handling for older API responses.

| Error | Meaning | Resolution |
|---|---|---|
| `401 Unauthorized` | Invalid API key | Check `apiKey` or `AGENTTEAMS_API_KEY` |
| `403 Forbidden` | No access to project | Verify `projectId` |
| `404 Not Found` | Resource does not exist | Verify ID or create the resource |
| Network error | Cannot reach server | Check `apiUrl` and server status |
| Missing config | Config file/env vars not found | Run `agentteams init` |

## License

Apache-2.0

This license applies to the CLI code distributed in this package.
Use of the AgentTeams service/API may require credentials and is governed by separate service terms/policies.
