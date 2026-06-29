# Full ARCHON Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                   ARCHON                                     │
│              Open-Source Autonomous Pentesting Operating System              │
└──────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────────┐
                         │     Operator Prompt      │
                         │ scope, creds, code, ROE  │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │    Mission Director      │
                         │ autonomous engagement AI │
                         └────────────┬─────────────┘
                                      ↓
┌─────────────────────────────────────┼─────────────────────────────────────┐
│                                     ↓                                     │
│                         ┌──────────────────────────┐                      │
│                         │  Scope + Safety Engine   │                      │
│                         └────────────┬─────────────┘                      │
│                                      ↓                                     │
│                         ┌──────────────────────────┐                      │
│                         │     Knowledge Graph      │                      │
│                         │ single source of truth   │                      │
│                         └────────────┬─────────────┘                      │
└─────────────────────────────────────┼─────────────────────────────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │          Recon           │
                         │ assets, URLs, ports, API │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │      Attack Planner      │
                         │ hypotheses + tasks       │
                         └────────────┬─────────────┘
                                      ↓
        ┌─────────────────────────────┼─────────────────────────────┐
        ↓                             ↓                             ↓
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ Black-box Squads │        │ Static SAST      │        │ White-box Squads │
│ live app testing │        │ pattern review   │        │ source reasoning │
└────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘
         ↓                           ↓                           ↓
        ┌──────────────────────────────────────────────────────────┐
        │            Correlation + Attack Chain Engine              │
        │ merges live proof, source evidence, hypotheses, chains    │
        └─────────────────────────────┬────────────────────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │         Auditor          │
                         │ independent validation   │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │          Judge           │
                         │ proof + scope + quality  │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │      Evidence Engine     │
                         │ requests, logs, code     │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │       Report Engine      │
                         │ professional deliverable │
                         └──────────────────────────┘
```

## Core backend components

| Component | Purpose |
|---|---|
| Mission Director | Owns the full engagement and decides next work |
| Scope Engine | Enforces in-scope boundaries |
| Safety Engine | Controls allowed actions and test intensity |
| Knowledge Graph | Stores assets, endpoints, code maps, hypotheses, evidence, and findings |
| Recon Engine | Builds the initial attack surface |
| Attack Planner | Converts facts into testable hypotheses |
| Specialist Squads | Execute focused testing by vulnerability class |
| Source Review Engine | Runs feature mapping, pattern review, and freehand review |
| Correlation Engine | Merges black-box and source-code evidence |
| Auditor | Independently validates candidate findings |
| Judge | Accepts or rejects findings based on quality gates |
| Evidence Engine | Stores reproducible proof |
| Report Engine | Continuously builds the final report |
