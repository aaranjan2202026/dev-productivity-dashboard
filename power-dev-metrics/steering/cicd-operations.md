# CI/CD & Operations Metrics Workflow

## Overview
These metrics are automatically derived from your git history, Kiro token usage, and session tracking. No manual input required.

## GenAI Developer Activity Metrics
Visible at http://localhost:3001 in the "GenAI Developer Activity" panel.

| Metric | What It Measures | How It's Derived |
|--------|-----------------|-----------------|
| Development Cycle Time | Story start → code complete | Git commit frequency (recent vs baseline) |
| Code Generation Support | % of code AI-assisted | Kiro token usage / total tokens ratio |
| Throughput per Sprint | Lines/modules delivered | Git insertions in recent 2 weeks vs prior 2 weeks |
| Boilerplate Effort Reduction | Config/infra generation | Boilerplate file creation patterns (.json, .yaml, .hook, .md, .tf) |

### Scoring Logic
- **Score 3**: >50% improvement over baseline
- **Score 2**: >25% improvement over baseline
- **Score 1**: Any measurable improvement
- **Score 0**: No data or no improvement

## CI/CD & Operations Metrics
Visible at http://localhost:3001 in the "CI/CD & Operations" panel.

| Metric | What It Measures | How It's Derived |
|--------|-----------------|-----------------|
| CI/CD Config Generation | Pipelines, IaC, scripts via AI | Count of .yml/.yaml/.tf/.sh/.ps1/workflow files created |
| Deployment Readiness Time | Build → Production readiness | Time between commits (commit velocity) |
| Incident Resolution Support | AI-assisted RCA, fixes | Fix commits correlated with Kiro token usage |
| Ops Runbook Coverage | Auto-generated SOPs | Steering/hook/doc files created in git |

### Scoring Logic
- **CI/CD**: 3 if >15 configs, 2 if >8, 1 if any
- **Deploy Time**: 3 if >2 commits/hr, 2 if >0.5/hr, 1 if active
- **Incidents**: 3 if >5 AI-assisted fixes, 2 if >2, 1 if any
- **Runbooks**: 3 if >15 docs, 2 if >8, 1 if any

## How Data Flows
```
Git commits → server.js API → dashboard panels
Kiro sessions → token POST API → GenAI scores
File creation → git log analysis → CI/CD scores
```

## Increasing Your Scores
- **More commits** → improves Cycle Time and Throughput
- **Use Kiro more** → improves Code Generation Support (token tracking)
- **Create hooks/steering/configs** → improves CI/CD and Runbook Coverage
- **Fix bugs via Kiro** → improves Incident Resolution
- **Create IaC/pipeline files** → improves CI/CD Config Generation

## API Endpoints
- `GET /api/genai-activity` — returns GenAI Developer Activity scores
- `GET /api/genai-cicd` — returns CI/CD & Operations scores
- `GET /api/productivity` — returns GitHub productivity metrics
- `POST /api/tokens` — report token usage `{"agent":"kiro","tokens":N}`
- `POST /api/context` — report context usage `{"sessionId":"...","agent":"kiro","contextTokens":N,"maxTokens":200000}`
