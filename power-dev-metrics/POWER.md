---
name: "dev-metrics"
displayName: "Developer Productivity & Cost Metrics"
description: "Track developer productivity, AWS costs, GenAI activity, and CI/CD operations with auto-derived metrics from git history and Kiro usage"
keywords: ["metrics", "productivity", "dashboard", "costs", "commits", "pull requests", "cycle time", "code review", "genai", "ci/cd", "developer activity", "throughput", "sprint"]
author: "aaranjan2202026"
---

# Onboarding

## Step 1: Validate tools
Before using this power, ensure the following are installed:
- **Node.js 16+**: Verify with `node --version`
- **Python 3.8+**: Verify with `python --version`
- **boto3**: `pip install boto3`
- **PyGithub**: `pip install PyGithub`

## Step 2: Set environment variables
Set these environment variables for full functionality:

**Required:**
- `PERSONAL_GITHUB_TOKEN` — GitHub Personal Access Token with `repo` scope
- `TEAMS_WEBHOOK_URL` — Microsoft Teams Incoming Webhook URL

**Optional (for AWS cost reports):**
- AWS credentials configured in `~/.aws/credentials`
- `SMTP_USER` / `SMTP_PASS` — for email delivery via Office 365

## Step 3: Add hooks
Create the following hooks to enable automatic tracking:

`.kiro/hooks/track-token-usage.kiro.hook`:
```json
{
  "name": "Track Token Usage",
  "version": "1.0.0",
  "description": "Reports token usage to the dev metrics dashboard after each agent interaction",
  "when": { "type": "agentStop" },
  "then": {
    "type": "runCommand",
    "command": "curl -s -X POST http://localhost:3001/api/tokens -H \"Content-Type: application/json\" -d \"{\\\"agent\\\":\\\"kiro\\\",\\\"tokens\\\":1000}\" >nul 2>&1"
  }
}
```

`.kiro/hooks/daily-aws-cost-report.kiro.hook`:
```json
{
  "name": "Daily AWS Cost Report",
  "version": "1.0.0",
  "description": "Generates AWS cost report, sends email and Teams notification",
  "when": { "type": "userTriggered" },
  "then": {
    "type": "runCommand",
    "command": "python scripts/aws-daily-cost-report.py"
  }
}
```

`.kiro/hooks/github-productivity-metrics.kiro.hook`:
```json
{
  "name": "GitHub Productivity Metrics",
  "version": "1.0.0",
  "description": "Generates developer productivity metrics dashboard from GitHub",
  "when": { "type": "userTriggered" },
  "then": {
    "type": "runCommand",
    "command": "python scripts/github-productivity-metrics.py"
  }
}
```

# Workflows

Use these steering files for specific workflows:
- Viewing productivity metrics or adding repos → `productivity-workflow.md`
- Generating AWS cost reports or sending to Teams → `cost-reporting.md`
- Viewing CI/CD & GenAI activity metrics → `cicd-operations.md`

# Capabilities

## Developer Productivity Metrics
Tracks from GitHub:
- Number of commits
- Lines of code (additions/deletions)
- Open & Merged Pull Requests
- Open & Closed Issues
- Issue Cycle Time (avg days to close)
- Code Review Time (avg hours to merge)

## GenAI Developer Activity (auto-derived)
- Development Cycle Time — from git commit frequency
- Code Generation Support — from Kiro token & session tracking
- Throughput per Sprint — from git repo analytics
- Boilerplate Effort Reduction — from file creation patterns

## CI/CD & Operations (auto-derived)
- CI/CD Config Generation — from pipeline/IaC/script files created
- Deployment Readiness Time — from commit velocity analytics
- Incident Resolution Support — from fix commits + Kiro token correlation
- Ops Runbook Coverage — from steering/hook/doc file tracking

## AWS Cost & Usage Report
- Service enumeration (EC2, S3, Lambda, RDS, ECS, SNS, SQS, DynamoDB)
- HTML report generation
- Microsoft Teams adaptive card notifications
- Email via AWS SES or SMTP

## Real-time Dashboard (localhost:3001)
- Agent status monitoring
- Token & context usage tracking
- Command queue
- Git activity feed
- All metrics panels in one view
