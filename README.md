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
- Downloads project conventions to `.agentteams/convention.md`
- Detects your AI environment (Claude Code, opencode, codex)

**What gets created:**

```
your-project/
├── .agentteams/
│   ├── config.json        # API credentials
│   └── convention.md      # Project conventions
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
# View conventions
agentteams convention show

# Update from server
agentteams convention update
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
# Show current conventions
agentteams convention show

# Update from server
agentteams convention update

# Append reference to CLAUDE.md (Claude Code)
agentteams convention append
```

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
  --agent-name "my-agent" \
  --status "IN_PROGRESS" \
  --project-id 1

# List statuses
agentteams status list

# Get specific status
agentteams status get --id <status-id>

# Update status
agentteams status update --id <status-id> --status "COMPLETED"

# Delete status
agentteams status delete --id <status-id>
```

**Status values:** `IDLE`, `IN_PROGRESS`, `COMPLETED`, `ERROR`

### `task`

Manage tasks.

```bash
# List tasks
agentteams task list

# Get task
agentteams task get --id 1

# Create task
agentteams task create \
  --title "Implement feature X" \
  --description "Details here" \
  --status "PENDING" \
  --priority "HIGH" \
  --plan-id 1

# Update task
agentteams task update --id 1 --status "IN_PROGRESS"

# Assign task
agentteams task assign --id 1 --agent "agent-name"

# Delete task
agentteams task delete --id 1
```

**Task statuses:** `PENDING`, `IN_PROGRESS`, `DONE`, `CANCELLED`  
**Priorities:** `LOW`, `MEDIUM`, `HIGH`

### `comment`

Manage task comments.

```bash
agentteams comment create \
  --task-id 1 \
  --content "Great work!" \
  --author-id 1
```

### `report`

Create completion reports.

```bash
# Basic report
agentteams report create \
  --task-id 1 \
  --summary "Task completed successfully" \
  --agent-id 1

# Report with details
agentteams report create \
  --task-id 1 \
  --summary "Feature implemented" \
  --agent-id 1 \
  --details '{"hours": 2, "files_changed": 5}'
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
  "apiUrl": "http://localhost:3001"
}
```

### Environment Variables

```bash
export AGENTTEAMS_API_KEY="key_your_api_key_here"
export AGENTTEAMS_API_URL="http://localhost:3001"
export AGENTTEAMS_TEAM_ID="team_xxx"
export AGENTTEAMS_PROJECT_ID="proj_xxx"
export AGENTTEAMS_AGENT_NAME="my-agent"
```

Useful for CI/CD pipelines and temporary overrides.

## Output Formats

All commands support `--format` option:

```bash
# JSON (default, machine-readable)
agentteams task list --format json

# Text (human-friendly tables)
agentteams task list --format text
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

```bash
# Clone repository
git clone https://github.com/rlarua/AgentTeams.git
cd AgentTeams/cli

# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js init

# Link for global testing
npm link
agentteams init

# Run tests
npm test
```

## License

MIT
