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
    res.json({
      tokenUsage: data.tokenUsage,
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

// GET /api/context - Context usage per session
app.get('/api/context', (req, res) => {
  try {
    const data = loadData();
    res.json({
      sessions: data.sessions || [],
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
