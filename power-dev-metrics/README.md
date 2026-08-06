# Kiro Power: Developer Productivity & Cost Metrics

A custom Kiro Power that provides developer productivity tracking, AWS cost monitoring, GenAI activity scoring, and CI/CD operations metrics — all auto-derived from git history and Kiro usage.

## Installation

### From GitHub
1. Open Kiro IDE → Powers panel → **Add Custom Power**
2. Select **Import power from GitHub**
3. Enter: `https://github.com/aaranjan2202026/dev-productivity-dashboard`
4. Select the `power-dev-metrics` folder

### From Local Folder
1. Open Kiro IDE → Powers panel → **Add Custom Power**
2. Select **Import power from a folder**
3. Navigate to the `power-dev-metrics/` directory

## MCP Tools Available

| Tool | Description |
|------|-------------|
| `get_productivity_metrics` | Fetch GitHub metrics (commits, LOC, PRs, issues, cycle time, review time) |
| `add_repository` | Add a GitHub repo to track |
| `list_tracked_repos` | List all tracked repositories |
| `get_aws_costs` | Generate AWS cost & usage report |
| `get_genai_activity` | Get auto-derived GenAI developer activity scores |
| `get_cicd_metrics` | Get auto-derived CI/CD & operations scores |
| `start_dashboard` | Start the real-time dashboard at localhost:3001 |
| `generate_report` | Generate full HTML report |

## Usage in Kiro Chat

Just mention keywords like "metrics", "productivity", "dashboard", "costs", or "ci/cd" and the power activates automatically. Examples:

- "Show me my productivity metrics"
- "What's my AWS cost today?"
- "Start the dashboard"
- "Add repo aaranjan2202026/my-project to tracking"
- "What are my GenAI activity scores?"
- "Show CI/CD operations metrics"

## Requirements

- Node.js 16+
- Python 3.8+ with boto3, PyGithub
- `PERSONAL_GITHUB_TOKEN` environment variable
- `TEAMS_WEBHOOK_URL` environment variable (for Teams notifications)
- AWS credentials (for cost reports)

## License

MIT
