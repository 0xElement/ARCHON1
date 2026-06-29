# Executive Vision

ARCHON should become the open-source autonomous pentesting operating system for the security community.

It should not be a simple scanner wrapper. It should behave like a real security team that can understand an engagement, discover the attack surface, form hypotheses, assign specialist agents, validate evidence, and produce a professional report.

## Product identity

Keep the existing UI and operator workflow. The upgrade is backend intelligence.

The operator should provide:

- Scope
- Test type: black-box, static, white-box, or hybrid
- Source code, if available
- URLs and credentials, if available
- Rules of engagement
- Reporting preferences

After that, ARCHON should drive itself.

## North-star design

```text
Operator Prompt
   ↓
Mission Director
   ↓
Scope + Safety + Knowledge Graph
   ↓
Recon → Attack Plan → Specialists → Auditor → Judge → Report
   ↑                             ↓
   └────── Re-plan from evidence ─┘
```

## What makes ARCHON strong

1. Autonomous decision-making from a high-level prompt
2. Shared Knowledge Graph across all agents
3. Black-box, static, and white-box testing in one engagement
4. Three-phase source-code review
5. Pattern-based and freehand security review
6. Independent validation before reporting
7. Continuous evidence collection
8. Open-source extensibility for community agents and patterns
