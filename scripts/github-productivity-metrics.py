"""
GitHub Developer Productivity Metrics
Tracks: Commits, Lines of Code, Open/Merged PRs, Open/Closed Issues,
Issue Cycle Time, and Code Review Time.

Works standalone without MongoDB — fetches directly from GitHub API.
Generates an HTML dashboard report.
"""

import os
import json
import pytz
from datetime import datetime, timedelta, timezone
from github import Github
from pathlib import Path


# Configuration
GITHUB_TOKEN = os.environ.get("PERSONAL_GITHUB_TOKEN", os.environ.get("GITHUB_TOKEN", ""))
REPORT_OUTPUT_PATH = Path(__file__).parent.parent / "reports"
DEFAULT_WEEKS_BACK = 4  # Collect metrics for the past 4 weeks


def get_github_client() -> Github:
    """Initialize GitHub client with or without token."""
    if GITHUB_TOKEN:
        return Github(GITHUB_TOKEN)
    print("  WARNING: No GITHUB_TOKEN set. API rate limits will be strict (60 req/hr).")
    print("  Set PERSONAL_GITHUB_TOKEN or GITHUB_TOKEN environment variable.")
    return Github()


def collect_metrics(username: str, repository: str, weeks_back: int = DEFAULT_WEEKS_BACK) -> dict:
    """Collect all productivity metrics for a developer."""
    now = datetime.now(timezone.utc)
    end_date = now
    start_date = now - timedelta(weeks=weeks_back)

    print(f"\n  Collecting metrics for {username}/{repository}")
    print(f"  Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

    g = get_github_client()

    try:
        repo = g.get_repo(f"{username}/{repository}")
    except Exception as e:
        print(f"  ERROR: {e}")
        return {"error": str(e), "username": username, "repository": repository}

    metrics = {
        "username": username,
        "repository": repository,
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
        "generated_at": now.strftime("%Y-%m-%d %H:%M UTC"),
    }

    # 1. Commits (all authors in the repo for the period)
    print("    - Counting commits...")
    try:
        commits = repo.get_commits(since=start_date, until=end_date)
        metrics["commits"] = commits.totalCount
    except Exception as e:
        print(f"      Error: {e}")
        metrics["commits"] = 0

    # 2. Lines of code (additions + deletions from recent commits)
    print("    - Calculating lines of code...")
    try:
        lines_added = 0
        lines_deleted = 0
        commit_list = repo.get_commits(since=start_date, until=end_date)
        count = 0
        for commit in commit_list:
            if count >= 50:  # Limit to avoid rate limits
                break
            stats = commit.stats
            if stats:
                lines_added += stats.additions
                lines_deleted += stats.deletions
            count += 1
        metrics["lines_added"] = lines_added
        metrics["lines_deleted"] = lines_deleted
        metrics["lines_of_code"] = lines_added + lines_deleted
    except Exception as e:
        print(f"      Error: {e}")
        metrics["lines_added"] = 0
        metrics["lines_deleted"] = 0
        metrics["lines_of_code"] = 0

    # 3. Pull Requests
    print("    - Counting pull requests...")
    try:
        all_prs = repo.get_pulls(state="all", sort="updated")
        open_prs = 0
        merged_prs = 0
        for pr in all_prs:
            if pr.created_at.replace(tzinfo=pytz.UTC) < start_date:
                break
            if pr.merged:
                merged_prs += 1
            elif pr.state == "open":
                open_prs += 1
        metrics["open_prs"] = open_prs
        metrics["merged_prs"] = merged_prs
    except Exception as e:
        print(f"      Error: {e}")
        metrics["open_prs"] = 0
        metrics["merged_prs"] = 0

    # 4. Issues
    print("    - Counting issues...")
    try:
        issues = repo.get_issues(state="all", since=start_date)
        open_issues = 0
        closed_issues = 0
        for issue in issues:
            if issue.pull_request:
                continue  # Skip PRs that show as issues
            if issue.state == "open":
                open_issues += 1
            else:
                closed_issues += 1
        metrics["open_issues"] = open_issues
        metrics["closed_issues"] = closed_issues
    except Exception as e:
        print(f"      Error: {e}")
        metrics["open_issues"] = 0
        metrics["closed_issues"] = 0

    # 5. Issue Cycle Time (avg days from open to close)
    print("    - Calculating issue cycle time...")
    try:
        closed_issues_list = repo.get_issues(state="closed", since=start_date)
        cycle_times = []
        for issue in closed_issues_list:
            if issue.pull_request:
                continue
            if issue.closed_at and issue.created_at:
                if issue.closed_at.replace(tzinfo=pytz.UTC) >= start_date:
                    cycle_time = (issue.closed_at - issue.created_at).total_seconds() / 86400
                    cycle_times.append(cycle_time)
            if len(cycle_times) >= 50:
                break
        metrics["issue_cycle_time_days"] = round(
            sum(cycle_times) / len(cycle_times), 2
        ) if cycle_times else 0
        metrics["issues_sampled"] = len(cycle_times)
    except Exception as e:
        print(f"      Error: {e}")
        metrics["issue_cycle_time_days"] = 0
        metrics["issues_sampled"] = 0

    # 6. Code Review Time (avg hours from PR open to merge)
    print("    - Calculating code review time...")
    try:
        merged_pr_list = repo.get_pulls(state="closed", sort="updated")
        review_times = []
        for pr in merged_pr_list:
            if pr.created_at.replace(tzinfo=pytz.UTC) < start_date:
                break
            if pr.merged and pr.merged_at:
                review_time = (pr.merged_at - pr.created_at).total_seconds() / 3600
                review_times.append(review_time)
            if len(review_times) >= 50:
                break
        metrics["code_review_time_hours"] = round(
            sum(review_times) / len(review_times), 2
        ) if review_times else 0
        metrics["prs_sampled"] = len(review_times)
    except Exception as e:
        print(f"      Error: {e}")
        metrics["code_review_time_hours"] = 0
        metrics["prs_sampled"] = 0

    return metrics


def generate_html_dashboard(metrics_list: list) -> str:
    """Generate an HTML dashboard from collected metrics."""
    now = datetime.now(timezone.utc)

    cards_html = ""
    for m in metrics_list:
        if "error" in m:
            cards_html += f"""
            <div class="card error">
                <h3>{m['username']}/{m['repository']}</h3>
                <p class="error-text">Error: {m['error']}</p>
            </div>"""
            continue

        cards_html += f"""
        <div class="card">
            <h3>📊 {m['username']} / {m['repository']}</h3>
            <p class="period">Period: {m['period_start']} → {m['period_end']}</p>
            <div class="metrics-grid">
                <div class="metric">
                    <span class="metric-value">{m['commits']}</span>
                    <span class="metric-label">Commits</span>
                </div>
                <div class="metric">
                    <span class="metric-value">{m['lines_of_code']:,}</span>
                    <span class="metric-label">Lines of Code</span>
                    <span class="metric-detail">+{m['lines_added']:,} / -{m['lines_deleted']:,}</span>
                </div>
                <div class="metric">
                    <span class="metric-value">{m['open_prs']}</span>
                    <span class="metric-label">Open PRs</span>
                </div>
                <div class="metric">
                    <span class="metric-value">{m['merged_prs']}</span>
                    <span class="metric-label">Merged PRs</span>
                </div>
                <div class="metric">
                    <span class="metric-value">{m['open_issues']}</span>
                    <span class="metric-label">Open Issues</span>
                </div>
                <div class="metric">
                    <span class="metric-value">{m['closed_issues']}</span>
                    <span class="metric-label">Closed Issues</span>
                </div>
                <div class="metric">
                    <span class="metric-value">{m['issue_cycle_time_days']}d</span>
                    <span class="metric-label">Issue Cycle Time</span>
                    <span class="metric-detail">avg days to close</span>
                </div>
                <div class="metric">
                    <span class="metric-value">{m['code_review_time_hours']}h</span>
                    <span class="metric-label">Code Review Time</span>
                    <span class="metric-detail">avg hours to merge</span>
                </div>
            </div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Developer Productivity Metrics Dashboard</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }}
        .header {{
            background: linear-gradient(135deg, #161b22 0%, #238636 100%);
            padding: 30px; border-radius: 10px; margin-bottom: 30px;
            text-align: center;
        }}
        .header h1 {{ color: #fff; font-size: 28px; margin-bottom: 8px; }}
        .header p {{ color: #8b949e; font-size: 14px; }}
        .card {{
            background: #161b22; border: 1px solid #30363d; border-radius: 10px;
            padding: 24px; margin-bottom: 24px;
        }}
        .card.error {{ border-color: #f85149; }}
        .card h3 {{ color: #58a6ff; margin-bottom: 8px; font-size: 18px; }}
        .period {{ color: #8b949e; font-size: 13px; margin-bottom: 16px; }}
        .error-text {{ color: #f85149; }}
        .metrics-grid {{
            display: grid; grid-template-columns: repeat(4, 1fr);
            gap: 16px;
        }}
        .metric {{
            background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
            padding: 16px; text-align: center;
        }}
        .metric-value {{
            display: block; font-size: 28px; font-weight: bold; color: #58a6ff;
            margin-bottom: 4px;
        }}
        .metric-label {{
            display: block; font-size: 12px; color: #8b949e; text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .metric-detail {{
            display: block; font-size: 11px; color: #484f58; margin-top: 4px;
        }}
        .footer {{
            text-align: center; padding: 20px; color: #484f58; font-size: 12px;
        }}
        @media (max-width: 768px) {{
            .metrics-grid {{ grid-template-columns: repeat(2, 1fr); }}
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Developer Productivity Metrics</h1>
        <p>Generated: {now.strftime('%Y-%m-%d %H:%M UTC')} | Powered by Kiro IDE</p>
    </div>
    {cards_html}
    <div class="footer">
        <p>Metrics: Commits | Lines of Code | Open/Merged PRs | Open/Closed Issues | Issue Cycle Time | Code Review Time</p>
        <p>Data source: GitHub API | Generated by Kiro IDE Productivity Hook</p>
    </div>
</body>
</html>"""

    return html


def save_report(html: str) -> str:
    """Save HTML report to file."""
    REPORT_OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    filename = f"productivity-metrics-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.html"
    filepath = REPORT_OUTPUT_PATH / filename

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nReport saved to: {filepath}")
    return str(filepath)


def load_targets_config() -> list:
    """Load targets from config file if it exists."""
    config_path = Path(__file__).parent.parent / "config" / "metrics-targets.json"
    if config_path.exists():
        with open(config_path, "r") as f:
            return json.load(f)
    return []


def save_targets_config(targets: list) -> None:
    """Save targets to config file."""
    config_path = Path(__file__).parent.parent / "config" / "metrics-targets.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        json.dump(targets, f, indent=2)
    print(f"  Config saved to: {config_path}")


def interactive_add_repo(targets: list) -> list:
    """Interactively add a new repo to track."""
    print("\n--- Add Repository ---")
    username = input("  GitHub username: ").strip()
    if not username:
        print("  Cancelled.")
        return targets

    # List user's repos for easy selection
    print(f"\n  Fetching repos for '{username}'...")
    try:
        g = get_github_client()
        user = g.get_user(username)
        repos = list(user.get_repos(sort="updated"))[:20]
        if repos:
            print(f"\n  Recent repositories for {username}:")
            for i, r in enumerate(repos, 1):
                print(f"    [{i}] {r.name} (updated: {r.updated_at.strftime('%Y-%m-%d')})")
            print(f"    [0] Enter custom repo name")

            choice = input("\n  Select repo number (or 0 for custom): ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(repos):
                repo_name = repos[int(choice) - 1].name
            else:
                repo_name = input("  Repository name: ").strip()
        else:
            print("  No public repos found.")
            repo_name = input("  Repository name: ").strip()
    except Exception as e:
        print(f"  Could not fetch repos: {e}")
        repo_name = input("  Repository name: ").strip()

    if not repo_name:
        print("  Cancelled.")
        return targets

    # Check for duplicates
    for t in targets:
        if t["username"] == username and t["repository"] == repo_name:
            print(f"  Already tracking {username}/{repo_name}")
            return targets

    targets.append({"username": username, "repository": repo_name})
    print(f"  ✅ Added: {username}/{repo_name}")
    save_targets_config(targets)
    return targets


def interactive_remove_repo(targets: list) -> list:
    """Interactively remove a repo from tracking."""
    if not targets:
        print("  No repos being tracked.")
        return targets

    print("\n--- Remove Repository ---")
    for i, t in enumerate(targets, 1):
        print(f"  [{i}] {t['username']}/{t['repository']}")

    choice = input("\n  Select repo number to remove (0 to cancel): ").strip()
    if choice.isdigit() and 1 <= int(choice) <= len(targets):
        removed = targets.pop(int(choice) - 1)
        print(f"  ❌ Removed: {removed['username']}/{removed['repository']}")
        save_targets_config(targets)
    else:
        print("  Cancelled.")

    return targets


def interactive_menu(targets: list) -> tuple:
    """Show interactive menu for managing repos."""
    print("\n" + "=" * 60)
    print("GitHub Developer Productivity Metrics")
    print("=" * 60)
    print("\n  Currently tracking:")
    if targets:
        for t in targets:
            print(f"    • {t['username']}/{t['repository']}")
    else:
        print("    (none)")

    print("\n  Options:")
    print("    [1] Run metrics for all tracked repos")
    print("    [2] Add a repository")
    print("    [3] Remove a repository")
    print("    [4] Add all repos for a GitHub user")
    print("    [5] Exit")

    choice = input("\n  Choose an option: ").strip()
    return choice, targets


def add_all_user_repos(targets: list) -> list:
    """Add all repositories for a given GitHub user."""
    print("\n--- Add All Repos for User ---")
    username = input("  GitHub username: ").strip()
    if not username:
        print("  Cancelled.")
        return targets

    print(f"\n  Fetching all repos for '{username}'...")
    try:
        g = get_github_client()
        user = g.get_user(username)
        repos = list(user.get_repos(sort="updated"))
        added = 0
        for r in repos:
            exists = any(
                t["username"] == username and t["repository"] == r.name
                for t in targets
            )
            if not exists:
                targets.append({"username": username, "repository": r.name})
                print(f"    ✅ Added: {username}/{r.name}")
                added += 1

        print(f"\n  Added {added} new repos. Total tracked: {len(targets)}")
        save_targets_config(targets)
    except Exception as e:
        print(f"  Error: {e}")

    return targets


def main() -> None:
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="GitHub Developer Productivity Metrics")
    parser.add_argument("--user", "-u", help="GitHub username")
    parser.add_argument("--repo", "-r", help="Repository name")
    parser.add_argument("--weeks", "-w", type=int, default=DEFAULT_WEEKS_BACK, help="Weeks to look back (default: 4)")
    parser.add_argument("--add", action="store_true", help="Add a repo interactively")
    parser.add_argument("--add-all", metavar="USERNAME", help="Add all repos for a GitHub user")
    parser.add_argument("--list", action="store_true", help="List tracked repos")
    parser.add_argument("--interactive", "-i", action="store_true", help="Run in interactive mode")
    parser.add_argument("--run", action="store_true", help="Run metrics (default if no flags)")
    args = parser.parse_args()

    # Load saved targets
    targets = load_targets_config()

    # Interactive mode
    if args.interactive:
        while True:
            choice, targets = interactive_menu(targets)
            if choice == "1":
                break  # Fall through to run metrics
            elif choice == "2":
                targets = interactive_add_repo(targets)
            elif choice == "3":
                targets = interactive_remove_repo(targets)
            elif choice == "4":
                targets = add_all_user_repos(targets)
            elif choice == "5":
                print("\n  Goodbye!")
                return
            else:
                print("  Invalid option.")
        # After breaking from menu, run metrics below
    elif args.add:
        targets = interactive_add_repo(targets)
        return
    elif args.add_all:
        username = args.add_all
        print(f"\nFetching all repos for '{username}'...")
        try:
            g = get_github_client()
            user = g.get_user(username)
            repos = list(user.get_repos(sort="updated"))
            for r in repos:
                exists = any(
                    t["username"] == username and t["repository"] == r.name
                    for t in targets
                )
                if not exists:
                    targets.append({"username": username, "repository": r.name})
                    print(f"  ✅ Added: {username}/{r.name}")
            save_targets_config(targets)
        except Exception as e:
            print(f"  Error: {e}")
        return
    elif args.list:
        print("\nTracked repositories:")
        if targets:
            for t in targets:
                print(f"  • {t['username']}/{t['repository']}")
        else:
            print("  (none) — Use --add or --interactive to add repos")
        return
    elif args.user and args.repo:
        # One-off run for specific user/repo
        targets = [{"username": args.user, "repository": args.repo}]
    elif not targets:
        # No config, no args — use defaults
        targets = [
            {"username": "aaranjan2202026", "repository": "dev-productivity-dashboard"},
        ]

    # Check for env override
    custom_username = os.environ.get("METRICS_USERNAME")
    custom_repo = os.environ.get("METRICS_REPOSITORY")
    if custom_username and custom_repo and not args.user:
        targets = [{"username": custom_username, "repository": custom_repo}]

    # Run metrics collection
    print("\n" + "=" * 60)
    print("GitHub Developer Productivity Metrics")
    print("=" * 60)

    all_metrics = []
    for target in targets:
        metrics = collect_metrics(target["username"], target["repository"], weeks_back=args.weeks)
        all_metrics.append(metrics)
        print(f"\n  Results for {target['username']}/{target['repository']}:")
        if "error" not in metrics:
            print(f"    Commits: {metrics['commits']}")
            print(f"    Lines of Code: {metrics['lines_of_code']:,} (+{metrics['lines_added']:,} / -{metrics['lines_deleted']:,})")
            print(f"    Open PRs: {metrics['open_prs']} | Merged PRs: {metrics['merged_prs']}")
            print(f"    Open Issues: {metrics['open_issues']} | Closed Issues: {metrics['closed_issues']}")
            print(f"    Issue Cycle Time: {metrics['issue_cycle_time_days']} days")
            print(f"    Code Review Time: {metrics['code_review_time_hours']} hours")
        else:
            print(f"    Error: {metrics['error']}")

    # Generate HTML dashboard
    print("\nGenerating HTML dashboard...")
    html = generate_html_dashboard(all_metrics)
    report_path = save_report(html)

    # Save JSON metrics too
    json_path = REPORT_OUTPUT_PATH / f"productivity-metrics-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
    with open(json_path, "w") as f:
        json.dump(all_metrics, f, indent=2, default=str)
    print(f"JSON metrics saved to: {json_path}")

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
