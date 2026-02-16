# @agentteams/cli

Command-line interface for AgentTeams API. Manage agent configurations, conventions, tasks, and status reports from your terminal.

## Quick Start

### 1. Install

```bash
npm install -g @agentteams/cli
```

Or use directly with npx:

```bash
npx @agentteams/cli init
```

### 2. Initialize

Run `init` to authenticate and set up your project:

```bash
agentteams init
```

This command:
- Opens your browser for OAuth authentication
- Creates `.agentteams/config.json` with your credentials
- Downloads project conventions to `.agentteams/convention.md`
- Automatically detects your AI environment (Claude Code, opencode, codex)

**What gets created:**

```
your-project/
├── .agentteams/
│   ├── config.json        # API credentials (gitignored)
│   └── convention.md      # Project conventions
```

**Important:** Add `.agentteams` to your `.gitignore` to protect API keys:

```gitignore
# AgentTeams CLI config (contains API keys)
.agentteams
```

### 3. Use conventions

After initialization, conventions are automatically available to your AI agent. The CLI detects your environment and provides setup instructions.

**Manual setup (if needed):**

```bash
# View downloaded conventions
agentteams convention show

# Append reference to CLAUDE.md (for Claude Code)
agentteams convention append

# Update conventions from server
agentteams convention update
```

## Commands

### `init`

Initialize AgentTeams CLI with OAuth authentication.

```bash
agentteams init
```

**What it does:**
1. Starts local OAuth server
2. Opens browser for authentication
3. Saves config to `.agentteams/config.json`
4. Downloads conventions to `.agentteams/convention.md`

**SSH/Remote environments:**
If browser can't open automatically, copy the displayed URL and open it manually.

### `convention`

Manage project conventions.

```bash
# Show current conventions
agentteams convention show

# Append reference to CLAUDE.md
agentteams convention append

# Update conventions from server
agentteams convention update
```

**`convention show`**
- Displays content of `.agentteams/convention.md`
- Requires prior `init` or `convention update`

**`convention append`**
- Adds convention reference to `CLAUDE.md`
- Creates backup at `CLAUDE.md.backup`
- Prompts for confirmation before modifying

**`convention update`**
- Downloads latest conventions from server
- Overwrites `.agentteams/convention.md`
- Merges all project conventions into single file

### `agent-config`

Manage agent configurations.

```bash
# List all agent configs
agentteams agent-config list
agentteams agent-config list --format text

# Get specific agent config
agentteams agent-config get --id <config-id>

# Delete agent config
agentteams agent-config delete --id <config-id>
```

### `status`

Manage agent status reports.

```bash
# Report agent status
agentteams status report \
  --agent-name "my-agent" \
  --status "IN_PROGRESS" \
  --project-id 1

# List all statuses
agentteams status list
agentteams status list --format text

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
# List all tasks
agentteams task list
agentteams task list --format text

# Get task by ID
agentteams task get --id 1

# Create task
agentteams task create \
  --title "Implement feature X" \
  --description "Details here" \
  --status "PENDING" \
  --priority "HIGH" \
  --plan-id 1

# Update task
agentteams task update \
  --id 1 \
  --status "IN_PROGRESS"

# Assign task to agent
agentteams task assign --id 1 --agent "agent-name"

# Delete task
agentteams task delete --id 1
```

**Task statuses:** `PENDING`, `IN_PROGRESS`, `DONE`, `CANCELLED`  
**Priorities:** `LOW`, `MEDIUM`, `HIGH`

### `comment`

Manage task comments.

```bash
# Create comment
agentteams comment create \
  --task-id 1 \
  --content "Great work!" \
  --author-id 1
```

### `report`

Create completion reports.

```bash
# Create basic report
agentteams report create \
  --task-id 1 \
  --summary "Task completed successfully" \
  --agent-id 1

# Create report with details
agentteams report create \
  --task-id 1 \
  --summary "Feature implemented" \
  --agent-id 1 \
  --details '{"hours": 2, "files_changed": 5}'
```

### `config`

View current configuration.

```bash
# Show active config
agentteams config whoami
agentteams config whoami --format text
```

Displays merged configuration from all sources (see Configuration Priority below).

## Configuration

### Configuration Priority

The CLI merges configuration from multiple sources with the following priority (highest to lowest):

1. **CLI options** (command-line arguments)
2. **Environment variables** (`AGENTTEAMS_*`)
3. **Project config** (`.agentteams/config.json` in current or parent directory)
4. **Global config** (`~/.agentteams/config.json`)

### Configuration File Structure

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

**Required fields:**
- `teamId`: Team identifier
- `projectId`: Project identifier
- `agentName`: Agent name
- `apiKey`: API authentication key
- `apiUrl`: API server URL

### Environment Variables

Override config file values with environment variables:

```bash
export AGENTTEAMS_API_KEY="key_your_api_key_here"
export AGENTTEAMS_API_URL="http://localhost:3001"
export AGENTTEAMS_TEAM_ID="team_xxx"
export AGENTTEAMS_PROJECT_ID="proj_xxx"
export AGENTTEAMS_AGENT_NAME="my-agent"
```

**Use case:** CI/CD pipelines, temporary overrides, multi-environment setups.

### Project vs Global Config

**Project config** (`.agentteams/config.json`):
- Stored in project directory
- Shared with team (if not gitignored)
- Automatically found by walking up directory tree

**Global config** (`~/.agentteams/config.json`):
- Stored in home directory
- User-specific defaults
- Lowest priority

**Recommendation:** Use project config for team projects, global config for personal defaults.

## Output Formats

All commands support `--format` option:

```bash
# JSON output (default, machine-readable)
agentteams task list --format json

# Text output (human-friendly)
agentteams task list --format text
```

**JSON format:**
- Structured data
- Easy to parse with `jq` or scripts
- Default for most commands

**Text format:**
- Human-readable tables
- Better for terminal viewing
- Formatted with colors (if supported)

## Error Handling

The CLI provides clear error messages:

| Error | Meaning | Solution |
|-------|---------|----------|
| **401 Unauthorized** | Invalid API key | Check `apiKey` in config or `AGENTTEAMS_API_KEY` |
| **403 Forbidden** | Cross-project access denied | Verify `projectId` matches resource |
| **404 Not Found** | Resource doesn't exist | Check ID or create resource first |
| **Network errors** | Can't connect to server | Verify `apiUrl` and server status |
| **Config not found** | No config file or env vars | Run `agentteams init` first |

## .gitignore Setup

**Critical:** Always add `.agentteams` to `.gitignore` to prevent committing API keys:

```gitignore
# AgentTeams CLI config (contains API keys)
.agentteams
```

**What to commit:**
- Convention files (if you want to share them)
- Documentation referencing conventions

**What NOT to commit:**
- `.agentteams/config.json` (contains API keys)
- Any files with sensitive credentials

## Development

### Local Development

```bash
# Clone repository
git clone https://github.com/your-org/agentteams.git
cd agentteams/cli

# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js init

# Link for global testing
npm link
agentteams init
```

### Run Tests

```bash
npm test
```

### Build

```bash
npm run build
```

Output: `dist/` directory with compiled JavaScript.

## Publishing

To publish a new version to npm:

1. **Update version** in package.json:
   ```bash
   npm version patch  # 1.0.0 -> 1.0.1 (bug fixes)
   npm version minor  # 1.0.0 -> 1.1.0 (new features)
   npm version major  # 1.0.0 -> 2.0.0 (breaking changes)
   ```

2. **Publish to npm**:
   ```bash
   npm publish --access public
   ```
   
   Note: `--access public` is required for scoped packages (@agentteams/cli)

3. **Push git tag**:
   ```bash
   git push --follow-tags
   ```

### First-time setup

If publishing for the first time:

```bash
# Login to npm
npm login

# Verify login
npm whoami
```

### Publishing checklist

- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Version updated: `npm version [patch|minor|major]`
- [ ] Publish: `npm publish --access public`
- [ ] Git tag pushed: `git push --follow-tags`

## License

MIT
