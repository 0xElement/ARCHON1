# XSS and Client-Side Patterns

## XSS-001 Reflected XSS

Look for request parameters reflected into HTML without context-aware encoding.

## XSS-002 Stored XSS

Look for user content stored then rendered to other users without safe encoding/sanitization.

## XSS-003 DOM XSS

Look for unsafe sinks such as innerHTML-like behavior, dynamic script creation, location/hash usage, or unsafe template rendering.

## XSS-004 HTML injection

Look for rich text, markdown, logs, names, labels, errors, and notifications rendered as HTML.

## XSS-005 Sanitizer bypass risk

Look for custom sanitizers, allowlists, markdown transformations, SVG/MathML handling, or post-sanitization mutation.

## XSS-006 CSP weakness correlation

Look for injection plus CSP that allows inline/script gadget execution.

## XSS-007 Client-side template injection

Look for frontend frameworks rendering user-controlled expressions unsafely.
