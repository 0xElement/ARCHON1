# Reporting Engine

The Report Engine should build the report continuously as validated evidence arrives.

## Report sections

- Executive summary
- Scope summary
- Testing methodology
- In-scope URL table
- Network/service inventory
- Source-code review coverage
- Black-box testing coverage
- Finding summary table
- Detailed findings
- Attack chains
- Evidence appendix
- Remediation summary
- Coverage limitations

## Detailed finding format

- Issue ID
- Title
- Severity
- CVSS
- CWE/OWASP mapping
- Affected asset
- Affected feature
- Description
- Impact
- Evidence
- Reproduction steps
- Root cause
- Recommendation
- References

## Continuous reporting rule

SCRIBE/Report Agent should not invent missing evidence. It should only assemble accepted findings and clearly label coverage limitations.
