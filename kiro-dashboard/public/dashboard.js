// Kiro Dashboard - Frontend Logic
const API_BASE = window.location.origin;
const REFRESH_INTERVAL = 5000;
let refreshTimer = null;

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = new Date() - new Date(dateStr);
  const s = Math.floor(diffMs / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function fmt(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}


async function fetchJSON(ep) {
  try {
    const r = await fetch(API_BASE + ep);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { console.error('Fetch ' + ep + ':', e.message); return null; }
}

function renderAgentStatus(data) {
  if (!data) return;
  const { agents, devServer } = data;

  const kI = document.getElementById('kiro-indicator');
  kI.className = 'agent-indicator ' + agents.kiro.status;
  kI.setAttribute('aria-label', 'Kiro: ' + agents.kiro.status);
  document.getElementById('kiro-status').textContent = agents.kiro.status;
  document.getElementById('kiro-lastseen').textContent = agents.kiro.lastSeen ? 'Last seen: ' + timeAgo(agents.kiro.lastSeen) : '';

  const gI = document.getElementById('groundcrew-indicator');
  gI.className = 'agent-indicator ' + agents.groundcrew.status;
  gI.setAttribute('aria-label', 'Groundcrew: ' + agents.groundcrew.status);
  document.getElementById('groundcrew-status').textContent = agents.groundcrew.status;
  document.getElementById('groundcrew-lastseen').textContent = agents.groundcrew.lastSeen ? 'Last seen: ' + timeAgo(agents.groundcrew.lastSeen) : agents.groundcrew.pid ? 'PID: ' + agents.groundcrew.pid : '';

  const dI = document.getElementById('devserver-indicator');
  const up = devServer.status === 'running';
  dI.className = 'agent-indicator ' + (up ? 'online' : 'offline');
  dI.setAttribute('aria-label', 'Dev server: ' + devServer.status);
  document.getElementById('devserver-status').textContent = devServer.status;
  document.getElementById('devserver-port').textContent = 'Port ' + devServer.port;
}


function renderTokenUsage(data) {
  if (!data) return;
  const el = document.getElementById('token-bars');
  const { tokenUsage, monthlyLimit, monthStartDate } = data;
  if (!tokenUsage || Object.keys(tokenUsage).length === 0) {
    el.innerHTML = '<p class="empty-state">No token data yet</p>';
    return;
  }

  const limit = monthlyLimit || 200000; // Default monthly token limit
  const totalUsed = Object.values(tokenUsage).reduce((a, b) => a + b, 0);
  const tokensLeft = Math.max(limit - totalUsed, 0);
  const usagePct = Math.min((totalUsed / limit) * 100, 100);
  const leftPct = 100 - usagePct;

  // Color based on usage level
  let usageColor = '#3fb950'; // green
  if (usagePct > 80) usageColor = '#da3633'; // red
  else if (usagePct > 60) usageColor = '#d29922'; // yellow

  // Monthly summary header
  let html = `
    <div class="token-summary">
      <div class="token-summary-item">
        <span class="token-summary-value" style="color:${usageColor}">${fmt(totalUsed)}</span>
        <span class="token-summary-label">Used this month</span>
      </div>
      <div class="token-summary-item">
        <span class="token-summary-value" style="color:#3fb950">${fmt(tokensLeft)}</span>
        <span class="token-summary-label">Tokens left</span>
      </div>
      <div class="token-summary-item">
        <span class="token-summary-value">${fmt(limit)}</span>
        <span class="token-summary-label">Monthly limit</span>
      </div>
    </div>
    <div class="token-month-bar">
      <div class="token-month-bar-fill" style="width:${usagePct}%;background:${usageColor}"></div>
    </div>
    <div class="token-month-meta">
      <span>${usagePct.toFixed(1)}% used</span>
      <span>${leftPct.toFixed(1)}% remaining</span>
    </div>
    <div class="token-divider"></div>`;

  // Per-agent breakdown
  const max = Math.max(...Object.values(tokenUsage), 1);
  html += Object.entries(tokenUsage).map(([agent, tokens]) => {
    const pct = Math.min((tokens / max) * 100, 100);
    const agentPctOfTotal = ((tokens / limit) * 100).toFixed(1);
    return `<div class="token-row"><div class="token-label"><strong>${agent}</strong><span>${fmt(tokens)} tokens (${agentPctOfTotal}%)</span></div><div class="token-bar"><div class="token-bar-fill ${agent}" style="width:${pct}%"></div></div></div>`;
  }).join('');

  el.innerHTML = html;
}

function renderContextUsage(data) {
  if (!data) return;
  const el = document.getElementById('context-list');
  const { sessions, summary } = data;

  if ((!sessions || sessions.length === 0) && !summary) {
    el.innerHTML = '<p class="empty-state">No active sessions</p>';
    return;
  }

  let html = '';

  // Daily / Weekly / Monthly table
  if (summary) {
    html += `
      <table class="context-table">
        <thead>
          <tr><th>Period</th><th>Tokens</th><th>Sessions</th></tr>
        </thead>
        <tbody>
          <tr><td>Today</td><td>${fmt(summary.daily.tokens)}</td><td>${summary.daily.sessions}</td></tr>
          <tr><td>This Week</td><td>${fmt(summary.weekly.tokens)}</td><td>${summary.weekly.sessions}</td></tr>
          <tr><td>This Month</td><td>${fmt(summary.monthly.tokens)}</td><td>${summary.monthly.sessions}</td></tr>
        </tbody>
      </table>`;
  }

  // Active sessions list
  if (sessions && sessions.length > 0) {
    const sorted = [...sessions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const circ = 2 * Math.PI * 16;
    html += '<div class="context-sessions-title">Recent Sessions</div>';
    html += sorted.slice(0, 5).map(s => {
      const pct = Math.round((s.contextTokens / s.maxTokens) * 100);
      const off = circ - (pct / 100) * circ;
      return `<div class="context-item"><div class="context-ring"><svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="16"/><circle class="fg" cx="20" cy="20" r="16" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/></svg><span class="context-percent">${pct}%</span></div><div class="context-info"><strong>${s.agent}</strong><span>${fmt(s.contextTokens)} / ${fmt(s.maxTokens)} tokens</span><span>${s.description || s.sessionId}</span></div></div>`;
    }).join('');
  }

  el.innerHTML = html;
}


function renderCommands(data) {
  if (!data) return;
  const el = document.getElementById('command-list');
  const cmdList = data.commands.commands || data.commands || [];
  const resList = data.results.results || data.results || [];
  if ((!cmdList.length) && (!resList.length)) {
    el.innerHTML = '<p class="empty-state">No pending commands</p>';
    return;
  }
  let html = '';
  if (Array.isArray(cmdList)) {
    for (const c of cmdList) {
      const st = c.status || 'pending';
      const txt = c.command || c.action || JSON.stringify(c);
      html += `<div class="command-item"><span class="command-badge ${st}">${st}</span><span class="command-text" title="${txt}">${txt}</span>${c.timestamp ? '<span class="command-time">' + timeAgo(c.timestamp) + '</span>' : ''}</div>`;
    }
  }
  if (Array.isArray(resList)) {
    for (const r of resList.slice(-5)) {
      const st = r.success ? 'completed' : 'failed';
      const txt = r.command || r.action || 'result';
      html += `<div class="command-item"><span class="command-badge ${st}">${st}</span><span class="command-text" title="${txt}">${txt}</span>${r.timestamp ? '<span class="command-time">' + timeAgo(r.timestamp) + '</span>' : ''}</div>`;
    }
  }
  el.innerHTML = html || '<p class="empty-state">No pending commands</p>';
}

function renderGitActivity(data) {
  if (!data) return;
  const el = document.getElementById('git-timeline');
  if (!data.activity || !data.activity.length) {
    el.innerHTML = '<p class="empty-state">No git activity found</p>';
    return;
  }
  el.innerHTML = data.activity.map(e => {
    const cls = e.repo === 'career-toolkit' ? 'career-toolkit' : 'groundcrew';
    return `<div class="git-entry"><span class="git-hash">${e.hash}</span><span class="git-message" title="${e.message}">${e.message}</span><div class="git-meta"><span class="git-repo ${cls}">${e.repo}</span><span class="git-date">${timeAgo(e.date)}</span></div></div>`;
  }).join('');
}


function renderProductivity(data) {
  const el = document.getElementById('productivity-metrics');
  if (!el) return;
  if (!data || !data.metrics || data.metrics.length === 0) {
    el.innerHTML = '<p class="empty-state">No metrics data. Run: python scripts/github-productivity-metrics.py</p>';
    return;
  }
  let html = '';
  for (const m of data.metrics) {
    if (m.error) {
      html += `<div class="productivity-card"><h3>${m.username}/${m.repository}</h3><p class="empty-state">Error: ${m.error}</p></div>`;
      continue;
    }
    html += `
      <div class="productivity-card">
        <h3>&#128202; ${m.username} / ${m.repository}</h3>
        <span class="productivity-period">${m.period_start} &rarr; ${m.period_end}</span>
        <div class="productivity-grid">
          <div class="productivity-stat"><span class="stat-value">${m.commits}</span><span class="stat-label">Commits</span></div>
          <div class="productivity-stat"><span class="stat-value">${fmt(m.lines_of_code)}</span><span class="stat-label">Lines of Code</span><span class="stat-detail">+${fmt(m.lines_added)} / -${fmt(m.lines_deleted)}</span></div>
          <div class="productivity-stat"><span class="stat-value">${m.open_prs}</span><span class="stat-label">Open PRs</span></div>
          <div class="productivity-stat"><span class="stat-value">${m.merged_prs}</span><span class="stat-label">Merged PRs</span></div>
          <div class="productivity-stat"><span class="stat-value">${m.open_issues}</span><span class="stat-label">Open Issues</span></div>
          <div class="productivity-stat"><span class="stat-value">${m.closed_issues}</span><span class="stat-label">Closed Issues</span></div>
          <div class="productivity-stat"><span class="stat-value">${m.issue_cycle_time_days}d</span><span class="stat-label">Cycle Time</span></div>
          <div class="productivity-stat"><span class="stat-value">${m.code_review_time_hours}h</span><span class="stat-label">Review Time</span></div>
        </div>
      </div>`;
  }
  if (data.generatedAt) {
    html += `<p class="empty-state" style="margin-top:10px;font-size:11px;">Last generated: ${data.generatedAt}</p>`;
  }
  el.innerHTML = html;
}

function renderGenAI(data) {
  const el = document.getElementById('genai-content');
  if (!el) return;
  if (!data || !data.scoreCard) {
    el.innerHTML = '<p class="empty-state">Unable to derive GenAI metrics</p>';
    return;
  }

  const scoreColors = ['score-0', 'score-1', 'score-2', 'score-3'];

  let scoreRows = '';
  for (const item of data.scoreCard) {
    const signalClass = item.signal.includes('↑') ? 'signal-up' : 'signal-down';
    scoreRows += `
      <tr>
        <td class="metric-name">${item.metric}</td>
        <td>${item.baseline || 'N/A'}</td>
        <td>${item.afterGenAI || 'N/A'}</td>
        <td><span class="score-badge ${scoreColors[item.score]}">${item.score}</span></td>
        <td><span class="${signalClass}">${item.signal}</span></td>
      </tr>`;
  }

  let indicatorRows = '';
  for (const item of data.scoreCard) {
    const signalClass = item.signal.includes('↑') ? 'signal-up' : 'signal-down';
    indicatorRows += `
      <tr>
        <td class="metric-name">${item.metric}</td>
        <td>${item.whatItMeasures}</td>
        <td>${item.howToCapture}</td>
        <td><span class="${signalClass}">${item.signal}</span></td>
      </tr>`;
  }

  const totalScore = data.scoreCard.reduce((sum, item) => sum + item.score, 0);
  const maxScore = data.scoreCard.length * 3;

  el.innerHTML = `
    <div class="genai-objective">
      <span class="objective-badge">Objective</span>
      ${data.objective}
      <span style="float:right;color:#58a6ff;font-weight:bold;">Overall: ${totalScore}/${maxScore}</span>
    </div>
    <div class="genai-source">
      <small>&#128270; Derived from: ${data.derivedFrom}</small>
    </div>

    <h3 class="genai-section-title">Score Card</h3>
    <table class="genai-table">
      <thead>
        <tr><th>Metric</th><th>Baseline</th><th>After GenAI</th><th>Score (0-3)</th><th>Signal</th></tr>
      </thead>
      <tbody>${scoreRows}</tbody>
    </table>

    <h3 class="genai-section-title">Indicators &amp; Description</h3>
    <table class="genai-table">
      <thead>
        <tr><th>Metric</th><th>What It Measures</th><th>How to Capture</th><th>Signal</th></tr>
      </thead>
      <tbody>${indicatorRows}</tbody>
    </table>

    <p class="empty-state" style="margin-top:10px;font-size:11px;">
      Kiro Tokens: ${fmt(data.rawData.kiroTokens)} | Sessions: ${data.rawData.sessionCount} | Updated: ${new Date(data.generatedAt).toLocaleTimeString()}
    </p>`;
}

function renderCICD(data) {
  const el = document.getElementById('cicd-content');
  if (!el) return;
  if (!data || !data.scoreCard) {
    el.innerHTML = '<p class="empty-state">Unable to derive CI/CD metrics</p>';
    return;
  }

  const scoreColors = ['score-0', 'score-1', 'score-2', 'score-3'];

  let scoreRows = '';
  for (const item of data.scoreCard) {
    const signalClass = item.signal.includes('↑') ? 'signal-up' : 'signal-down';
    scoreRows += `
      <tr>
        <td class="metric-name">${item.metric}</td>
        <td>${item.baseline || 'N/A'}</td>
        <td>${item.afterGenAI || 'N/A'}</td>
        <td><span class="score-badge ${scoreColors[item.score]}">${item.score}</span></td>
        <td><span class="${signalClass}">${item.signal}</span></td>
      </tr>`;
  }

  let indicatorRows = '';
  for (const item of data.scoreCard) {
    const signalClass = item.signal.includes('↑') ? 'signal-up' : 'signal-down';
    indicatorRows += `
      <tr>
        <td class="metric-name">${item.metric}</td>
        <td>${item.whatItMeasures}</td>
        <td>${item.howToCapture}</td>
        <td><span class="${signalClass}">${item.signal}</span></td>
      </tr>`;
  }

  const totalScore = data.scoreCard.reduce((sum, item) => sum + item.score, 0);
  const maxScore = data.scoreCard.length * 3;

  el.innerHTML = `
    <div class="genai-objective">
      <span class="objective-badge">Objective</span>
      ${data.objective}
      <span style="float:right;color:#58a6ff;font-weight:bold;">Overall: ${totalScore}/${maxScore}</span>
    </div>
    <div class="genai-source">
      <small>&#128270; Derived from: ${data.derivedFrom}</small>
    </div>

    <h3 class="genai-section-title">Score Card</h3>
    <table class="genai-table">
      <thead>
        <tr><th>Metric</th><th>Baseline</th><th>After GenAI</th><th>Score (0-3)</th><th>Signal</th></tr>
      </thead>
      <tbody>${scoreRows}</tbody>
    </table>

    <h3 class="genai-section-title">Indicators &amp; Description</h3>
    <table class="genai-table">
      <thead>
        <tr><th>Metric</th><th>What It Measures</th><th>How to Capture</th><th>Signal</th></tr>
      </thead>
      <tbody>${indicatorRows}</tbody>
    </table>

    <p class="empty-state" style="margin-top:10px;font-size:11px;">
      Updated: ${new Date(data.generatedAt).toLocaleTimeString()}
    </p>`;
}

function renderConfig(data) {
  if (!data) return;
  document.getElementById('config-info').textContent = `Monitoring: ${data.careerToolkitPath} | Dev server: :${data.devServerPort} | Dashboard: :${data.dashboardPort}`;
}

function renderWorkItems(data) {
  const el = document.getElementById('workitems-content');
  if (!el) return;
  if (!data || !data.workItems || data.workItems.length === 0) {
    el.innerHTML = '<p class="empty-state">No work items tracked yet. Enter a JIRA ID above and click Start Tracking.</p>';
    return;
  }

  const { workItems, summary } = data;

  // Summary stats
  let html = `
    <div class="workitem-summary">
      <div class="workitem-stat"><span class="workitem-stat-value">${summary.completed}</span><span class="workitem-stat-label">Completed</span></div>
      <div class="workitem-stat"><span class="workitem-stat-value">${summary.inProgress}</span><span class="workitem-stat-label">In Progress</span></div>
      <div class="workitem-stat"><span class="workitem-stat-value">${summary.avgCompletionHours}h</span><span class="workitem-stat-label">Avg Time</span></div>
      <div class="workitem-stat"><span class="workitem-stat-value">${summary.totalHoursSpent}h</span><span class="workitem-stat-label">Total Hours</span></div>
    </div>`;

  // Work items table
  const sorted = [...workItems].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  html += `
    <table class="workitem-table">
      <thead>
        <tr>
          <th>JIRA ID</th>
          <th>Status</th>
          <th>Kiro Code</th>
          <th>Lines Changed</th>
          <th>Time Taken</th>
          <th>Started</th>
        </tr>
      </thead>
      <tbody>`;

  for (const item of sorted.slice(0, 20)) {
    const statusClass = item.status === 'completed' ? 'completed' : 'in-progress';
    const statusIcon = item.status === 'completed' ? '&#10003;' : '&#9679;';
    const codeLabel = item.codeGenerated ? '<span class="badge-yes">AI Generated</span>' : '<span class="badge-no">Manual</span>';
    const duration = item.durationHours !== null ? `${item.durationHours}h` : '<em>running...</em>';
    const startDate = new Date(item.startedAt).toLocaleDateString();

    html += `
      <tr>
        <td class="workitem-id-cell">${item.jiraId}</td>
        <td><span class="workitem-status ${statusClass}">${statusIcon} ${item.status}</span></td>
        <td>${codeLabel}</td>
        <td>${item.linesChanged || 0}</td>
        <td><strong>${duration}</strong></td>
        <td>${startDate}</td>
      </tr>`;
  }

  html += '</tbody></table>';
  el.innerHTML = html;
}

// Work item form handlers
function initWorkItemForm() {
  const startBtn = document.getElementById('workitem-start-btn');
  const completeBtn = document.getElementById('workitem-complete-btn');
  const idInput = document.getElementById('workitem-id');

  if (!startBtn) return;

  startBtn.addEventListener('click', async () => {
    const jiraId = idInput.value.trim();
    const desc = document.getElementById('workitem-desc').value.trim();
    if (!jiraId) { idInput.focus(); return; }

    await fetch(API_BASE + '/api/workitems/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jiraId, description: desc }),
    });
    completeBtn.disabled = false;
    refreshAll();
  });

  completeBtn.addEventListener('click', async () => {
    const jiraId = idInput.value.trim();
    if (!jiraId) { idInput.focus(); return; }

    await fetch(API_BASE + '/api/workitems/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jiraId }),
    });
    idInput.value = '';
    document.getElementById('workitem-desc').value = '';
    completeBtn.disabled = true;
    refreshAll();
  });
}

async function refreshAll() {
  document.getElementById('refresh-indicator').textContent = 'refreshing...';
  const [status, tokens, context, commands, git, config, productivity, genai, cicd, workitems] = await Promise.all([
    fetchJSON('/api/status'),
    fetchJSON('/api/tokens'),
    fetchJSON('/api/context'),
    fetchJSON('/api/commands'),
    fetchJSON('/api/git-activity'),
    fetchJSON('/api/config'),
    fetchJSON('/api/productivity'),
    fetchJSON('/api/genai-activity'),
    fetchJSON('/api/genai-cicd'),
    fetchJSON('/api/workitems'),
  ]);
  renderAgentStatus(status);
  renderTokenUsage(tokens);
  renderContextUsage(context);
  renderCommands(commands);
  renderGitActivity(git);
  renderConfig(config);
  renderProductivity(productivity);
  renderGenAI(genai);
  renderCICD(cicd);
  renderWorkItems(workitems);
  document.getElementById('refresh-indicator').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

document.addEventListener('DOMContentLoaded', () => {
  refreshAll();
  initWorkItemForm();
  refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
  document.getElementById('refresh-btn').addEventListener('click', () => {
    clearInterval(refreshTimer);
    refreshAll();
    refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
  });
});
