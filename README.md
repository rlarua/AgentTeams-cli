# @agentteams/cli

CLI tool for AgentTeams API

## Installation

```bash
cd cli
npm install
npm run build
```

## Configuration

Set the following environment variables:

```bash
export AGENTTEAMS_API_KEY="key_your_api_key_here"
export AGENTTEAMS_API_URL="http://localhost:3001"
```

## Usage

### Status Commands

Report agent status:
```bash
agentteams status report --agent-name "my-agent" --status "ACTIVE" --project-id 1
```

List agent statuses:
```bash
agentteams status list
agentteams status list --format text
```

### Task Commands

List tasks:
```bash
agentteams task list
agentteams task list --format text
```

Get task by ID:
```bash
agentteams task get --id 1
agentteams task get --id 1 --format text
```

### Comment Commands

Create task comment:
```bash
agentteams comment create --task-id 1 --content "Great work!" --author-id 1
```

### Report Commands

Create completion report:
```bash
agentteams report create --task-id 1 --summary "Task completed" --agent-id 1
agentteams report create --task-id 1 --summary "Task completed" --agent-id 1 --details '{"hours": 2}'
```

### Convention Commands

List conventions:
```bash
agentteams convention list
agentteams convention list --format text
```

### Config Commands

Show current configuration:
```bash
agentteams config whoami
```

## Output Formats

- `--format json` (default): JSON output
- `--format text`: Human-friendly text output

## Error Handling

The CLI provides clear error messages for common issues:

- **401 Unauthorized**: Invalid API key
- **403 Forbidden**: Cross-project access denied
- **404 Not Found**: Resource not found
- **Network errors**: Cannot connect to server

## Development

Run tests:
```bash
npm test
```

Build:
```bash
npm run build
```

## License

MIT
