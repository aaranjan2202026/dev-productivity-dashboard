import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..");

const server = new McpServer({
  name: "dev-metrics",
  version: "1.0.0",
});

// Tool: Get GitHub Productivity Metrics
server.tool(
  "get_productivity_metrics",
  "Fetch developer productivity metrics (commits, LOC, PRs, issues, cycle time, review time) from a GitHub repository",
  {
    username: z.string().describe("GitHub username or org that owns the repo"),
    repository: z.string().describe("Repository name"),
    weeks: z.number().optional().describe("Number of weeks to look back (default: 4)"),
  },
  async ({ username, repository, weeks }) => {
    try {
      const script = path.join(WORKSPACE_ROOT, "scripts", "github-productivity-metrics.py");
      const cmd = `python "${script}" --user ${username} --repo ${repository} --weeks ${weeks || 4}`;
      const output = execSync(cmd, {
        encoding: "utf-8",
        cwd: WORKSPACE_ROOT,
        timeout: 60000,
        env: { ...process.env },
      });
      return { content: [{ type: "text", text: output }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// Tool: Add Repository to Track
server.tool(
  "add_repository",
  "Add a GitHub repository to the tracked list for productivity metrics",
  {
    username: z.string().describe("GitHub username or org"),
    repository: z.string().describe("Repository name"),
  },
  async ({ username, repository }) => {
    try {
      const configPath = path.join(WORKSPACE_ROOT, "config", "metrics-targets.json");
      let targets = [];
      if (fs.existsSync(configPath)) {
        targets = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }
      const exists = targets.some(
        (t) => t.username === username && t.repository === repository
      );
      if (exists) {
        return { content: [{ type: "text", text: `Already tracking ${username}/${repository}` }] };
      }
      targets.push({ username, repository });
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(targets, null, 2));
      return { content: [{ type: "text", text: `Added ${username}/${repository}. Now tracking ${targets.length} repos.` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// Tool: List Tracked Repositories
server.tool(
  "list_tracked_repos",
  "List all GitHub repositories currently being tracked for productivity metrics",
  {},
  async () => {
    try {
      const configPath = path.join(WORKSPACE_ROOT, "config", "metrics-targets.json");
      if (!fs.existsSync(configPath)) {
        return { content: [{ type: "text", text: "No repositories tracked yet. Use add_repository to add one." }] };
      }
      const targets = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (targets.length === 0) {
        return { content: [{ type: "text", text: "No repositories tracked yet." }] };
      }
      const list = targets.map((t) => `• ${t.username}/${t.repository}`).join("\n");
      return { content: [{ type: "text", text: `Tracked repositories (${targets.length}):\n${list}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// Tool: Get AWS Cost Report
server.tool(
  "get_aws_costs",
  "Generate AWS daily cost and usage report for the current account. Sends to Teams and email if configured.",
  {},
  async () => {
    try {
      const script = path.join(WORKSPACE_ROOT, "scripts", "aws-daily-cost-report.py");
      const output = execSync(`python "${script}"`, {
        encoding: "utf-8",
        cwd: WORKSPACE_ROOT,
        timeout: 60000,
        env: { ...process.env },
      });
      return { content: [{ type: "text", text: output }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// Tool: Get GenAI Developer Activity (auto-derived)
server.tool(
  "get_genai_activity",
  "Get auto-derived GenAI developer activity metrics: cycle time, code generation support, throughput, boilerplate reduction. All derived from git history and Kiro token tracking.",
  {},
  async () => {
    try {
      const dashboardUrl = `http://localhost:${process.env.DASHBOARD_PORT || 3001}/api/genai-activity`;
      const response = execSync(`curl -s "${dashboardUrl}"`, { encoding: "utf-8", timeout: 5000 });
      const data = JSON.parse(response);
      let output = `GenAI Developer Activity\nObjective: ${data.objective}\n\n`;
      output += "Score Card:\n";
      for (const item of data.scoreCard) {
        output += `  ${item.metric}: ${item.baseline || 'N/A'} → ${item.afterGenAI || 'N/A'} (Score: ${item.score}/3) ${item.signal}\n`;
      }
      return { content: [{ type: "text", text: output }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Dashboard not running. Start it with: cd kiro-dashboard && node server.js\nError: ${e.message}` }] };
    }
  }
);

// Tool: Get CI/CD & Operations Metrics (auto-derived)
server.tool(
  "get_cicd_metrics",
  "Get auto-derived CI/CD and operations metrics: config generation, deployment readiness, incident resolution, runbook coverage. All derived from git file patterns and Kiro tracking.",
  {},
  async () => {
    try {
      const dashboardUrl = `http://localhost:${process.env.DASHBOARD_PORT || 3001}/api/genai-cicd`;
      const response = execSync(`curl -s "${dashboardUrl}"`, { encoding: "utf-8", timeout: 5000 });
      const data = JSON.parse(response);
      let output = `CI/CD & Operations\nObjective: ${data.objective}\n\n`;
      output += "Score Card:\n";
      for (const item of data.scoreCard) {
        output += `  ${item.metric}: ${item.baseline || 'N/A'} → ${item.afterGenAI || 'N/A'} (Score: ${item.score}/3) ${item.signal}\n`;
      }
      return { content: [{ type: "text", text: output }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Dashboard not running. Start it with: cd kiro-dashboard && node server.js\nError: ${e.message}` }] };
    }
  }
);

// Tool: Start Dashboard
server.tool(
  "start_dashboard",
  "Start the real-time developer metrics dashboard at http://localhost:3001",
  {},
  async () => {
    try {
      const dashboardPath = path.join(WORKSPACE_ROOT, "kiro-dashboard", "server.js");
      spawn("node", [dashboardPath], {
        detached: true,
        stdio: "ignore",
        cwd: path.join(WORKSPACE_ROOT, "kiro-dashboard"),
      }).unref();
      return { content: [{ type: "text", text: "Dashboard started at http://localhost:3001\nPanels: Agent Status, Token Usage, Context Usage, Command Queue, Git Activity, Productivity Metrics, GenAI Activity, CI/CD Operations" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error starting dashboard: ${e.message}` }] };
    }
  }
);

// Tool: Generate Full Report
server.tool(
  "generate_report",
  "Generate a complete HTML report with all metrics (productivity + AWS costs) and open it in browser",
  {},
  async () => {
    try {
      const script = path.join(WORKSPACE_ROOT, "scripts", "github-productivity-metrics.py");
      const output = execSync(`python "${script}"`, {
        encoding: "utf-8",
        cwd: WORKSPACE_ROOT,
        timeout: 60000,
        env: { ...process.env },
      });
      return { content: [{ type: "text", text: `Report generated.\n${output}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  }
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
