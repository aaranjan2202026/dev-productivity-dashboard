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
  const { tokenUsage } = data;
  if (!tokenUsage || Object.keys(tokenUsage).length === 0) {
    el.innerHTML = '<p class="empty-state">No token data yet</p>';
    return;
  }
  const max = Math.max(...Object.values(tokenUsage), 1);
  el.innerHTML = Object.entries(tokenUsage).map(([agent, tokens]) => {
    const pct = Math.min((tokens / max) * 100, 100);
    return `<div class="token-row"><div class="token-label"><strong>${agent}</strong><span>${fmt(tokens)} tokens</span></div><div class="token-bar"><div class="token-bar-fill ${agent}" style="width:${pct}%"></div></div></div>`;
  }).join('');
}

function renderContextUsage(data) {
  if (!data) return;
  const el = document.getElementById('context-list');
  const { sessions } = data;
  if (!sessions || sessions.length === 0) {
    el.innerHTML = '<p class="empty-state">No active sessions</p>';
    return;
  }
  const sorted = [...sessions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const circ = 2 * Math.PI * 16;
  el.innerHTML = sorted.slice(0, 5).map(s => {
    const pct = Math.round((s.contextTokens / s.maxTokens) * 100);
    const off = circ - (pct / 100) * circ;
    return `<div class="context-item"><div class="context-ring"><svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="16"/><circle class="fg" cx="20" cy="20" r="16" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/></svg><span class="context-percent">${pct}%</span></div><div class="context-info"><strong>${s.agent}</strong><span>${fmt(s.contextTokens)} / ${fmt(s.maxTokens)} tokens</span><span>${s.description || s.sessionId}</span></div></div>`;
  }).join('');
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

function renderConfig(data) {
  if (!data) return;
  document.getElementById('config-info').textContent = `Monitoring: ${data.careerToolkitPath} | Dev server: :${data.devServerPort} | Dashboard: :${data.dashboardPort}`;
}

async function refreshAll() {
  document.getElementById('refresh-indicator').textContent = 'refreshing...';
  const [status, tokens, context, commands, git, config, productivity] = await Promise.all([
    fetchJSON('/api/status'),
    fetchJSON('/api/tokens'),
    fetchJSON('/api/context'),
    fetchJSON('/api/commands'),
    fetchJSON('/api/git-activity'),
    fetchJSON('/api/config'),
    fetchJSON('/api/productivity'),
  ]);
  renderAgentStatus(status);
  renderTokenUsage(tokens);
  renderContextUsage(context);
  renderCommands(commands);
  renderGitActivity(git);
  renderConfig(config);
  renderProductivity(productivity);
  document.getElementById('refresh-indicator').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

document.addEventListener('DOMContentLoaded', () => {
  refreshAll();
  refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
  document.getElementById('refresh-btn').addEventListener('click', () => {
    clearInterval(refreshTimer);
    refreshAll();
    refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL);
  });
});
