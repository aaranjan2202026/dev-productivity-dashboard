# AWS Cost Reporting Workflow

## Running the Cost Report
```bash
python scripts/aws-daily-cost-report.py
```

## What It Does
1. Fetches AWS account identity via STS
2. Calls Cost Explorer for daily cost breakdown by service (falls back to service enumeration if denied)
3. Generates a styled HTML report with color-coded costs
4. Sends email via AWS SES (or SMTP fallback)
5. Posts an Adaptive Card summary to Microsoft Teams

## Prerequisites
- AWS credentials configured (`~/.aws/credentials`)
- `TEAMS_WEBHOOK_URL` environment variable set
- For cost data: `ce:GetCostAndUsage` IAM permission
- For email: `ses:SendEmail` IAM permission OR SMTP credentials

## Teams Integration
The report posts an Adaptive Card to your Teams channel showing:
- Account ID and period
- Total daily cost
- Number of active services
- Top 5 services by cost

## Scheduling Daily
Windows Task Scheduler:
```cmd
schtasks /create /tn "AWS Daily Cost Report" /tr "python scripts/aws-daily-cost-report.py" /sc daily /st 09:00
```

Linux/Mac cron:
```bash
0 9 * * * cd /path/to/workspace && python scripts/aws-daily-cost-report.py
```

## Output
- HTML report: `reports/aws-cost-report-YYYY-MM-DD.html`
- Teams notification: posted to configured webhook channel
- Email: sent to configured recipient

## Fallback Mode
When `ce:GetCostAndUsage` is denied, the script enumerates active services:
- EC2 instances, S3 buckets, Lambda functions
- RDS instances, DynamoDB tables, CloudFormation stacks
- ECS clusters, SNS topics, SQS queues, CloudWatch alarms
