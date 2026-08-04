# Kiro Developer Metrics Template - Windows Setup Script
# Run: .\setup.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Kiro Developer Metrics - Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1. Install Python dependencies
Write-Host "`n[1/4] Installing Python dependencies..." -ForegroundColor Yellow
pip install boto3 flask pymongo PyGithub matplotlib reportlab pytz

# 2. Install Node.js dependencies for kiro-dashboard
Write-Host "`n[2/4] Installing kiro-dashboard dependencies..." -ForegroundColor Yellow
if (Test-Path "kiro-dashboard/package.json") {
    Push-Location kiro-dashboard
    npm install
    Pop-Location
} else {
    Write-Host "  kiro-dashboard not found. Skipping." -ForegroundColor Gray
}

# 3. Configure environment variables
Write-Host "`n[3/4] Configuring environment variables..." -ForegroundColor Yellow

$githubToken = Read-Host "  Enter your GitHub Personal Access Token (or press Enter to skip)"
if ($githubToken) {
    [System.Environment]::SetEnvironmentVariable("PERSONAL_GITHUB_TOKEN", $githubToken, "User")
    Write-Host "  PERSONAL_GITHUB_TOKEN saved." -ForegroundColor Green
}

$teamsWebhook = Read-Host "  Enter your Teams Webhook URL (or press Enter to skip)"
if ($teamsWebhook) {
    [System.Environment]::SetEnvironmentVariable("TEAMS_WEBHOOK_URL", $teamsWebhook, "User")
    Write-Host "  TEAMS_WEBHOOK_URL saved." -ForegroundColor Green
}

# 4. Add repos to track
Write-Host "`n[4/4] Adding repositories to track..." -ForegroundColor Yellow
$addRepos = Read-Host "  Would you like to add GitHub repos to track? (y/n)"
if ($addRepos -eq "y") {
    $username = Read-Host "  Enter GitHub username"
    if ($username) {
        $env:PERSONAL_GITHUB_TOKEN = $githubToken
        python scripts/github-productivity-metrics.py --add-all $username
    }
}

# Done
Write-Host "`n============================================" -ForegroundColor Green
Write-Host " Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nNext steps:"
Write-Host "  1. Run metrics:     python scripts/github-productivity-metrics.py"
Write-Host "  2. Run cost report: python scripts/aws-daily-cost-report.py"
Write-Host "  3. Start dashboard: cd kiro-dashboard; npm start"
Write-Host "  4. Open Kiro IDE to use hooks and steering files"
Write-Host ""
