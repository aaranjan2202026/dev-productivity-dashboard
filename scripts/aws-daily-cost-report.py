"""
AWS Daily Cost & Usage Report
Generates an HTML report of AWS service usage and costs,
sends it via email and posts a summary to Microsoft Teams.
"""

import boto3
import json
import smtplib
import urllib.request
import os
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


# Configuration
EMAIL_RECIPIENT = "ashita.avadhani@capgemini.com"
TEAMS_WEBHOOK_URL = os.environ.get("TEAMS_WEBHOOK_URL", "")
REPORT_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "reports")


def get_cost_data() -> dict:
    """Fetch cost and usage data from AWS Cost Explorer.
    Falls back to service enumeration if Cost Explorer access is denied.
    """
    now = datetime.now(timezone.utc)
    end_date = now.strftime("%Y-%m-%d")
    start_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    try:
        client = boto3.client("ce", region_name="us-east-1")
        response = client.get_cost_and_usage(
            TimePeriod={"Start": start_date, "End": end_date},
            Granularity="DAILY",
            Metrics=["UnblendedCost", "UsageQuantity"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        return response
    except Exception as e:
        print(f"  Cost Explorer access denied: {e}")
        print("  Falling back to service usage enumeration...")
        return get_usage_fallback()


def get_usage_fallback() -> dict:
    """Enumerate active AWS services when Cost Explorer is not accessible."""
    now = datetime.now(timezone.utc)
    end_date = now.strftime("%Y-%m-%d")
    start_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    services_found = []

    # Check EC2 instances
    try:
        ec2 = boto3.client("ec2")
        instances = ec2.describe_instances()
        count = sum(len(r["Instances"]) for r in instances["Reservations"])
        if count > 0:
            services_found.append({"name": "Amazon EC2", "usage": float(count), "note": f"{count} instances"})
    except Exception:
        pass

    # Check S3 buckets
    try:
        s3 = boto3.client("s3")
        buckets = s3.list_buckets()
        count = len(buckets.get("Buckets", []))
        if count > 0:
            services_found.append({"name": "Amazon S3", "usage": float(count), "note": f"{count} buckets"})
    except Exception:
        pass

    # Check Lambda functions
    try:
        lam = boto3.client("lambda")
        functions = lam.list_functions()
        count = len(functions.get("Functions", []))
        if count > 0:
            services_found.append({"name": "AWS Lambda", "usage": float(count), "note": f"{count} functions"})
    except Exception:
        pass

    # Check RDS instances
    try:
        rds = boto3.client("rds")
        dbs = rds.describe_db_instances()
        count = len(dbs.get("DBInstances", []))
        if count > 0:
            services_found.append({"name": "Amazon RDS", "usage": float(count), "note": f"{count} instances"})
    except Exception:
        pass

    # Check DynamoDB tables
    try:
        ddb = boto3.client("dynamodb")
        tables = ddb.list_tables()
        count = len(tables.get("TableNames", []))
        if count > 0:
            services_found.append({"name": "Amazon DynamoDB", "usage": float(count), "note": f"{count} tables"})
    except Exception:
        pass

    # Check CloudFormation stacks
    try:
        cfn = boto3.client("cloudformation")
        stacks = cfn.list_stacks(StackStatusFilter=["CREATE_COMPLETE", "UPDATE_COMPLETE"])
        count = len(stacks.get("StackSummaries", []))
        if count > 0:
            services_found.append({"name": "AWS CloudFormation", "usage": float(count), "note": f"{count} stacks"})
    except Exception:
        pass

    # Check ECS clusters
    try:
        ecs = boto3.client("ecs")
        clusters = ecs.list_clusters()
        count = len(clusters.get("clusterArns", []))
        if count > 0:
            services_found.append({"name": "Amazon ECS", "usage": float(count), "note": f"{count} clusters"})
    except Exception:
        pass

    # Check SNS topics
    try:
        sns = boto3.client("sns")
        topics = sns.list_topics()
        count = len(topics.get("Topics", []))
        if count > 0:
            services_found.append({"name": "Amazon SNS", "usage": float(count), "note": f"{count} topics"})
    except Exception:
        pass

    # Check SQS queues
    try:
        sqs = boto3.client("sqs")
        queues = sqs.list_queues()
        count = len(queues.get("QueueUrls", []))
        if count > 0:
            services_found.append({"name": "Amazon SQS", "usage": float(count), "note": f"{count} queues"})
    except Exception:
        pass

    # Check CloudWatch alarms
    try:
        cw = boto3.client("cloudwatch")
        alarms = cw.describe_alarms()
        count = len(alarms.get("MetricAlarms", []))
        if count > 0:
            services_found.append({"name": "Amazon CloudWatch", "usage": float(count), "note": f"{count} alarms"})
    except Exception:
        pass

    # Build Cost Explorer-like response structure
    groups = []
    for svc in services_found:
        groups.append({
            "Keys": [svc["name"]],
            "Metrics": {
                "UnblendedCost": {"Amount": "0.0000", "Unit": "USD"},
                "UsageQuantity": {"Amount": str(svc["usage"]), "Unit": "N/A"},
            },
            "Note": svc.get("note", ""),
        })

    return {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": start_date, "End": end_date},
                "Groups": groups,
            }
        ],
        "fallback_mode": True,
    }


def get_account_info() -> dict:
    """Get current AWS account details."""
    sts = boto3.client("sts")
    identity = sts.get_caller_identity()
    return {
        "account_id": identity["Account"],
        "arn": identity["Arn"],
    }


def build_html_report(cost_data: dict, account_info: dict) -> str:
    """Generate an HTML report from cost data."""
    now = datetime.now(timezone.utc)
    end_date = now.strftime("%Y-%m-%d")
    start_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    is_fallback = cost_data.get("fallback_mode", False)

    services = []
    total_cost = 0.0

    for result in cost_data.get("ResultsByTime", []):
        for group in result.get("Groups", []):
            service_name = group["Keys"][0]
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
            usage = float(group["Metrics"]["UsageQuantity"]["Amount"])
            unit = group["Metrics"]["UnblendedCost"]["Unit"]
            note = group.get("Note", "")

            if cost > 0.0 or usage > 0.0:
                services.append({
                    "name": service_name,
                    "cost": cost,
                    "usage": usage,
                    "unit": unit,
                    "note": note,
                })
                total_cost += cost

    services.sort(key=lambda x: x["cost"], reverse=True)

    rows_html = ""
    for svc in services:
        cost_color = "#dc3545" if svc["cost"] > 10 else "#28a745" if svc["cost"] < 1 else "#fd7e14"
        note_html = f"<br><small style='color:#666'>{svc['note']}</small>" if svc.get("note") else ""
        cost_display = f"${svc['cost']:.4f} {svc['unit']}" if not is_fallback else "<em>N/A (no ce:GetCostAndUsage access)</em>"
        rows_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eee;">{svc['name']}{note_html}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: {cost_color}; font-weight: bold;">
                {cost_display}
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
                {svc['usage']:.2f}
            </td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>AWS Daily Cost Report - {end_date}</title>
</head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
    <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #232f3e 0%, #ff9900 100%); padding: 30px; color: white;">
            <h1 style="margin: 0; font-size: 24px;">&#9729; AWS Daily Cost &amp; Usage Report</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Period: {start_date} to {end_date}</p>
        </div>

        <!-- Account Info -->
        <div style="padding: 20px; background: #f8f9fa; border-bottom: 1px solid #eee;">
            <table style="width: 100%;">
                <tr>
                    <td><strong>Account ID:</strong> {account_info['account_id']}</td>
                    <td style="text-align: right;"><strong>Generated:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</td>
                </tr>
            </table>
        </div>

        <!-- Summary -->
        <div style="padding: 20px; text-align: center; border-bottom: 1px solid #eee;">
            <div style="display: inline-block; padding: 15px 30px; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107;">
                <span style="font-size: 14px; color: #856404;">Total Daily Cost</span><br>
                <span style="font-size: 32px; font-weight: bold; color: #232f3e;">${total_cost:.4f}</span>
            </div>
            <div style="display: inline-block; padding: 15px 30px; margin-left: 20px; background: #d4edda; border-radius: 8px; border: 1px solid #28a745;">
                <span style="font-size: 14px; color: #155724;">Active Services</span><br>
                <span style="font-size: 32px; font-weight: bold; color: #232f3e;">{len(services)}</span>
            </div>
        </div>

        <!-- Cost Table -->
        <div style="padding: 20px;">
            <h2 style="color: #232f3e; margin-top: 0;">Service Breakdown</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #232f3e; color: white;">
                        <th style="padding: 12px; text-align: left;">Service</th>
                        <th style="padding: 12px; text-align: right;">Cost</th>
                        <th style="padding: 12px; text-align: right;">Usage Qty</th>
                    </tr>
                </thead>
                <tbody>
                    {rows_html}
                </tbody>
                <tfoot>
                    <tr style="background: #f8f9fa; font-weight: bold;">
                        <td style="padding: 12px;">TOTAL</td>
                        <td style="padding: 12px; text-align: right;">${total_cost:.4f}</td>
                        <td style="padding: 12px; text-align: right;">-</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Footer -->
        <div style="padding: 20px; background: #232f3e; color: #adb5bd; text-align: center; font-size: 12px;">
            <p>This report was generated automatically by Kiro IDE AWS Cost Monitor Hook</p>
            <p>Data source: AWS Cost Explorer API | Account: {account_info['account_id']}</p>
        </div>
    </div>
</body>
</html>"""

    return html


def save_report(html: str) -> str:
    """Save HTML report to file."""
    os.makedirs(REPORT_OUTPUT_PATH, exist_ok=True)
    filename = f"aws-cost-report-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.html"
    filepath = os.path.join(REPORT_OUTPUT_PATH, filename)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Report saved to: {filepath}")
    return filepath


def send_email_ses(html: str, subject: str) -> None:
    """Send HTML report via AWS SES."""
    ses = boto3.client("ses", region_name="us-east-1")

    ses.send_email(
        Source=EMAIL_RECIPIENT,  # Must be verified in SES
        Destination={"ToAddresses": [EMAIL_RECIPIENT]},
        Message={
            "Subject": {"Data": subject},
            "Body": {"Html": {"Data": html}},
        },
    )
    print(f"Email sent to {EMAIL_RECIPIENT} via SES")


def send_email_smtp(html: str, subject: str) -> None:
    """Send HTML report via SMTP (fallback if SES not configured)."""
    smtp_host = os.environ.get("SMTP_HOST", "smtp.office365.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        print("SMTP credentials not configured. Skipping email via SMTP.")
        print("Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables.")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = EMAIL_RECIPIENT
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, EMAIL_RECIPIENT, msg.as_string())

    print(f"Email sent to {EMAIL_RECIPIENT} via SMTP")


def send_teams_message(cost_data: dict, account_info: dict, report_path: str) -> None:
    """Post a summary card to Microsoft Teams via Incoming Webhook."""
    if not TEAMS_WEBHOOK_URL:
        print("TEAMS_WEBHOOK_URL not set. Skipping Teams notification.")
        print("Set TEAMS_WEBHOOK_URL environment variable with your Teams Incoming Webhook URL.")
        return

    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    total_cost = 0.0
    top_services = []

    for result in cost_data.get("ResultsByTime", []):
        for group in result.get("Groups", []):
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
            if cost > 0:
                total_cost += cost
                top_services.append({
                    "name": group["Keys"][0],
                    "cost": cost,
                })

    top_services.sort(key=lambda x: x["cost"], reverse=True)
    top_5 = top_services[:5]

    facts = [{"name": svc["name"], "value": f"${svc['cost']:.4f}"} for svc in top_5]

    # Adaptive Card payload for Teams
    card_payload = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        {
                            "type": "TextBlock",
                            "size": "Large",
                            "weight": "Bolder",
                            "text": f"☁️ AWS Daily Cost Report - {end_date}",
                            "wrap": True,
                        },
                        {
                            "type": "FactSet",
                            "facts": [
                                {"title": "Account", "value": account_info["account_id"]},
                                {"title": "Period", "value": f"{start_date} → {end_date}"},
                                {"title": "Total Cost", "value": f"${total_cost:.4f}"},
                                {"title": "Active Services", "value": str(len(top_services))},
                            ],
                        },
                        {
                            "type": "TextBlock",
                            "text": "**Top 5 Services by Cost:**",
                            "wrap": True,
                            "spacing": "Medium",
                        },
                        {
                            "type": "FactSet",
                            "facts": facts,
                        },
                    ],
                },
            }
        ],
    }

    data = json.dumps(card_payload).encode("utf-8")
    req = urllib.request.Request(
        TEAMS_WEBHOOK_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        print(f"Teams message sent. Status: {resp.status}")


def main() -> None:
    """Main entry point."""
    print("=" * 60)
    print("AWS Daily Cost & Usage Report Generator")
    print("=" * 60)

    # 1. Get account info
    print("\n[1/5] Fetching account info...")
    account_info = get_account_info()
    print(f"  Account: {account_info['account_id']}")

    # 2. Get cost data
    print("\n[2/5] Fetching cost data from AWS Cost Explorer...")
    cost_data = get_cost_data()

    # 3. Build HTML report
    print("\n[3/5] Generating HTML report...")
    html_report = build_html_report(cost_data, account_info)

    # 4. Save report
    print("\n[4/5] Saving report...")
    report_path = save_report(html_report)

    # 5. Send notifications
    print("\n[5/5] Sending notifications...")
    subject = f"AWS Daily Cost Report - {datetime.now(timezone.utc).strftime('%Y-%m-%d')} | Account: {account_info['account_id']}"

    # Try SES first, fall back to SMTP
    try:
        send_email_ses(html_report, subject)
    except Exception as e:
        print(f"  SES failed ({e}), trying SMTP...")
        send_email_smtp(html_report, subject)

    # Send Teams notification
    send_teams_message(cost_data, account_info, report_path)

    print("\n" + "=" * 60)
    print("Done! Report generated and notifications sent.")
    print("=" * 60)


if __name__ == "__main__":
    main()
