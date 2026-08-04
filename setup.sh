#!/bin/bash
# Kiro Developer Metrics Template - Linux/Mac Setup Script
# Run: chmod +x setup.sh && ./setup.sh

echo "============================================"
echo " Kiro Developer Metrics - Setup"
echo "============================================"

# 1. Install Python dependencies
echo ""
echo "[1/4] Installing Python dependencies..."
pip install boto3 flask pymongo PyGithub matplotlib reportlab pytz

# 2. Install Node.js dependencies for kiro-dashboard
echo ""
echo "[2/4] Installing kiro-dashboard dependencies..."
if [ -f "kiro-dashboard/package.json" ]; then
    cd kiro-dashboard && npm install && cd ..
else
    echo "  kiro-dashboard not found. Skipping."
fi

# 3. Configure environment variables
echo ""
echo "[3/4] Configuring environment variables..."

read -p "  Enter your GitHub Personal Access Token (or press Enter to skip): " GITHUB_TOKEN
if [ -n "$GITHUB_TOKEN" ]; then
    echo "export PERSONAL_GITHUB_TOKEN=\"$GITHUB_TOKEN\"" >> ~/.bashrc
    export PERSONAL_GITHUB_TOKEN="$GITHUB_TOKEN"
    echo "  PERSONAL_GITHUB_TOKEN saved to ~/.bashrc"
fi

read -p "  Enter your Teams Webhook URL (or press Enter to skip): " TEAMS_URL
if [ -n "$TEAMS_URL" ]; then
    echo "export TEAMS_WEBHOOK_URL=\"$TEAMS_URL\"" >> ~/.bashrc
    export TEAMS_WEBHOOK_URL="$TEAMS_URL"
    echo "  TEAMS_WEBHOOK_URL saved to ~/.bashrc"
fi

# 4. Add repos to track
echo ""
echo "[4/4] Adding repositories to track..."
read -p "  Would you like to add GitHub repos to track? (y/n): " ADD_REPOS
if [ "$ADD_REPOS" = "y" ]; then
    read -p "  Enter GitHub username: " GH_USERNAME
    if [ -n "$GH_USERNAME" ]; then
        python scripts/github-productivity-metrics.py --add-all "$GH_USERNAME"
    fi
fi

# Done
echo ""
echo "============================================"
echo " Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Run metrics:     python scripts/github-productivity-metrics.py"
echo "  2. Run cost report: python scripts/aws-daily-cost-report.py"
echo "  3. Start dashboard: cd kiro-dashboard && npm start"
echo "  4. Open Kiro IDE to use hooks and steering files"
echo ""
