# AWS Daily Cost Report - Setup Guide

## Overview
This hook generates a daily HTML report showing AWS service usage and costs for your configured AWS account, sends it via email, and posts a summary to Microsoft Teams.

## Prerequisites

1. **Python 3.8+** with `boto3` installed:
   ```bash
   pip install boto3
   ```

2. **AWS Credentials** configured in `~/.aws/credentials` with access to:
   - `ce:GetCostAndUsage` (Cost Explorer)
   - `sts:GetCallerIdentity`
   - `ses:SendEmail` (if using SES for email)

3. **AWS Cost Explorer** must be enabled in your account (it takes 24h to activate if not already enabled).

## Configuration

### Email (choose one):

**Option A - AWS SES (recommended):**
- Verify sender email in SES: `ashita.avadhani@capgemini.com`
- Ensure SES is out of sandbox mode, or verify recipient too

**Option B - SMTP (Office 365 / Outlook):**
Set these environment variables:
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@capgemini.com
SMTP_PASS=your-app-password
```

### Microsoft Teams Integration:
1. In Teams, go to the channel where you want notifications
2. Click ⋯ → Connectors → Incoming Webhook → Configure
3. Name it "AWS Cost Monitor", copy the webhook URL
4. Set the environment variable:
   ```
   TEAMS_WEBHOOK_URL=https://your-org.webhook.office.com/webhookb2/...
   ```

## Usage

### Manual trigger (via Kiro hook):
- Open the **Agent Hooks** panel in Kiro
- Click the "Daily AWS Cost Report" hook to trigger it

### Command line:
```bash
python scripts/aws-daily-cost-report.py
```

### Schedule daily (Windows Task Scheduler):
```cmd
schtasks /create /tn "AWS Daily Cost Report" /tr "python c:\August-Kiro-PoC-Automation\scripts\aws-daily-cost-report.py" /sc daily /st 09:00
```

## Output
- HTML report saved to `reports/aws-cost-report-YYYY-MM-DD.html`
- Email sent to ashita.avadhani@capgemini.com
- Teams adaptive card posted to configured channel

## IAM Policy Required
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "sts:GetCallerIdentity",
        "ses:SendEmail"
      ],
      "Resource": "*"
    }
  ]
}
```
