# Black-box Agent Decision Tree

```text
New asset discovered
  ├── Is it in scope? no → discard and log
  └── yes
      ├── Identify service/technology
      ├── Is HTTP/API? yes → fingerprint routes and auth
      │   ├── Has login? → Auth Squad
      │   ├── Has roles/tenants/object IDs? → Authorization Squad
      │   ├── Has forms/query/body params? → Injection + XSS Squads
      │   ├── Has API schema/GraphQL? → API Squad
      │   ├── Has URL import/webhook? → SSRF Squad
      │   ├── Has upload/download? → File Handling Squad
      │   └── Has sensitive workflow? → Business Logic Squad
      └── Non-HTTP service → Infrastructure Squad
```

## Prioritization model

High priority if:

- Authenticated sensitive feature
- Admin or privileged functionality
- Multi-tenant data model
- Financial/business operation
- File processing
- URL fetching/integration
- Source-code evidence exists
- Multiple weak signals correlate

Medium priority if:

- Public endpoint with input handling
- API endpoint with object identifiers
- Interesting technology fingerprint

Low priority if:

- Static content
- No input or state change
- Already tested duplicate path
