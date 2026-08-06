# Productivity Metrics Workflow

## Starting the Dashboard
Start the real-time dashboard that shows all metrics at http://localhost:3001:
```bash
cd kiro-dashboard && node server.js
```

## Adding Repositories to Track
Use the interactive CLI to add repos:
```bash
# Interactive mode (menu-driven)
python scripts/github-productivity-metrics.py --interactive

# Add a specific repo
python scripts/github-productivity-metrics.py --add

# Add all repos for a GitHub user
python scripts/github-productivity-metrics.py --add-all <username>

# List currently tracked repos
python scripts/github-productivity-metrics.py --list
```

## Running Metrics
```bash
# Run for all saved repos
python scripts/github-productivity-metrics.py

# Run for specific user/repo with custom time window
python scripts/github-productivity-metrics.py --user <username> --repo <repo> --weeks 4
```

## Metrics Tracked
| Metric | Source | Signal |
|--------|--------|--------|
| Commits | GitHub API | Developer activity |
| Lines of Code | Git diff stats | Throughput |
| Open PRs | GitHub API | Work in progress |
| Merged PRs | GitHub API | Delivery |
| Open Issues | GitHub API | Backlog |
| Closed Issues | GitHub API | Resolution |
| Issue Cycle Time | Issue open→close | Efficiency |
| Code Review Time | PR open→merge | Collaboration |

## Output
- HTML dashboard: `reports/productivity-metrics-YYYY-MM-DD.html`
- JSON data: `reports/productivity-metrics-YYYY-MM-DD.json`
- Localhost panel: http://localhost:3001 (Developer Productivity Metrics section)

## Configuration
Repos are stored in `config/metrics-targets.json`. This file is auto-managed by the CLI.
