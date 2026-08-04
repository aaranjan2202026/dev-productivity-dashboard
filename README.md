# Kiro Developer Metrics & Productivity Template

A ready-to-use Kiro IDE workspace template that provides automated developer productivity tracking, AWS cost monitoring, and team notifications — all powered by Kiro hooks, steering files, and GitHub/AWS integrations.

## What's Included

### 📊 Productivity Metrics Dashboard
Track developer activity across GitHub repositories:
- Number of commits
- Lines of code (additions/deletions)
- Open & Merged Pull Requests
- Open & Closed Issues
- Issue Cycle Time (avg days to close)
- Code Review Time (avg hours to merge)

### ☁️ AWS Daily Cost & Usage Report
- Enumerates active AWS services (EC2, S3, Lambda, RDS, ECS, SNS, SQS, DynamoDB, CloudWatch, CloudFormation)
- Generates styled HTML reports with cost breakdowns
- Falls back to service enumeration if Cost Explorer access is denied

### 💬 Notifications
- **Microsoft Teams** — Adaptive Card summaries posted via Incoming Webhook
- **Email** — HTML reports via AWS SES or SMTP (Office 365)

### 🤖 Kiro Agent Monitoring (kiro-dashboard)
- Real-time agent status, token usage, context usage
- Command queue monitoring
- Recent git activity

---

## Quick Start

### 1. Clone this template
```bash
git clone https://github.com/YOUR-ORG/kiro-developer-metrics-template.git my-project
cd my-project
rm -rf .git
git init
git add .
git commit -m "feat: initialize project with Kiro metrics template"
```

### 2. Set environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PERSONAL_GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `TEAMS_WEBHOOK_URL` | Yes | Microsoft Teams Incoming Webhook URL |
| `SMTP_USER` | Optional | SMTP username for email delivery |
| `SMTP_PASS` | Optional | SMTP password/app password |
| `SMTP_HOST` | Optional | SMTP server (default: smtp.office365.com) |
| `SMTP_PORT` | Optional | SMTP port (default: 587) |

**Windows:**
```cmd
setx PERSONAL_GITHUB_TOKEN "ghp_your_token_here"
setx TEAMS_WEBHOOK_URL "https://your-org.webhook.office.com/..."
```

**Linux/Mac:**
```bash
export PERSONAL_GITHUB_TOKEN="ghp_your_token_here"
export TEAMS_WEBHOOK_URL="https://your-org.webhook.office.com/..."
```

### 3. Add repositories to track
```bash
python scripts/github-productivity-metrics.py --add
# or add all repos for a user:
python scripts/github-productivity-metrics.py --add-all your-github-username
```

### 4. Run metrics
```bash
python scripts/github-productivity-metrics.py
```

### 5. Run AWS cost report
```bash
python scripts/aws-daily-cost-report.py
```

### 6. Start the Kiro agent dashboard
```bash
cd kiro-dashboard
npm install
npm start
# Dashboard at http://localhost:3001
```

---

## Project Structure

```
.
├── .kiro/
│   ├── hooks/                          # Kiro agent hooks
│   │   ├── daily-aws-cost-report.kiro.hook
│   │   ├── github-productivity-metrics.kiro.hook
│   │   ├── lint-and-format-on-save.kiro.hook
│   │   ├── security-scan-on-dependency-change.kiro.hook
│   │   └── ... (17 hooks total)
│   ├── steering/                       # Kiro steering files (best practices)
│   │   ├── development-standards.md
│   │   ├── typescript-best-practices.md
│   │   ├── git-best-practices.md
│   │   ├── security-best-practices.md
│   │   └── ... (11 steering files)
│   └── settings/
│       └── mcp.json                    # MCP server configuration
├── scripts/
│   ├── aws-daily-cost-report.py        # AWS cost/usage report generator
│   ├── github-productivity-metrics.py  # GitHub metrics collector + dashboard
│   └── README-cost-report.md           # Setup guide for AWS report
├── config/
│   └── metrics-targets.json            # Tracked GitHub repos (auto-managed)
├── kiro-dashboard/                     # Real-time Kiro agent monitoring dashboard
├── reports/                            # Generated HTML/JSON reports
├── setup.ps1                           # Windows setup script
├── setup.sh                            # Linux/Mac setup script
└── README.md                           # This file
```

---

## Kiro Hooks

| Hook | Trigger | Action |
|------|---------|--------|
| Daily AWS Cost Report | User-triggered | Generates cost report, sends email + Teams |
| GitHub Productivity Metrics | User-triggered | Collects GitHub metrics, generates dashboard |
| Lint & Format on Save | File edited (*.ts, *.tsx) | Runs linter |
| Security Scan | Dependency change | Scans for vulnerabilities |
| Auto Test on Save | File edited | Runs tests |
| CDK Synth on Change | File edited | Synthesizes CloudFormation |
| + 11 more hooks | Various | Various automation |

---

## CLI Reference

### GitHub Productivity Metrics

```bash
# Interactive mode (menu-driven)
python scripts/github-productivity-metrics.py --interactive

# Add a repo (shows list to pick from)
python scripts/github-productivity-metrics.py --add

# Add all repos for a user
python scripts/github-productivity-metrics.py --add-all <username>

# Run for specific user/repo
python scripts/github-productivity-metrics.py --user <username> --repo <repo>

# Customize time window
python scripts/github-productivity-metrics.py --weeks 8

# List tracked repos
python scripts/github-productivity-metrics.py --list

# Run for all saved repos
python scripts/github-productivity-metrics.py
```

### AWS Cost Report

```bash
python scripts/aws-daily-cost-report.py
```

### Schedule Daily (Windows)

```cmd
schtasks /create /tn "AWS Daily Cost Report" /tr "python c:\path\to\scripts\aws-daily-cost-report.py" /sc daily /st 09:00
schtasks /create /tn "GitHub Metrics Weekly" /tr "python c:\path\to\scripts\github-productivity-metrics.py" /sc weekly /d MON /st 09:00
```

---

## Prerequisites

- **Python 3.8+** with: `pip install boto3 flask pymongo PyGithub matplotlib reportlab pytz`
- **Node.js 16+** (for kiro-dashboard): `npm install`
- **AWS CLI** configured (`~/.aws/credentials`)
- **Kiro IDE** (for hooks and steering)

---

## For Teams / Multi-Developer Setup

1. Fork this template repo
2. Each developer clones and sets their own env variables
3. Customize `config/metrics-targets.json` per team
4. Steering files automatically apply to all developers using the workspace
5. Hooks trigger consistently across the team

---

## AWS IAM Permissions Required

For full cost reporting, the IAM user needs:
```json
{
  "Effect": "Allow",
  "Action": [
    "ce:GetCostAndUsage",
    "sts:GetCallerIdentity",
    "ses:SendEmail",
    "ec2:DescribeInstances",
    "s3:ListAllMyBuckets",
    "lambda:ListFunctions",
    "rds:DescribeDBInstances",
    "dynamodb:ListTables",
    "cloudformation:ListStacks",
    "ecs:ListClusters",
    "sns:ListTopics",
    "sqs:ListQueues",
    "cloudwatch:DescribeAlarms"
  ],
  "Resource": "*"
}
```

---

## License

MIT

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/new-metric`)
3. Commit changes (`git commit -m "feat: add new metric"`)
4. Push and create a PR
