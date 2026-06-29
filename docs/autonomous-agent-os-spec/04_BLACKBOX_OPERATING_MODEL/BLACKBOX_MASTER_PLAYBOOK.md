# Black-box Master Agent Playbook

## Purpose

Define how ARCHON black-box agents should work autonomously using the golden spine.

```text
Recon → Attack Plan → Specialists → Auditor → Judge → Report
```

## Black-box flow

```text
Scope Input
  ↓
Scope Governor
  ↓
Recon Squad
  ↓
Knowledge Graph Update
  ↓
Attack Planner
  ↓
Specialist Squads
  ↓
Evidence Packages
  ↓
Auditor
  ↓
Judge
  ↓
Report
  ↑
Re-plan if coverage is incomplete
```

## Master black-box agent responsibilities

The Black-box Master Agent coordinates all live testing tasks. It should not perform every test itself.

It decides:

- Which assets need recon
- Which endpoints need authentication context
- Which features need specialist review
- Which tests can run in parallel
- Which candidate findings need validation
- Which source-code tasks should be created in hybrid mode
- Which areas remain untested

## Black-box decision questions

For every discovered asset or feature, ask:

1. Does this require authentication?
2. Are there multiple roles or tenants?
3. Does it expose object identifiers?
4. Does it accept user-controlled input?
5. Does it fetch URLs or external resources?
6. Does it upload, import, export, or transform files?
7. Does it perform sensitive actions?
8. Does it expose admin or internal functionality?
9. Does it use API, GraphQL, WebSocket, or async flows?
10. Can this be chained with another weakness?

## Output from black-box testing

- Asset inventory
- URL table
- API route table
- Nmap/service table
- Technology table
- Authentication map
- Role/action matrix
- Candidate findings
- Confirmed findings
- Rejected hypotheses
- Evidence packages
- Coverage matrix
