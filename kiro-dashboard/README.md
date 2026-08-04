# Kiro Dashboard

A lightweight monitoring dashboard that shows what your AI agents are doing in real time.

## What It Shows

- **Agent Status** — Kiro and groundcrew online/offline/idle indicators
- **Dev Server** — Whether port 3000 is responding
- **Token Usage** — Cumulative tokens consumed per agent
- **Context Usage** — Context window utilization per session (ring charts)
- **Command Queue** — Live view of `.kiro/agent-commands.json` and results
- **Git Activity** — Merged commit timeline from both repos

## Quick Start

```bash
cd kiro-dashboard
npm install
npm start
```

Dashboard runs at **http://localhost:3001** — auto-refreshes every 5 seconds.

## Configuration

Set environment variables before starting:

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_PORT` | `3001` | Port the dashboard runs on |
| `CAREER_TOOLKIT_PATH` | `../career-toolkit` | Path to your career-toolkit repo |
| `GROUNDCREW_PATH` | `../groundcrew` | Path to your groundcrew repo |
| `DEV_SERVER_PORT` | `3000` | Port to check for dev server |

Example:

```bash
CAREER_TOOLKIT_PATH=/Users/jen/projects/career-toolkit npm start
```

## Directory Structure

```
kiro-dashboard/
├── server.js           # Express backend (API endpoints)
├── package.json
├── data/               # Persistent data (auto-created)
│   └── dashboard-data.json
├── public/             # Static frontend (no build step)
│   ├── index.html
│   ├── style.css
│   └── dashboard.js
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Agent status + dev server |
| `/api/git-activity` | GET | Merged git log from both repos |
| `/api/commands` | GET | Command queue + results |
| `/api/tokens` | GET | Token usage per agent |
| `/api/tokens` | POST | Report token usage `{agent, tokens}` |
| `/api/context` | GET | Context usage per session |
| `/api/context` | POST | Report context `{sessionId, agent, contextTokens, maxTokens, description}` |
| `/api/config` | GET | Current dashboard config |

## Reporting Token & Context Usage

Agents can POST usage data to the dashboard:

```bash
# Report token usage
curl -X POST http://localhost:3001/api/tokens \
  -H "Content-Type: application/json" \
  -d '{"agent": "kiro", "tokens": 15000}'

# Report context usage
curl -X POST http://localhost:3001/api/context \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "abc-123", "agent": "kiro", "contextTokens": 45000, "maxTokens": 200000, "description": "Building dashboard feature"}'
```

## How Agent Detection Works

- **Kiro**: Checks modification time of `.kiro/agent-commands.json` and recent git commits with "kiro" as author
- **Groundcrew**: Looks for running process (`pgrep -f groundcrew`) and checks log file recency
- **Dev Server**: Attempts to bind to the configured port — if it fails, something is already listening (server is up)

## Tech Stack

- **Backend**: Node.js + Express (no build step)
- **Frontend**: Vanilla HTML/CSS/JS (no framework, no bundler)
- **Data**: JSON file persistence (no database needed)
- **Refresh**: Frontend polls every 5 seconds

## License

MIT
