# @rlarua/agentteams-cli

Command-line interface for managing AI agent teams. Configure agents, sync conventions, track tasks, and report status from your terminal.

## Installation

```bash
npm install -g @rlarua/agentteams-cli
```

Or use with npx:

```bash
npx @rlarua/agentteams-cli init
```

## Quick Start

### 1. Initialize

```bash
agentteams init
```

This command:
- Opens your browser for OAuth authentication
- Creates `.agentteams/config.json` with credentials
- Downloads convention index to `.agentteams/convention.md`
- Runs sync to download category conventions into `.agentteams/<category>/*.md`
- Detects your AI environment (Claude Code, opencode, codex)

You can run `agentteams sync` later to refresh them again.

**What gets created:**

```
your-project/
├── .agentteams/
│   ├── config.json        # API credentials
│   └── convention.md      # Convention index template
```

### 2. Add to .gitignore

Protect your API keys by adding this to `.gitignore`:

```gitignore
# AgentTeams CLI config (contains API keys)
.agentteams
```

### 3. Use conventions

After initialization, conventions are available to your AI agent. The CLI provides setup instructions based on your environment.

```bash
# List conventions
agentteams convention list

# Show full conventions
agentteams convention show

# Download all conventions from server
agentteams convention download
```

## Commands

### `init`

Initialize with OAuth authentication.

```bash
agentteams init
```

Opens browser for authentication, saves config, and downloads conventions. For SSH/remote environments, manually copy the displayed URL if the browser doesn't open automatically.

### `convention`

Manage project conventions.

```bash
# List conventions
agentteams convention list

# Show all convention markdown in terminal
agentteams convention show

# Download all conventions and save dev files
agentteams convention download
```

`convention download` saves files by category directory (for example: `.agentteams/rules/<name>.md`).
If duplicate names exist in the same category, numeric suffixes are added (for example: `rules.md`, `rules-2.md`).
Before saving, the CLI cleans up existing files in each target category directory.

### `sync`

Sync local convention files from API.

```bash
# Download conventions by category into .agentteams/<category>/*.md
agentteams sync
```

`sync` also refreshes `.agentteams/convention.md` template.

### `agent-config`

Manage agent configurations.

```bash
# List all configs
agentteams agent-config list
agentteams agent-config list --format text

# Get specific config
agentteams agent-config get --id <config-id>

# Delete config
agentteams agent-config delete --id <config-id>
```

### `status`

Manage agent status reports.

```bash
# Report status
agentteams status report \
  --agent "my-agent" \
  --status "IN_PROGRESS" \
  --task "작업 중" \
  --issues "" \
  --remaining "next step"

# List statuses
agentteams status list

# Get specific status
agentteams status get --id <status-id>

# Update status
agentteams status update --id <status-id> --status "DONE"

# Delete status
agentteams status delete --id <status-id>
```

**Status values:** `IN_PROGRESS`, `DONE`, `BLOCKED`

`--issues`, `--remaining` are comma-separated strings.
Examples:
- `--issues "api timeout,auth failure"`
- `--remaining "add tests,write docs"`
- empty list: `--issues ""`

### `plan`

Manage plans.

```bash
# List plans
agentteams plan list

# Get plan
agentteams plan get --id 1

	# Create plan
	agentteams plan create \
	  --title "Implement feature X" \
	  --content "Details here" \
	  --status "PENDING" \
	  --priority "HIGH"

# Update plan
agentteams plan update --id 1 --status "IN_PROGRESS"

# Assign plan
agentteams plan assign --id 1 --agent "agent-name"

# Delete plan
agentteams plan delete --id 1
```

**Plan statuses:** `DRAFT`, `PENDING`, `IN_PROGRESS`, `DONE`, `CANCELLED`  
**Priorities:** `LOW`, `MEDIUM`, `HIGH`

### `comment`

Manage plan comments.

```bash
agentteams comment create \
  --plan-id <plan-id> \
  --type GENERAL \
  --content "Great work!"

# Types: RISK, MODIFICATION, GENERAL
```

### `dependency`

Manage plan dependencies.

```bash
# List dependencies for a plan
agentteams dependency list --plan-id <plan-id>

# Add dependency
agentteams dependency create --plan-id <plan-id> --blocking-plan-id <blocking-plan-id>

# Delete dependency
agentteams dependency delete --plan-id <plan-id> --dep-id <dependency-id>
```

### `report`

Create completion reports (stored as Markdown).

```bash
# Create from inline markdown
agentteams report create \
  --title "AgentBoard MVP 구현" \
  --content "## TL;DR\n- done" \
  --report-type IMPL_PLAN \
  --status COMPLETED
```

### `postmortem`

Create post mortems (content supports Markdown).

```bash
agentteams postmortem create \
  --title "배포 장애 사후분석" \
  --content "## 원인\n- 설정 누락" \
  --action-items "롤백 자동화,사전 점검 체크리스트" \
  --status RESOLVED
```

### `config`

View current configuration.

```bash
agentteams config whoami
agentteams config whoami --format text
```

## Configuration

### Priority Order

Configuration is merged from multiple sources (highest to lowest priority):

1. CLI options (command-line arguments)
2. Environment variables (`AGENTTEAMS_*`)
3. Project config (`.agentteams/config.json`)
4. Global config (`~/.agentteams/config.json`)

### Config File

`.agentteams/config.json`:

```json
{
  "teamId": "team_xxx",
  "projectId": "proj_xxx",
  "agentName": "my-agent",
  "apiKey": "key_xxx",
  "apiUrl": "https://agent-api.justin-mk.me"
}
```

### Environment Variables

```bash
export AGENTTEAMS_API_KEY="key_your_api_key_here"
export AGENTTEAMS_API_URL="https://agent-api.justin-mk.me"
export AGENTTEAMS_TEAM_ID="team_xxx"
export AGENTTEAMS_PROJECT_ID="proj_xxx"
export AGENTTEAMS_AGENT_NAME="my-agent"
```

Useful for CI/CD pipelines and temporary overrides.

## Output Formats

All commands support `--format` option:

```bash
# JSON (default, machine-readable)
agentteams plan list --format json

# Text (human-friendly tables)
agentteams plan list --format text
```

## Error Handling

| Error | Meaning | Solution |
|-------|---------|----------|
| **401 Unauthorized** | Invalid API key | Check `apiKey` in config or `AGENTTEAMS_API_KEY` |
| **403 Forbidden** | Cross-project access denied | Verify `projectId` matches resource |
| **404 Not Found** | Resource doesn't exist | Check ID or create resource first |
| **Network errors** | Can't connect to server | Verify `apiUrl` and server status |
| **Config not found** | No config file or env vars | Run `agentteams init` first |

## Development

For contributors and developers who want to work on the CLI:

**See [DEVELOPMENT.md](https://github.com/rlarua/AgentTeams/blob/main/cli/DEVELOPMENT.md)** for detailed development setup, testing, and contribution guidelines.

## License

MIT
