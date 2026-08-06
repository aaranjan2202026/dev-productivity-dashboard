const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const net = require('net');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3001;

// Config - paths to monitor (configurable via env or config file)
const CONFIG = {
  careerToolkitPath: process.env.CAREER_TOOLKIT_PATH || path.resolve(__dirname, '..'),
  groundcrewPath: process.env.GROUNDCREW_PATH || path.resolve(__dirname, '..'),
  devServerPort: parseInt(process.env.DEV_SERVER_PORT || '3000'),
  agentCommandsFile: '.kiro/agent-commands.json',
  agentResultsFile: '.kiro/agent-results.json',
  dataFile: path.resolve(__dirname, 'data/dashboard-data.json'),
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize persistent data store
function loadData() {
  try {
    if (fs.existsSync(CONFIG.dataFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading data file:', e.message);
  }
  return {
    tokenUsage: { kiro: 0, groundcrew: 0 },
    contextUsage: [],
    sessions: [],
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving data file:', e.message);
  }
}

// --- Helper Functions ---

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

function getGitLog(repoPath, limit = 20) {
  try {
    if (!fs.existsSync(repoPath)) {
      return [];
    }
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return [];
    }
    // Use delimiter approach for Windows compatibility
    const log = execSync(
      `git -C "${repoPath}" log --format="%h|||%s|||%an|||%ci" -n ${limit}`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    return log
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|||');
        if (parts.length >= 4) {
          return {
            hash: parts[0],
            message: parts[1],
            author: parts[2],
            date: parts[3],
            type: 'commit',
          };
        }
        return null;
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function getGroundcrewStatus() {
  try {
    // Check if groundcrew process is running (Windows compatible)
    let result = '';
    try {
      result = execSync('tasklist /FI "IMAGENAME eq groundcrew*" /FO CSV /NH 2>nul', {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
    } catch (e) {
      // tasklist may fail, try alternative
      try {
        result = execSync('pgrep -f "groundcrew" 2>/dev/null || echo ""', {
          encoding: 'utf-8',
          timeout: 3000,
        }).trim();
      } catch (e2) {
        result = '';
      }
    }
    if (result && !result.includes('No tasks') && !result.includes('INFO:')) {
      return { status: 'online', pid: result.split(',')[1] || '' };
    }
    // Fallback: check if groundcrew left a recent heartbeat/log
    const logPath = path.join(CONFIG.groundcrewPath, 'groundcrew.log');
    if (fs.existsSync(logPath)) {
      const stat = fs.statSync(logPath);
      const lastModified = new Date(stat.mtime);
      const now = new Date();
      const diffMs = now - lastModified;
      if (diffMs < 30000) {
        return { status: 'online', lastSeen: lastModified.toISOString() };
      }
      return { status: 'offline', lastSeen: lastModified.toISOString() };
    }
    return { status: 'offline', lastSeen: null };
  } catch (e) {
    return { status: 'unknown', error: e.message };
  }
}

function getKiroStatus() {
  try {
    // Check for recent Kiro activity via .kiro directory or git commits
    const kiroDir = path.join(CONFIG.careerToolkitPath, '.kiro');
    if (fs.existsSync(kiroDir)) {
      const stat = fs.statSync(kiroDir);
      const lastModified = new Date(stat.mtime);
      const now = new Date();
      const diffMs = now - lastModified;
      if (diffMs < 60000) {
        return { status: 'online', lastSeen: lastModified.toISOString() };
      }
    }

    // Check for agent-commands file
    const commandsPath = path.join(CONFIG.careerToolkitPath, CONFIG.agentCommandsFile);
    if (fs.existsSync(commandsPath)) {
      const stat = fs.statSync(commandsPath);
      const lastModified = new Date(stat.mtime);
      const now = new Date();
      const diffMs = now - lastModified;
      if (diffMs < 60000) {
        return { status: 'online', lastSeen: lastModified.toISOString() };
      }
      return { status: 'idle', lastSeen: lastModified.toISOString() };
    }

    // Check recent git commits
    try {
      const log = execSync(
        `git -C "${CONFIG.careerToolkitPath}" log --oneline -n 1 --format="%ci"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (log) {
        const lastCommit = new Date(log);
        const now = new Date();
        const diffMs = now - lastCommit;
        if (diffMs < 300000) {
          return { status: 'online', lastSeen: lastCommit.toISOString() };
        }
        return { status: 'idle', lastSeen: lastCommit.toISOString() };
      }
    } catch (e) {
      // git command failed
    }

    return { status: 'unknown', lastSeen: null };
  } catch (e) {
    return { status: 'unknown', error: e.message };
  }
}

function getCommandQueue() {
  try {
    const commandsPath = path.join(CONFIG.careerToolkitPath, CONFIG.agentCommandsFile);
    if (fs.existsSync(commandsPath)) {
      const content = fs.readFileSync(commandsPath, 'utf-8');
      return JSON.parse(content);
    }
    return { commands: [], message: 'No command file found' };
  } catch (e) {
    return { commands: [], error: e.message };
  }
}

function getAgentResults() {
  try {
    const resultsPath = path.join(CONFIG.careerToolkitPath, CONFIG.agentResultsFile);
    if (fs.existsSync(resultsPath)) {
      const content = fs.readFileSync(resultsPath, 'utf-8');
      return JSON.parse(content);
    }
    return { results: [], message: 'No results file found' };
  } catch (e) {
    return { results: [], error: e.message };
  }
}

// --- API Endpoints ---

// GET /api/status - Overall system status
app.get('/api/status', async (req, res) => {
  try {
    const devServerUp = await checkPortInUse(CONFIG.devServerPort);
    const kiro = getKiroStatus();
    const groundcrew = getGroundcrewStatus();

    res.json({
      timestamp: new Date().toISOString(),
      agents: {
        kiro,
        groundcrew,
      },
      devServer: {
        port: CONFIG.devServerPort,
        status: devServerUp ? 'running' : 'stopped',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/git-activity - Recent git activity
app.get('/api/git-activity', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20');
    const workspaceLog = getGitLog(CONFIG.careerToolkitPath, limit);

    const allActivity = [
      ...workspaceLog.map((entry) => ({ ...entry, repo: 'workspace' })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      activity: allActivity.slice(0, limit),
      repos: {
        workspace: { path: CONFIG.careerToolkitPath, exists: fs.existsSync(CONFIG.careerToolkitPath) },
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/commands - Command queue
app.get('/api/commands', (req, res) => {
  try {
    const commands = getCommandQueue();
    const results = getAgentResults();
    res.json({ commands, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tokens - Token usage per agent
app.get('/api/tokens', (req, res) => {
  try {
    const data = loadData();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    res.json({
      tokenUsage: data.tokenUsage,
      monthlyLimit: data.monthlyLimit || 200000,
      monthStartDate: monthStart,
      updatedAt: data.tokenUsageUpdatedAt || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tokens - Update token usage (called by agents or manually)
app.post('/api/tokens', (req, res) => {
  try {
    const { agent, tokens } = req.body;
    if (!agent || tokens === undefined) {
      return res.status(400).json({ error: 'agent and tokens fields required' });
    }
    const data = loadData();
    if (!data.tokenUsage) data.tokenUsage = {};
    data.tokenUsage[agent] = (data.tokenUsage[agent] || 0) + tokens;
    data.tokenUsageUpdatedAt = new Date().toISOString();
    saveData(data);
    res.json({ tokenUsage: data.tokenUsage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/context - Context usage per session with daily/weekly/monthly aggregation
app.get('/api/context', (req, res) => {
  try {
    const data = loadData();
    const sessions = data.sessions || [];
    const now = new Date();

    // Calculate time boundaries
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Aggregate context tokens by period
    let dailyTokens = 0;
    let weeklyTokens = 0;
    let monthlyTokens = 0;
    let dailySessions = 0;
    let weeklySessions = 0;
    let monthlySessions = 0;

    for (const s of sessions) {
      const sessionDate = new Date(s.updatedAt);
      const tokens = s.contextTokens || 0;

      if (sessionDate >= monthStart) {
        monthlyTokens += tokens;
        monthlySessions++;
      }
      if (sessionDate >= weekStart) {
        weeklyTokens += tokens;
        weeklySessions++;
      }
      if (sessionDate >= todayStart) {
        dailyTokens += tokens;
        dailySessions++;
      }
    }

    res.json({
      sessions,
      summary: {
        daily: { tokens: dailyTokens, sessions: dailySessions },
        weekly: { tokens: weeklyTokens, sessions: weeklySessions },
        monthly: { tokens: monthlyTokens, sessions: monthlySessions },
      },
      totalSessions: sessions.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/context - Log a session's context usage
app.post('/api/context', (req, res) => {
  try {
    const { sessionId, agent, contextTokens, maxTokens, description } = req.body;
    if (!sessionId || !agent || contextTokens === undefined) {
      return res.status(400).json({ error: 'sessionId, agent, and contextTokens fields required' });
    }
    const data = loadData();
    if (!data.sessions) data.sessions = [];

    const existingIdx = data.sessions.findIndex((s) => s.sessionId === sessionId);
    const session = {
      sessionId,
      agent,
      contextTokens,
      maxTokens: maxTokens || 200000,
      description: description || '',
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      data.sessions[existingIdx] = session;
    } else {
      data.sessions.push(session);
    }

    // Keep only last 50 sessions
    if (data.sessions.length > 50) {
      data.sessions = data.sessions.slice(-50);
    }

    saveData(data);
    res.json({ sessions: data.sessions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/config - Return current config (for the frontend to show paths)
app.get('/api/config', (req, res) => {
  res.json({
    careerToolkitPath: CONFIG.careerToolkitPath,
    groundcrewPath: CONFIG.groundcrewPath,
    devServerPort: CONFIG.devServerPort,
    dashboardPort: PORT,
  });
});

// GET /api/productivity - Return latest productivity metrics from reports
app.get('/api/productivity', (req, res) => {
  try {
    const reportsDir = path.resolve(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
      return res.json({ metrics: [], message: 'No reports directory found' });
    }
    // Find the latest JSON metrics file
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('productivity-metrics-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return res.json({ metrics: [], message: 'No metrics reports found. Run: python scripts/github-productivity-metrics.py' });
    }

    const latestFile = path.join(reportsDir, files[0]);
    const content = fs.readFileSync(latestFile, 'utf-8');
    const metrics = JSON.parse(content);

    res.json({
      metrics,
      file: files[0],
      generatedAt: metrics[0] ? metrics[0].generated_at : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/genai-activity - Derive GenAI developer activity from actual tracking data
app.get('/api/genai-activity', (req, res) => {
  try {
    const data = loadData();
    const workspacePath = CONFIG.careerToolkitPath;

    // 1. Development Cycle Time — derive from git commit frequency
    let cycleTimeData = { baseline: null, afterGenAI: null, score: 0 };
    try {
      // Get commits from last 4 weeks
      const recentLog = execSync(
        `git -C "${workspacePath}" log --format="%ci" --since="4 weeks ago"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const recentCommits = recentLog ? recentLog.split('\n').filter(Boolean) : [];

      // Get commits from 4-8 weeks ago (baseline)
      const olderLog = execSync(
        `git -C "${workspacePath}" log --format="%ci" --since="8 weeks ago" --until="4 weeks ago"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const olderCommits = olderLog ? olderLog.split('\n').filter(Boolean) : [];

      const recentPerDay = recentCommits.length / 28;
      const olderPerDay = olderCommits.length / 28;

      cycleTimeData.baseline = olderCommits.length > 0 ? `${(7 / Math.max(olderPerDay, 0.1)).toFixed(1)}d/feature` : 'N/A';
      cycleTimeData.afterGenAI = recentCommits.length > 0 ? `${(7 / Math.max(recentPerDay, 0.1)).toFixed(1)}d/feature` : 'N/A';

      // Score: 3 if >50% faster, 2 if >25% faster, 1 if any improvement
      if (olderPerDay > 0 && recentPerDay > olderPerDay) {
        const improvement = (recentPerDay - olderPerDay) / olderPerDay;
        cycleTimeData.score = improvement > 0.5 ? 3 : improvement > 0.25 ? 2 : 1;
      } else if (recentCommits.length > 0) {
        cycleTimeData.score = 2; // Default if no baseline
      }
    } catch (e) { /* git not available */ }

    // 2. Code Generation Support — derive from Kiro token usage and session activity
    let codeGenData = { baseline: '0%', afterGenAI: '0%', score: 0 };
    const kiroTokens = (data.tokenUsage && data.tokenUsage.kiro) || 0;
    const totalTokens = Object.values(data.tokenUsage || {}).reduce((a, b) => a + b, 0);
    const sessionCount = (data.sessions || []).length;

    if (kiroTokens > 0) {
      // Estimate % of code assisted by AI based on token usage patterns
      const aiAssistPct = Math.min(Math.round((kiroTokens / Math.max(totalTokens, 1)) * 80), 95);
      codeGenData.baseline = '0%';
      codeGenData.afterGenAI = `${aiAssistPct}%`;
      codeGenData.score = aiAssistPct > 60 ? 3 : aiAssistPct > 30 ? 2 : 1;
    }

    // 3. Throughput per Sprint — derive from lines of code and commits in recent period
    let throughputData = { baseline: null, afterGenAI: null, score: 0 };
    try {
      // Recent 2 weeks
      const recentStats = execSync(
        `git -C "${workspacePath}" log --shortstat --since="2 weeks ago" --format=""`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      let recentInsertions = 0;
      for (const line of recentStats.split('\n')) {
        const match = line.match(/(\d+) insertion/);
        if (match) recentInsertions += parseInt(match[1]);
      }

      // Older 2 weeks (baseline)
      const olderStats = execSync(
        `git -C "${workspacePath}" log --shortstat --since="4 weeks ago" --until="2 weeks ago" --format=""`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      let olderInsertions = 0;
      for (const line of olderStats.split('\n')) {
        const match = line.match(/(\d+) insertion/);
        if (match) olderInsertions += parseInt(match[1]);
      }

      throughputData.baseline = olderInsertions > 0 ? `${olderInsertions} LOC` : 'N/A';
      throughputData.afterGenAI = recentInsertions > 0 ? `${recentInsertions} LOC` : 'N/A';

      if (olderInsertions > 0 && recentInsertions > olderInsertions) {
        const improvement = (recentInsertions - olderInsertions) / olderInsertions;
        throughputData.score = improvement > 0.5 ? 3 : improvement > 0.25 ? 2 : 1;
      } else if (recentInsertions > 0) {
        throughputData.score = 1;
      }
    } catch (e) { /* git not available */ }

    // 4. Boilerplate Effort Reduction — derive from file generation patterns
    let boilerplateData = { baseline: null, afterGenAI: null, score: 0 };
    try {
      // Count config/infra files created recently (proxy for boilerplate generation)
      const recentFiles = execSync(
        `git -C "${workspacePath}" log --diff-filter=A --name-only --since="2 weeks ago" --format=""`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const newFiles = recentFiles ? recentFiles.split('\n').filter(Boolean) : [];

      // Categorize boilerplate files
      const boilerplatePatterns = /\.(json|yaml|yml|toml|config|env|hook|md|dockerfile|tf|cdk)/i;
      const boilerplateFiles = newFiles.filter(f => boilerplatePatterns.test(f));
      const totalNewFiles = newFiles.length;

      const hoursSaved = boilerplateFiles.length * 0.5; // Estimate 30min per boilerplate file
      boilerplateData.baseline = `${(boilerplateFiles.length * 1.5).toFixed(1)}h manual`;
      boilerplateData.afterGenAI = `${hoursSaved.toFixed(1)}h with AI`;

      if (boilerplateFiles.length > 10) {
        boilerplateData.score = 3;
      } else if (boilerplateFiles.length > 5) {
        boilerplateData.score = 2;
      } else if (boilerplateFiles.length > 0) {
        boilerplateData.score = 1;
      }
    } catch (e) { /* git not available */ }

    // Build response
    const genaiMetrics = {
      objective: 'Accelerated development with consistent quality',
      generatedAt: new Date().toISOString(),
      derivedFrom: 'Git history, Kiro token usage, session tracking',
      scoreCard: [
        {
          metric: 'Development Cycle Time',
          whatItMeasures: 'Story start → code complete',
          howToCapture: 'Git commit frequency',
          signal: '↓ Cycle Time',
          baseline: cycleTimeData.baseline,
          afterGenAI: cycleTimeData.afterGenAI,
          score: cycleTimeData.score,
        },
        {
          metric: 'Code Generation Support',
          whatItMeasures: '% of code snippets generated/refined by Kiro',
          howToCapture: 'Kiro token & session tracking',
          signal: '↑ AI Use',
          baseline: codeGenData.baseline,
          afterGenAI: codeGenData.afterGenAI,
          score: codeGenData.score,
        },
        {
          metric: 'Throughput per Sprint',
          whatItMeasures: 'Lines/modules delivered per sprint',
          howToCapture: 'Git repo analytics',
          signal: '↑ Throughput',
          baseline: throughputData.baseline,
          afterGenAI: throughputData.afterGenAI,
          score: throughputData.score,
        },
        {
          metric: 'Boilerplate Effort Reduction',
          whatItMeasures: 'Infra, API, config, DTO generation',
          howToCapture: 'File creation patterns in git',
          signal: '↓ Effort',
          baseline: boilerplateData.baseline,
          afterGenAI: boilerplateData.afterGenAI,
          score: boilerplateData.score,
        },
      ],
      rawData: {
        kiroTokens,
        totalTokens,
        sessionCount,
      },
    };

    res.json(genaiMetrics);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/genai-cicd - Derive CI/CD & Operations metrics from actual tracking data
app.get('/api/genai-cicd', (req, res) => {
  try {
    const data = loadData();
    const workspacePath = CONFIG.careerToolkitPath;

    // 1. CI/CD Automation — derive from pipeline/IaC/script files created by Kiro
    let cicdData = { baseline: null, afterGenAI: null, score: 0 };
    try {
      const allFiles = execSync(
        `git -C "${workspacePath}" log --diff-filter=A --name-only --since="4 weeks ago" --format=""`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const newFiles = allFiles ? allFiles.split('\n').filter(Boolean) : [];

      // CI/CD related files
      const cicdPatterns = /\.(yml|yaml|tf|cdk|dockerfile|sh|ps1|pipeline|workflow)/i;
      const cicdPathPatterns = /(\.github|\.kiro|scripts|infra|deploy|pipeline|ci|cd|terraform|cloudformation)/i;
      const cicdFiles = newFiles.filter(f => cicdPatterns.test(f) || cicdPathPatterns.test(f));
      const hookFiles = newFiles.filter(f => f.includes('.kiro/hooks'));

      const totalCicd = cicdFiles.length + hookFiles.length;
      cicdData.baseline = '0 pipelines';
      cicdData.afterGenAI = `${totalCicd} configs generated`;

      if (totalCicd > 15) cicdData.score = 3;
      else if (totalCicd > 8) cicdData.score = 2;
      else if (totalCicd > 0) cicdData.score = 1;
    } catch (e) { /* git not available */ }

    // 2. Deployment Readiness Time — derive from time between first commit and last commit per day
    let deployReadyData = { baseline: null, afterGenAI: null, score: 0 };
    try {
      const commitDates = execSync(
        `git -C "${workspacePath}" log --format="%ci" --since="2 weeks ago"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const dates = commitDates ? commitDates.split('\n').filter(Boolean) : [];

      if (dates.length >= 2) {
        const first = new Date(dates[dates.length - 1]);
        const last = new Date(dates[0]);
        const totalHours = (last - first) / (1000 * 60 * 60);
        const commitsPerHour = dates.length / Math.max(totalHours, 1);

        // Faster commit velocity = faster deployment readiness
        deployReadyData.baseline = 'Manual build/test';
        deployReadyData.afterGenAI = `${Math.max(totalHours / dates.length, 0.1).toFixed(1)}h per deploy`;
        deployReadyData.score = commitsPerHour > 2 ? 3 : commitsPerHour > 0.5 ? 2 : 1;
      } else if (dates.length > 0) {
        deployReadyData.baseline = 'N/A';
        deployReadyData.afterGenAI = 'Active';
        deployReadyData.score = 1;
      }
    } catch (e) { /* git not available */ }

    // 3. Incident Resolution Support — derive from fix commits and Kiro sessions
    let incidentData = { baseline: null, afterGenAI: null, score: 0 };
    try {
      const fixCommits = execSync(
        `git -C "${workspacePath}" log --oneline --since="4 weeks ago" --grep="fix"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const fixes = fixCommits ? fixCommits.split('\n').filter(Boolean) : [];

      const kiroTokens = (data.tokenUsage && data.tokenUsage.kiro) || 0;
      const sessionCount = (data.sessions || []).length;

      // AI-assisted fixes estimated from kiro usage during fix commits
      const aiAssistedFixes = Math.min(fixes.length, Math.ceil(kiroTokens / 5000));

      incidentData.baseline = fixes.length > 0 ? `${fixes.length} fixes (manual)` : 'N/A';
      incidentData.afterGenAI = aiAssistedFixes > 0 ? `${aiAssistedFixes} AI-assisted` : 'N/A';

      if (aiAssistedFixes > 5) incidentData.score = 3;
      else if (aiAssistedFixes > 2) incidentData.score = 2;
      else if (aiAssistedFixes > 0) incidentData.score = 1;
    } catch (e) { /* git not available */ }

    // 4. Runbook Coverage — derive from documentation/steering/hook files generated
    let runbookData = { baseline: null, afterGenAI: null, score: 0 };
    try {
      const docFiles = execSync(
        `git -C "${workspacePath}" log --diff-filter=A --name-only --since="4 weeks ago" --format=""`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      const allNewFiles = docFiles ? docFiles.split('\n').filter(Boolean) : [];

      // Operational docs: steering files, hooks, READMEs, runbooks, scripts
      const opsDocPatterns = /\.(md|hook|sh|ps1)/i;
      const opsPathPatterns = /(steering|hooks|scripts|docs|runbook|readme)/i;
      const opsDocs = allNewFiles.filter(f => opsDocPatterns.test(f) || opsPathPatterns.test(f));

      // Steering files = SOPs/runbooks
      const steeringFiles = allNewFiles.filter(f => f.includes('steering'));
      const hookFilesCount = allNewFiles.filter(f => f.includes('.hook'));

      const totalOps = opsDocs.length;
      runbookData.baseline = '0 runbooks';
      runbookData.afterGenAI = `${totalOps} docs/SOPs generated`;

      if (totalOps > 15) runbookData.score = 3;
      else if (totalOps > 8) runbookData.score = 2;
      else if (totalOps > 0) runbookData.score = 1;
    } catch (e) { /* git not available */ }

    const cicdMetrics = {
      objective: 'Reduced friction across CI/CD and operations',
      generatedAt: new Date().toISOString(),
      derivedFrom: 'Git file patterns, Kiro hooks/steering, session data',
      scoreCard: [
        {
          metric: 'CI/CD Config Generation',
          whatItMeasures: 'Pipelines, IaC, scripts via AI',
          howToCapture: 'Git file creation tracking',
          signal: '↑ Automation',
          baseline: cicdData.baseline,
          afterGenAI: cicdData.afterGenAI,
          score: cicdData.score,
        },
        {
          metric: 'Deployment Readiness Time',
          whatItMeasures: 'Build → Production readiness',
          howToCapture: 'Commit velocity analytics',
          signal: '↓ Time',
          baseline: deployReadyData.baseline,
          afterGenAI: deployReadyData.afterGenAI,
          score: deployReadyData.score,
        },
        {
          metric: 'Incident Resolution Support',
          whatItMeasures: 'AI-assisted RCA, fixes',
          howToCapture: 'Fix commits + Kiro token correlation',
          signal: '↓ MTTR',
          baseline: incidentData.baseline,
          afterGenAI: incidentData.afterGenAI,
          score: incidentData.score,
        },
        {
          metric: 'Ops Runbook Coverage',
          whatItMeasures: 'Auto-generated SOPs, docs',
          howToCapture: 'Steering/hook/doc file tracking',
          signal: '↑ Coverage',
          baseline: runbookData.baseline,
          afterGenAI: runbookData.afterGenAI,
          score: runbookData.score,
        },
      ],
    };

    res.json(cicdMetrics);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────┐`);
  console.log(`  │   Kiro Dashboard running on :${PORT}    │`);
  console.log(`  │   http://localhost:${PORT}              │`);
  console.log(`  └─────────────────────────────────────┘\n`);
  console.log(`  Monitoring:`);
  console.log(`    career-toolkit: ${CONFIG.careerToolkitPath}`);
  console.log(`    groundcrew:     ${CONFIG.groundcrewPath}`);
  console.log(`    dev server:     port ${CONFIG.devServerPort}\n`);
});
