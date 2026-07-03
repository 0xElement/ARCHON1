# Access-Control / IDOR Canonical 40-Pattern Catalog

Use these exact IDs and names.

Do not rename them.

Every Phase 2 access-control feature report must include all 40 rows — each with a Result Value
(see the end of this file). This catalog is language- and framework-agnostic: the greps use
POSIX-ish syntax; translate the regex and directory hints to whatever the target uses
(`src/`, `app/`, `pkg/`, `internal/`, `routes/`, `handlers/`, `services/`, `resolvers/`, …).

Each pattern below carries three things:
- **Detection signature** — multi-language greps that surface the code shape.
- **Auth-vs-fetch flow** — where the object is fetched vs where the authorization gate is (or should be).
- **Confirmation** — the conjunction of conditions that must ALL hold for it to be real, plus the
  upstream defense that makes it safe (so you can reject false positives).

Generic vocabulary used throughout (de-branded, applies to any app):
`record`/`ticket`/`document` (a leaf object), `change-request`/`pull-request` (a proposed change),
`parent-object` (a container of records), `container`/`tenant`/`org` (isolation boundary),
`worker`/`async-job`/`job-context token` (background execution + its credential),
`duplicate`/`source-reference` (a copy that links back to an origin),
`protected-ref`/`ref-override`/`push-hook` (version-control protection primitives),
`authorization-rules file` (owners/approvers manifest). Ownership abstractions
(`user_id`, `current_user`, `owner_id`, `tenant_id`, `org_id`, `account_id`) are already generic.
Use `example.com` / `attacker.example.com` and `victim@example.com` / `attacker@example.com` in PoCs.

## Index — all 40 IDs (exact names, do not rename)

| Pattern | Canonical Name |
|---|---|
| Pattern K | DECLARATIVE AUTH WITH NO ACTUAL ENFORCEMENT |
| Pattern A | EARLY RETURN SKIPS AUTHORIZATION |
| Pattern P | PROCESS IDENTITY SPOOFING |
| Pattern O | MULTI-STEP WORKFLOW APPROVAL BYPASS |
| Pattern L | ENFORCEMENT GAP ACROSS ENTRY POINTS |
| Pattern S | TOKEN SCOPE BOUNDARY LEAKS |
| Pattern B | UNSCOPED OBJECT LOOKUP |
| Pattern C | CONTAINER-LEVEL AUTH ON RESOURCE ENDPOINT |
| Pattern D | ACTION ENDPOINT RETURNS OBJECT WITHOUT AUTHORIZATION |
| Pattern E | MULTI-INTERFACE AUTHORIZATION MISMATCH |
| Pattern F | ROLE/PERMISSION ESCALATION VIA PARAMETER |
| Pattern G | CROSS-BOUNDARY VIA SHARED/IMPORTED MEMBERSHIP |
| Pattern H | FEATURE-DISABLED BUT DATA ACCESSIBLE |
| Pattern I | EXISTENCE ORACLE VIA ERROR DIFFERENTIATION |
| Pattern J | ASYNC JOB BYPASSES AUTHORIZATION |
| Pattern M | PERMISSION CHAIN / CUSTOM ROLE ESCALATION |
| Pattern N | IMPORT/BULK OPERATION SKIPS MODEL VALIDATIONS |
| Pattern Q | FORK/CLONE-BASED PERSISTENT ACCESS AFTER REVOCATION |
| Pattern R | CONTENT RENDERING CROSS-REFERENCE DATA LEAK |
| Pattern T | GIT/VCS-LEVEL OPERATIONS BYPASS APPLICATION AUTH |
| Pattern U | PROXY ENDPOINT HEADER/RESPONSE PASSTHROUGH |
| Pattern V | CREDENTIAL PERSISTENCE ON DESTINATION CHANGE |
| Pattern W | DERIVED TOKEN LIFETIME EXCEEDS PARENT |
| Pattern X | UNVERIFIED IDENTITY ATTRIBUTE MATCHING |
| Pattern Y | FORMAT/INTERFACE RESPONSE DIVERGENCE |
| Pattern Z | AI/LLM CONTEXT AUTHORIZATION BYPASS |
| Pattern 27 | SERVICE ACCOUNT / BOT PRIVILEGE LAUNDERING |
| Pattern 28 | RACE CONDITION / TOCTOU IN AUTHORIZATION |
| Pattern 29 | CACHED / STALE AUTHORIZATION DECISIONS |
| Pattern 30 | SOFT-DELETE / ARCHIVE / LIFECYCLE STATE BYPASS |
| Pattern 31 | DELEGATION / IMPERSONATION ABUSE |
| Pattern 32 | TRANSFER SOURCE-VS-DESTINATION AUTHORIZATION GAP |
| Pattern 33 | MASS ASSIGNMENT / OVER-POSTING BEYOND ROLE |
| Pattern 34 | TRANSACTION / PAYMENT FLOW AUTHORIZATION BYPASS |
| Pattern 35 | AUDIT LOG EVASION / INTEGRITY |
| Pattern 36 | DATA EXPORT / BULK ACCESS OVER-FETCH |
| Pattern 37 | GRAPHQL-SPECIFIC AUTHORIZATION GAPS |
| Pattern 38 | MULTI-TENANT SHARED INFRASTRUCTURE LEAKAGE |
| Pattern 39 | WEBHOOK / NOTIFICATION DATA OVER-EXPOSURE |
| Pattern 40 | PRIVILEGE ESCALATION VIA OBJECT RELATIONSHIP MANIPULATION |

---

## Pattern K — DECLARATIVE AUTH WITH NO ACTUAL ENFORCEMENT (highest priority)

An endpoint carries a declarative authorization annotation that LOOKS correct but does not enforce
user-level permission. The annotation may control something else entirely (token scoping, API-doc
generation, rate-limit bucket) while the real user-level check — the imperative `authorize!` /
`check_permission` call — is simply absent from the handler. It reads as safe on casual inspection
because the annotation IS there and the permission name IS specified.

**Detection signature (grep):**
```
# declarative annotations (adapt to framework)
grep -rn "@PreAuthorize\|@RolesAllowed\|@Secured\|@RequiresPermission\|@authorize\|route_setting.*auth\|permission_classes\|before_action.*auth" routes/ controllers/ api/ resolvers/
# imperative checks that SHOULD also be present in the handler body
grep -rn "authorize!\|check_permission\|require_permission\|can?\|isAllowed\|hasAuthority\|Gate::allows\|@permission_required" controllers/ handlers/ resolvers/
# the enforcement layer itself — does the annotation call a policy, or is it metadata?
grep -rn "class.*Authorization.*Middleware\|def.*check_permission\|AccessDecision\|def enforce" middleware/ lib/
```
Cross-reference: endpoints WITH a declarative annotation but WITHOUT any imperative check = candidates.

**Auth-vs-fetch flow:** The route declares a permission; the framework reads the annotation but only
uses it for scoping/metadata; the handler fetches and returns the object with no policy call in between.
The gate that should sit *between* fetch and response does not exist at the user-permission layer.

**Confirmation (all must hold):** (a) the annotation is metadata-only OR references a permission that is
undefined / defined at the wrong scope; (b) the handler contains no imperative user-level check; (c) an
authenticated low-privilege caller invokes the endpoint and succeeds. Also test the framework's fail
mode: declare an undefined permission — **fail-open** (undefined ⇒ allowed) turns every typo into a
bypass; **fail-closed** (undefined ⇒ denied) breaks the endpoint for everyone (not this bug).
**Safe when** the framework provably enforces the annotation as a user gate (raises/denies on failure)
*or* the handler has an imperative check that runs before any data is returned.

---

## Pattern A — EARLY RETURN SKIPS AUTHORIZATION (highest priority)

A handler/service returns early on a "no-op" or "same target" condition, and the authorization checks
that live *after* the early return never run — but the early-return path still serializes the object.
An unauthorized caller who gets 404 on a normal GET can get 200 with full data on the action endpoint.

**Detection signature (grep):**
```
grep -rn "return.*if\|return.*unless\|return early\|return success\|return\b.*obj" services/ handlers/ usecases/
grep -rn "same_\|no_change\|already_\|noop\|no-op\|unchanged\|identical\|equal" services/ handlers/
grep -rn "skip.*auth\|short.circuit\|bypass" services/ controllers/ handlers/
# other langs: `return obj` / `return Ok(obj)` / `c.JSON(200, obj)` before any can()/authorize
```

**Auth-vs-fetch flow:** API handler fetches the object with an UNSCOPED lookup → service checks
"is this a no-op?" (source == destination, no field changed) → returns the object *before* the
authorization branch further down → API serializes whatever the service returned.

**Confirmation — three-way conjunction (ALL true):** (a) object fetched WITHOUT a read-permission check;
(b) service returns early BEFORE authorization is verified; (c) the API SERIALIZES and returns that
object. If any one is missing, it is safe. Trigger it by self-referencing the action (move to same
container, transfer to current owner, update with no changed fields). **Safe when** the fetch is scoped
(policy-filtered) so an unauthorized caller 404s before the service runs, OR the early return returns a
bare status with no object body, OR authorization runs before the no-op check.

---

## Pattern P — PROCESS IDENTITY SPOOFING

An automated process (async-job / automation run / webhook-triggered task) executes under some user's
identity, and the attacker controls the input that decides *which* identity. The process then issues a
job-context token or OIDC/JWT carrying the victim's permissions, which the attacker rides to reach the
victim's resources.

**Detection signature (grep):**
```
grep -rn "trigger_user\|triggered_by\|run_as\|acting_user\|on_behalf\|mirror_user\|automation_user" services/ jobs/
grep -rn "id_token\|jwt_claim\|oidc\|sub.*claim\|issue.*token\|job.*token" services/ lib/
grep -rn "after_merge\|post_action\|post_merge\|re.?target\|delete_source_reference\|close_on" services/
# author/committer attribution taken from submitted change metadata (attacker-controlled)
grep -rn "author\|committer\|commit_email\|import.*author\|payload.*user" services/ lib/
```

**Auth-vs-fetch flow:** The "who triggered this?" decision is derived from attacker-influenced data
(the author/committer field of a submitted change, an import payload, a webhook body, a mirror/sync
config). The process assumes that identity and mints a credential — the authorization gate is on the
wrong side of an untrusted input.

**Confirmation (all must hold):** (a) the triggering identity is chosen from data the attacker can set;
(b) the process runs with that identity's privileges (token/claims carry them); (c) the attacker reaches
resources they otherwise cannot. **Safe when** the process identity is derived from an authenticated,
verified principal (not from submitted/imported metadata) and issued tokens are scoped to the triggering
context, not to an arbitrary user.

---

## Pattern O — MULTI-STEP WORKFLOW APPROVAL BYPASS

An approval/review workflow validates content at one instant but fails to re-validate when the underlying
content changes afterward. The attacker gets approval on safe content, then swaps in malicious content
while the stale approval rides along to merge/deploy/publish.

**Detection signature (grep):**
```
grep -rn "approval.*remove\|reset_approval\|invalidate_approval\|remove_all_approvals\|approved_by\|approval.*persist" services/ models/
grep -rn "authorization-rules\|owners_file\|approval_rule\|required_approvers\|code_owner" services/ config/
grep -rn "head_sha\|source_sha\|approved_sha\|diff_sha\|target_ref_changed\|base_changed" services/ models/
grep -rn "force.?update\|force.?push\|amend\|reopen\|re.?target\|recreate.*ref" services/ models/
```

**Auth-vs-fetch flow:** Approval is recorded against the change-request object (or a rule) rather than
against the exact reviewed diff/commit SHA. The gate fires at approval time; nothing re-checks that the
content at execution time equals the approved content.

**Confirmation (all must hold):** (a) approval is tied to the change-request, not to an immutable
content hash; (b) an event changes the content without clearing approval — re-target the base ref,
force-update the source ref, recreate a deleted source ref from a malicious one, merge a second change
into the source, or collide a tag with a protected-ref name to confuse resolution; (c) the modified
content executes under the stale approval. **Safe when** approval is bound to the approved commit SHA and
any content change (new commits, base/target change, force-update) resets all approvals before execution.

---

## Pattern L — ENFORCEMENT GAP ACROSS ENTRY POINTS

Different entry points (REST, GraphQL-over-HTTP, WebSocket/subscriptions, background workers, queue
consumers) enforce different subsets of the access-control policy. A user blocked on the strict entry
point reaches the same data through a lax one.

**Detection signature (grep):**
```
# HTTP-level gates that non-HTTP paths often omit
grep -rn "blocked\|deactivated\|banned\|password_expired\|terms_accepted\|require_mfa\|sso_enforced\|ip_restrict" middleware/ controllers/
# WebSocket / subscription connection auth
grep -rn "on_connect\|onConnect\|connect\b\|authenticate\|authorize" channels/ websocket/ ws/ hub/ subscriptions/
# worker / consumer auth
grep -rn "current_user\|authorize\|permission\|check_access" workers/ jobs/ consumers/
```

**Auth-vs-fetch flow:** The HTTP controller stacks authentication + authorization + blocked-user +
SSO-session + IP + terms + password-expiry + MFA. The WebSocket connection may check only token
validity; the worker may run as system context with none of these. Same data, weaker gate.

**Confirmation (all must hold):** (a) two entry points reach the same object/action; (b) one enforces a
control the other omits (commonly: blocked-user, SSO session, IP allowlist, MFA, rate limit); (c) a
restricted principal succeeds via the weak path. Also test the same entry point with different credential
types — a non-browser token (personal/deploy/job-context/trigger/feed) may skip SSO or IP checks that
only look at browser sessions. **Safe when** every entry point and credential type funnels through one
shared authorization routine that applies the identical checks.

---

## Pattern S — TOKEN SCOPE BOUNDARY LEAKS

A token (job-context, deploy, service, personal-access) has an intended scope, but some consumer path
does not fully enforce it, letting the token reach out-of-scope resources.

**Detection signature (grep):**
```
grep -rn "token.*scope\|job.?token\|deploy.?token\|service.?token\|access.?token\|scopes\b" services/ lib/ policies/
grep -rn "rotate.*token\|refresh.*token\|regenerate\|renew.*token" services/ controllers/
grep -rn "artifact.*public\|artifact.*download\|private.*download\|alt.*download" services/ controllers/
grep -rn "protected.*variable\|predefined.*variable\|override.*variable\|scheduled" services/ models/
```

**Auth-vs-fetch flow:** Token minted with scope X; the primary consumer enforces X; an alternate consumer
(a second download endpoint, a rotation path, a cross-container fetch) authorizes on token validity alone
and never re-checks scope, so the fetch escapes the intended boundary.

**Confirmation (all must hold):** (a) the token carries a documented scope restriction (container-scoped,
read-only, endpoint-limited); (b) at least one consumer path omits the scope check; (c) the token reaches
a resource outside its scope through that path. Watch rotation: does the rotated token inherit the
*original* scope or the *rotator's* (possibly broader) privileges? **Safe when** scope is enforced
centrally at every consumer and rotation preserves the original scope, never the caller's.

---

## Pattern B — UNSCOPED OBJECT LOOKUP

The endpoint fetches an object by ID without filtering by the caller's permissions, so it can return
objects the caller must not see (private, confidential, other-tenant). Even a parent-scoped lookup is
insufficient when the object has its own visibility flag.

**Detection signature (grep):**
```
# raw by-id lookups in the request-handling layer
grep -rn "findById\|find_by\|findOne\|get_object\|\.find(\|load(\|fetch(" controllers/ resolvers/ api/ handlers/
# then confirm: is it wrapped by a scope/policy, and is there a per-object visibility check after fetch?
grep -rn "policy_scope\|accessible_by\|visible_to\|for_user\|where.*user\|where.*tenant" finders/ repositories/ models/
```
See the Scoped-vs-Unscoped table at the end for per-language shapes.

**Auth-vs-fetch flow:** Lookup keyed on ID (or ID + parent) with no user/tenant predicate and no
post-fetch visibility check. The gate that should filter rows (or reject the object) is missing on the
fetch itself.

**Confirmation (all must hold):** (a) the lookup has no ownership/tenant predicate; (b) either there is
no policy scope OR the object carries a visibility flag that is not checked after fetch; (c) the caller
receives an object their role should not see. **Safe when** the query is scoped through a policy/tenant
filter, OR a post-fetch check compares the object's visibility level against the caller's permission.

---

## Pattern C — CONTAINER-LEVEL AUTH ON RESOURCE ENDPOINT

The endpoint checks permission on the parent-object / container (org, tenant, parent-object) but not on
the specific child record, which carries a restricting flag (confidential, private, draft, restricted).
The caller legitimately sees the container but should not see this particular child.

**Detection signature (grep):**
```
grep -rn "authorize.*read_container\|authorize.*read_parent\|authorize.*read_org\|hasAccess\|checkAccess\|can?(:read, parent" controllers/ resolvers/
# then confirm a SEPARATE check on the child's own visibility exists
grep -rn "confidential\|private\|draft\|restricted\|hidden\|internal" models/ policies/ serializers/
```

**Auth-vs-fetch flow:** Gate = "can you read the container?"; fetch = child by ID within that container;
missing gate = "can you read *this* child given its visibility flag?".

**Confirmation (all must hold):** (a) authorization is asserted against the container/parent only;
(b) the child has an independent visibility/restriction flag; (c) that flag is not evaluated against the
caller before the child is returned. **Safe when** the policy for the child explicitly checks its
visibility level for the caller, in addition to container access.

---

## Pattern D — ACTION ENDPOINT RETURNS OBJECT WITHOUT AUTHORIZATION

A write endpoint (move, clone, transfer, reorder, update, assign, link) authorizes the *action* but
always serializes and returns the object — even when the action fails or the caller lacks permission.
The action is gated; the response body leaks the data anyway.

**Detection signature (grep):**
```
grep -rn "serialize\|toJSON\|as_json\|present\|render.*json\|respond_with\|marshal\|c.JSON" controllers/ api/ handlers/
# inspect POST/PUT/PATCH handlers: do they return the object even on the error branch?
grep -rn "rescue\|catch\|except\|if.*error\|unless.*success" controllers/ handlers/
```

**Auth-vs-fetch flow:** Fetch object → call service → serialize object into response regardless of the
service's success/failure or the caller's permission. The action gate never guards the response path.

**Confirmation (all must hold):** (a) a POST/PUT/PATCH handler fetches an object; (b) it serializes that
object into the response on the failure/forbidden branch too; (c) the serialized body contains data the
caller cannot read via GET. **Safe when** the handler returns only a status/error (no object body) when
the action is not authorized, and serialization is reached only after the permission check passes.

---

## Pattern E — MULTI-INTERFACE AUTHORIZATION MISMATCH

The same object or field has different authorization rules depending on which interface exposes it. One
interface hides a field; another exposes it. Common between REST serializers and GraphQL types, and
between HTTP controllers and WebSocket channels.

**Detection signature (grep):**
```
# compare field lists across interfaces for the same model
grep -rn "serialize\|attributes\|fields\|expose\|only:\|except:" serializers/ presenters/ api/
grep -rn "field \|t.field\|GraphQLField\|type .* {" graphql/ schema/ resolvers/
# compare connection auth across HTTP vs WebSocket vs worker
grep -rn "authenticate\|authorize\|current_user" controllers/ channels/ websocket/ workers/
```

**Auth-vs-fetch flow:** Interface A applies a serializer that omits/gates a field; interface B (GraphQL
type, WebSocket payload, alternate serializer) exposes the same field with no equivalent gate.

**Confirmation (all must hold):** (a) two interfaces surface the same underlying field/object; (b) one
gates or omits it, the other does not; (c) the caller reads the restricted field via the lax interface.
WebSocket connections especially skip blocked-user / deactivated / terms / password-expiry checks that
HTTP enforces. **Safe when** authorization is centralized on the model/policy layer so every interface
inherits identical field- and object-level rules.

---

## Pattern F — ROLE/PERMISSION ESCALATION VIA PARAMETER

An endpoint accepts a role/permission/ownership value as a user-controlled parameter without verifying
the caller is allowed to *set* that value.

**Detection signature (grep):**
```
grep -rn "role\|access_level\|permission\|is_admin\|isAdmin\|owner_id\|tenant_id\|org_id" controllers/ handlers/ | grep -i "param\|body\|input\|request\|dto"
grep -rn "params\.permit\|strong_param\|ModelState\|ShouldBind\|serializer.*fields\|@RequestBody" controllers/
```

**Auth-vs-fetch flow:** Request supplies `role=owner` / `owner_id=<self>`; the handler binds and persists
it; the gate that should verify "may the caller grant THIS value?" is absent.

**Confirmation (all must hold):** (a) a privilege- or ownership-determining field is settable from input;
(b) the code does not verify the caller may assign that specific value (e.g., cannot grant a role above
their own); (c) the persisted value escalates the attacker or reassigns ownership to them. **Safe when**
the handler caps assignable values to the caller's own level and re-derives ownership server-side.

---

## Pattern G — CROSS-BOUNDARY VIA SHARED/IMPORTED MEMBERSHIP

Sharing a resource with another team/container, or importing members, bypasses restrictions that the
normal direct-membership path enforces (invite locks, role caps, tenant boundaries).

**Detection signature (grep):**
```
grep -rn "import.*member\|share.*container\|share.*group\|transfer.*member\|invite.*bulk" services/
grep -rn "importing.*true\|skip_validation\|skip_authorization\|bulk.*true" services/ lib/ src/
```

**Auth-vs-fetch flow:** Direct add runs role-hierarchy + invite-restriction validations; the share/import
path sets a bypass flag or a different code route that skips them, granting access the direct path would
refuse.

**Confirmation (all must hold):** (a) a share/import/transfer path grants membership or access; (b) it
does not enforce the same restrictions as direct add (role cap, invite lock, tenant boundary); (c) the
resulting access exceeds what the caller could grant directly. **Safe when** every membership-granting
path runs the same validations and caps granted access to the granter's own level.

---

## Pattern H — FEATURE-DISABLED BUT DATA ACCESSIBLE

A feature is disabled at the record/container level, yet data from that feature is still reachable
through a parent-level, global, search, or aggregation endpoint that ignores the child-level toggle.

**Detection signature (grep):**
```
grep -rn "feature.*disabled\|module.*disabled\|is_enabled\|feature_flag\|feature_available" models/ policies/
# then check parent-level list/search/aggregate endpoints for the same toggle
grep -rn "search\|aggregate\|dashboard\|global\|cross.*container" controllers/ finders/
```

**Auth-vs-fetch flow:** The disable check is enforced only on the feature's own endpoints; parent/global
aggregators query the underlying data directly without consulting the toggle.

**Confirmation (all must hold):** (a) a feature is disabled at some scope; (b) a broader endpoint returns
that feature's data without checking the toggle; (c) the caller obtains data the disable was meant to
withhold. **Safe when** the toggle is enforced at the data/policy layer so every aggregating path
respects it.

---

## Pattern I — EXISTENCE ORACLE VIA ERROR DIFFERENTIATION

The endpoint returns distinguishable responses for "does not exist" vs "exists but forbidden", letting an
attacker enumerate valid IDs and infer restricted content.

**Detection signature (grep):**
```
grep -rn "not_found\|404\|NotFound\|ObjectNotFound" controllers/ handlers/
grep -rn "forbidden\|403\|unauthorized\|access_denied\|401" controllers/ handlers/
# action endpoints: the target/destination param is often looked up raw
grep -rn "destination_id\|target_id\|to_container\|move.*to\|target_ref" controllers/ services/
```

**Auth-vs-fetch flow:** Missing object → 404; existing-but-forbidden → 403 (or a different message/timing).
The differentiation itself is the leak. Action endpoints leak the *target* param the same way.

**Confirmation (all must hold):** (a) the response distinguishes non-existent from forbidden (status,
body, or timing); (b) IDs/targets are enumerable; (c) the distinction reveals existence or attributes of
restricted resources. **Safe when** both cases return an identical response (same status, same body,
comparable timing) — typically a uniform 404.

---

## Pattern J — ASYNC JOB BYPASSES AUTHORIZATION

A worker/async-job processes an action without re-checking permission. Permission was verified at enqueue
time, but by execution time the caller may have lost access — or the job runs as system context with no
restriction at all.

**Detection signature (grep):**
```
grep -rn "perform_async\|perform_later\|enqueue\|dispatch\|publish\|send_message\|delay\|goroutine\|Task.Run" services/ controllers/
# in the worker body: is there any re-check, or does it act on the object id blindly?
grep -rn "current_user\|authorize\|permission\|check_access\|skip_authorization" workers/ jobs/ consumers/
```

**Auth-vs-fetch flow:** Handler authorizes then enqueues `{object_id, maybe user_id}`; the worker fetches
the object by ID and acts, with no gate between fetch and act — often as a system principal.

**Confirmation (all must hold):** (a) the worker performs a permission-relevant action; (b) it does not
re-check the original caller's permission at execution time; (c) the caller's access could have changed
(revoked/blocked) between enqueue and run, or the worker's system identity exceeds the caller's. **Safe
when** the worker re-authorizes as the original principal at execution time (and handles the "principal
lost access" case).

---

## Pattern M — PERMISSION CHAIN / CUSTOM ROLE ESCALATION

A custom role or granular permission unintentionally grants access to unrelated features, via either a
policy chain or an overly-coarse backend gate.

**Detection signature (grep):**
```
grep -rn "custom_role\|custom_permission\|define_role\|create_role\|grant.*permission" config/ models/ schemas/
# controller-level (coarse) vs action-level (granular) checks
grep -rn "before_action.*can\|@PreAuthorize.*hasAuthority\|authorize.*settings\|require_permission" controllers/
```

**Auth-vs-fetch flow:** *Chain:* permission A enables gate G which enables permission B — granting A
silently grants B. *Coarse gate:* one narrow permission is checked at the controller level, but the
controller handles many unrelated actions, so passing the check unlocks all of them.

**Confirmation (all must hold):** (a) a narrow permission is granted; (b) either a policy rule chains it
to an unrelated permission, or a single coarse check gates a multi-action controller/settings page;
(c) the holder performs actions outside the intended narrow scope. **Safe when** permission checks are
granular (per-action) and policy rules do not transitively enable unrelated capabilities.

---

## Pattern N — IMPORT/BULK OPERATION SKIPS MODEL VALIDATIONS

Import, bulk, and migration paths set a flag that disables the model-level validations which normally
block privilege escalation (e.g., "cannot add a member above your own role").

**Detection signature (grep):**
```
grep -rn "unless.*importing\|unless.*skip\|unless.*bulk\|if.*importing\|if.*skip_valid" models/ services/
grep -rn "importing.*=.*true\|skip_validation.*=.*true\|bulk.*=.*true\|validate:.*false\|save(validate: false)" services/ workers/
grep -rn "skip_authorization\|skip_callbacks\|without_validation\|force_create" services/ workers/ jobs/
```

**Auth-vs-fetch flow:** Normal create runs validations that cap role/visibility to the actor's level; the
import path sets `importing=true`/`skip_validation=true`, so those validations never run and any value is
persisted.

**Confirmation (all must hold):** (a) an import/bulk path disables model validations; (b) a non-admin can
trigger that path; (c) it persists a role/visibility/permission value higher than the actor could set
normally. **Safe when** import re-validates permission-bearing fields against the importer's actual role
(caps to their level) even under the bulk flag.

---

## Pattern Q — FORK/CLONE-BASED PERSISTENT ACCESS AFTER REVOCATION

A duplicate/source-reference relationship creates a persistent data channel back to the origin that
survives permission revocation, visibility change, or user removal.

**Detection signature (grep):**
```
grep -rn "sync\|source_reference\|copied_from\|duplicate_of\|upstream\|fetch_as_mirror\|compare.*source" services/ models/
grep -rn "allow_collaboration\|cross_copy\|contribution_flag\|source_container.*duplicate" services/ models/
grep -rn "visibility.*change\|went_private\|revoke.*access\|remove.*member" services/ models/ workers/
```

**Auth-vs-fetch flow:** The duplicate keeps a link to the origin's object store; sync/compare/collaboration
endpoints read from the origin but check permission against the *duplicate*, not the origin's *current*
visibility.

**Confirmation (all must hold):** (a) a duplicate retains a channel to the origin (sync, compare,
collaboration flag, job-context token claim); (b) the origin's access was revoked or made private;
(c) the caller still reads new origin data through the duplicate. **Safe when** every duplicate-channel
operation re-checks the caller's *current* access to the origin, and revocation/visibility-change hooks
re-evaluate or sever duplicate links.

---

## Pattern R — CONTENT RENDERING CROSS-REFERENCE DATA LEAK

A rendering pipeline (Markdown, rich text, templating) resolves cross-resource references and inlines the
referenced resource's metadata (title, description) without checking the *viewer's* permission to each
referenced resource.

**Detection signature (grep):**
```
grep -rn "ReferenceFilter\|cross_reference\|reference_pattern\|resolve_reference\|render_markdown\|autolink" lib/ services/
grep -rn "redact\|filter_visible\|visible_to\|authorize.*reference\|can_read.*ref" lib/ services/
grep -rn "ai_summary\|summarize\|assistant.*context\|edit_history\|version.*diff" services/ lib/
```

**Auth-vs-fetch flow:** Attacker embeds a reference to a private record in accessible content; the
renderer resolves it and fetches the private record's metadata; the rendered output is served to viewers
of the container without a per-reference visibility gate.

**Confirmation (all must hold):** (a) rendering resolves cross-references and inlines referenced metadata;
(b) it does not check the viewer's access to each referenced resource; (c) private metadata appears in an
accessible context. Also applies to edit-history/diff views and AI summaries that render references.
**Safe when** the pipeline redacts references the current viewer cannot access.

---

## Pattern T — GIT/VCS-LEVEL OPERATIONS BYPASS APPLICATION AUTH

Version-control protocol operations act below the application's authorization layer, so a low-level
manipulation can bypass application-enforced protections (branch protection, review, approval).

**Detection signature (grep):**
```
# low-level ref namespaces + protection primitives
grep -rn "ref-override\|refs/notes\|refs/meta\|replace.*ref\|ambiguous.*ref\|disambiguate" services/ lib/
grep -rn "protected-ref\|protected_tag\|branch_protection\|push.?hook\|pre.?receive\|update_hook" services/ lib/ hooks/
grep -rn "mirror.*pull\|sync.*ref\|import.*ref\|shared.*cache\|cache.*volume\|fallback.*cache" services/ runners/ config/
```

**Auth-vs-fetch flow:** The app enforces protection at its own layer; a protocol-level op (ref-override
substitution, tag/branch name collision, mirror pull that skips target-side protection, shared-cache
poisoning) mutates the object store directly, and the app only observes the result afterward.

**Confirmation (all must hold):** (a) a protocol-level operation reaches the object store; (b) it is not
subjected to the application's protection rules (protected-ref, review, approval) at that layer; (c) the
result bypasses a control the app believed it enforced. **Safe when** server-side push-hooks enforce
protected-ref and approval rules at the protocol layer, ref namespaces are restricted, and mirror/sync
applies target-side protections.

---

## Pattern U — PROXY ENDPOINT HEADER/RESPONSE PASSTHROUGH

A proxy/relay endpoint forwards upstream response headers and body to the client verbatim. When the
upstream URL is user-configurable, the attacker's server returns malicious headers/body served under the
application's origin.

**Detection signature (grep):**
```
grep -rn "proxy\|forward\|relay\|passthrough\|upstream\|reverse_proxy" controllers/ middleware/ routes/
grep -rn "response.headers\|set_header\|copy_header\|forward_header\|WriteHeader\|res.set(" services/ lib/
grep -rn "dependency_proxy\|registry_proxy\|integration.*proxy\|monitoring.*proxy\|artifact.*serve" services/
```

**Auth-vs-fetch flow:** Client → proxy adds credentials → upstream (attacker-controlled URL) → response
headers/body forwarded to client with no allowlist. The trust boundary is crossed at the response-copy
step.

**Confirmation (all must hold):** (a) the endpoint proxies to a user-configurable URL; (b) upstream
response headers/body reach the client without an allowlist; (c) the attacker injects a dangerous header
or body (Set-Cookie, Location, NEL/Report-To, Content-Type→HTML, cache-control) under the app origin.
**Safe when** the proxy strips/allowlists response headers and does not trust the upstream Content-Type
for browser rendering.

---

## Pattern V — CREDENTIAL PERSISTENCE ON DESTINATION CHANGE

An integration/webhook/service stores a URL alongside a credential; changing the URL without clearing the
credential lets an attacker redirect authenticated requests (and the secret) to their own server.

**Detection signature (grep):**
```
grep -rn "integration\|webhook\|service.*config\|connection.*setting\|endpoint.*config" models/ services/
grep -rn "token\|password\|secret\|api_key\|credential" models/ services/ | grep -i "url\|endpoint\|host"
grep -rn "update.*url\|change.*url\|modify.*endpoint\|before_save\|on_url_change" services/ controllers/
grep -rn "rotate\|regenerate\|renew" services/ controllers/ | grep -i "token\|key\|secret"
```

**Auth-vs-fetch flow:** Stored `{url, secret}` pair; the update handler changes `url` but leaves `secret`
intact; the next outbound call sends `secret` to the new (attacker) URL. No gate re-validates the
destination against the stored secret.

**Confirmation (all must hold):** (a) a URL + credential pair is stored together; (b) changing the URL
does not clear or require re-entry of the credential; (c) a subsequent request sends the credential to
the attacker-set URL (test/verify buttons count). Also check the inverse — credential rotation returning
the new value to a lower-privileged caller. **Safe when** any URL change clears the stored credential (or
forces re-entry), and rotation requires equal-or-higher privilege and does not echo the new secret to
under-privileged callers.

---

## Pattern W — DERIVED TOKEN LIFETIME EXCEEDS PARENT

A token derived from another (session → API token → short-lived service token) keeps working after the
parent is revoked, for the remainder of the derived token's independent TTL.

**Detection signature (grep):**
```
grep -rn "issue_token\|generate_token\|create_token\|mint\|sign_jwt\|exchange_token" services/ lib/
grep -rn "expires_in\|ttl\|lifetime\|valid_for\|max_age" services/ lib/ | grep -i "token\|jwt\|bearer"
grep -rn "revoke\|invalidate\|deactivate\|block" services/ | grep -i "cascade\|propagate\|all_tokens\|derived"
```

**Auth-vs-fetch flow:** Token A mints Token B with its own TTL; revoking A (block/password-change/delete)
does not touch B; B remains valid until its TTL expires. No cascade gate links B's validity to A's.

**Confirmation (all must hold):** (a) one credential derives another with an independent TTL; (b) parent
revocation does not revoke the derived token; (c) the derived token still grants access after revocation.
Check chaining (B mints C). **Safe when** revocation/blocking/password-change cascades to all derived
tokens (or derived tokens are validated against the parent's live state on each use).

---

## Pattern X — UNVERIFIED IDENTITY ATTRIBUTE MATCHING

The app matches identities on an attribute (email, username, external ID) that is not verified as
belonging to the claimed user. An attacker claims an unverified attribute and receives access meant for
the real owner.

**Detection signature (grep):**
```
grep -rn "find_by.*email\|lookup.*email\|match.*email\|invitation.*email\|by_username" models/ services/
grep -rn "verified\|confirmed\|unverified\|secondary.*email\|is_primary" models/ services/
grep -rn "external_identity\|saml.*email\|scim.*email\|oidc.*claim\|external_uid" services/ lib/
grep -rn "service.*account.*email\|bot.*email\|machine.*user\|predictable" models/ config/
```

**Auth-vs-fetch flow:** Invitation/link/permission is matched on `email`/`external_id`; the query
searches unverified attributes too; the gate that should require a *verified* attribute is missing.

**Confirmation (all must hold):** (a) identity matching uses an attribute the attacker can set on their
own account; (b) matching does not require the attribute to be verified/confirmed; (c) the attacker
receives access/invitation intended for the real owner. Also: predictable service-account identifiers
that can be pre-claimed. **Safe when** matching considers only verified/confirmed attributes and
federated identities are validated before linking.

---

## Pattern Y — FORMAT/INTERFACE RESPONSE DIVERGENCE

The same data returns different detail depending on response format. The primary format (HTML) restricts
correctly, but an alternate format (JSON, Atom/RSS, CSV, patch) or embedded markup leaks restricted data.

**Detection signature (grep):**
```
grep -rn "respond_to\|format.json\|format.xml\|format.atom\|render json\|produces" controllers/
grep -rn "data-.*=\|dataset\.\|data_attributes\|json_encode.*window\|__INITIAL_STATE__" views/ templates/
grep -rn "serialize\|as_json\|to_json\|present" controllers/ | grep -i "include\|except\|only"
```

**Auth-vs-fetch flow:** The HTML view omits/gates fields; a serializer for `.json`/`.atom`/`.csv` (or
data-* attributes / embedded JS state) includes the raw fields with no equivalent gate.

**Confirmation (all must hold):** (a) the resource is reachable in multiple formats/embeddings; (b) an
alternate format exposes fields the primary format hides; (c) the caller reads restricted fields via the
alternate. Include search/count/aggregate endpoints (counts leak existence) and per-format error verbosity.
**Safe when** field filtering lives in a shared serializer/policy so all formats and embeddings apply the
same rules.

---

## Pattern Z — AI/LLM CONTEXT AUTHORIZATION BYPASS

An AI/LLM feature fetches context data with a service/system context broader than the requesting user's,
then returns it to the user without re-checking their authorization.

**Detection signature (grep):**
```
grep -rn "ai\|llm\|chat\|assistant\|summarize\|generate\|suggest\|embedding\|rag\|retrieval" services/ controllers/
grep -rn "system.*context\|elevated.*access\|service.*user\|bot.*user\|internal.*token" services/ | grep -i "ai\|llm\|chat"
grep -rn "raw.*content\|unsanitized\|before.*render\|original.*text\|hidden.*text" services/ | grep -i "ai\|chat"
```

**Auth-vs-fetch flow:** User query → backend builds context by fetching data with system-level access
(no per-user filter) → model summarizes → returned to user. The permission gate is absent at both the
fetch and the response-filter steps.

**Confirmation (all must hold):** (a) the AI fetches context with system/service access, not the user's;
(b) the response is not filtered to what the user may see; (c) the user obtains restricted content via
the AI. Also: the AI reads raw content (HTML comments, hidden text) the UI strips — a different view than
the user sees; and AI endpoints may skip IP/SSO/MFA gates because they run as a service. **Safe when** the
AI fetches and filters using the requesting user's permissions and enforces the same access gates as
other endpoints.

---

## Pattern 27 — SERVICE ACCOUNT / BOT PRIVILEGE LAUNDERING

A bot/service account holds broad standing privileges; a lower-privileged user triggers an action the bot
performs on their behalf, laundering the bot's privilege into the user's hands. (Distinct from Pattern P:
here the bot legitimately has high privilege and the user borrows it, rather than spoofing whose identity
runs the job.)

**Detection signature (grep):**
```
grep -rn "service_account\|bot_user\|system_user\|machine_user\|automation_account\|integration_user" models/ services/ config/
grep -rn "run_as\|act_as\|as_bot\|perform_as\|on_behalf\|with_service_context\|sudo_as" services/ workers/
grep -rn "bot.*create\|bot.*token\|service.*token\|internal_api" services/ controllers/
```

**Auth-vs-fetch flow:** User-triggered action → dispatched to the bot/service identity → bot's permissions
authorize the target operation → the triggering user's own permission to the target is never checked.

**Confirmation (all must hold):** (a) the action executes under a bot/service identity; (b) that identity
is more privileged than the triggering user; (c) the user's own authorization to the target is not
verified before the bot acts. **Safe when** on-behalf-of execution re-checks the human initiator's
permission to the specific target, and bot standing privileges are scoped to their own automation, not
proxied to arbitrary callers.

---

## Pattern 28 — RACE CONDITION / TOCTOU IN AUTHORIZATION

A check-then-act gap lets a concurrent request flip the authorizing state between the permission check
(time-of-check) and the privileged operation (time-of-use), or lets two requests both consume a
single-use approval.

**Detection signature (grep):**
```
grep -rn "with_lock\|advisory_lock\|pessimistic\|for_update\|SELECT.*FOR UPDATE\|serializable" models/ services/
grep -rn "transaction\|atomic\|mutex\|synchronized\|Lock(\|WLock\|compare_and" services/ controllers/
# check-then-act shapes: an authorize/can? followed later by the mutation, no lock between
grep -rn "if.*can?\|if.*authorize\|if.*is_admin\|if.*permitted" controllers/ services/
```

**Auth-vs-fetch flow:** Request A reads "authorized = true" at T1; request B revokes/changes the state at
T1.5; request A performs the operation at T2 using the stale decision. The gate is evaluated once and not
re-asserted under a lock at the mutating step.

**Confirmation (all must hold):** (a) permission is checked once and not re-checked at the mutation;
(b) a concurrent request can flip the authorizing state (role, membership, approval, balance) in that
window; (c) the operation completes with stale authority (or a single-use grant is consumed twice).
**Safe when** the check and the act occur atomically — inside a DB transaction with a row lock, or via an
atomic compare-and-swap that re-validates the authorizing state.

---

## Pattern 29 — CACHED / STALE AUTHORIZATION DECISIONS

An authorization decision, role, or permission set is cached (per-request memoization, session payload,
or shared response cache) and not invalidated after the underlying permission changes, so revoked access
keeps working.

**Detection signature (grep):**
```
grep -rn "memoize\|@cached\|||=\|@.*_cache\|Rails.cache\|cache.fetch\|lru_cache\|caffeine\|redis.*get" services/ lib/ models/
grep -rn "current_user.*cache\|permissions.*cache\|abilities.*cache\|role.*cache\|per_request" middleware/ lib/
grep -rn "etag\|cache-control\|max-age\|public.*cache\|shared.*cache\|CDN" controllers/ config/ middleware/
```

**Auth-vs-fetch flow:** Role/permission computed once and stored (session, memo, response cache); later
requests read the cached value instead of recomputing; a demotion/revocation updates the source of truth
but not the cache, so the stale value still authorizes.

**Confirmation (all must hold):** (a) an authz decision, role, or permission set is cached with a TTL or
session/response lifetime; (b) a permission change does not invalidate that cache; (c) the stale value
grants access the current state would deny (or a shared response cache serves one user's authorized
response to another). **Safe when** the cache is invalidated on any permission change and response caches
are keyed per-principal (or marked no-store for sensitive data).

---

## Pattern 30 — SOFT-DELETE / ARCHIVE / LIFECYCLE STATE BYPASS

A record in a terminal or hidden lifecycle state (soft-deleted, archived, draft, unpublished, expired)
is still reachable through a path that omits the state filter — direct ID lookup, search, cross-reference,
or export.

**Detection signature (grep):**
```
grep -rn "deleted_at\|soft_delete\|discard\|paranoia\|is_deleted\|archived\|trashed\|deleted_flag" models/
grep -rn "draft\|unpublished\|pending\|preview\|staging\|wip\|expires_at\|valid_until" models/ controllers/
grep -rn "default_scope\|with_deleted\|unscoped\|only_deleted\|include_archived\|all_states" models/ finders/
```

**Auth-vs-fetch flow:** The interactive list applies "active/not-deleted" scope; a direct lookup, search
index, cross-reference resolver, or export builder queries without that scope and returns the hidden
object.

**Confirmation (all must hold):** (a) the object is in a hidden/terminal lifecycle state; (b) some access
path omits the state filter; (c) that path returns the object or its data to a caller who should no
longer see it. Check time-limited access too: is expiry enforced server-side and immediately? **Safe when**
the active-state scope is applied uniformly (default scope + every finder/search/export), and expiry is
enforced server-side at access time.

---

## Pattern 31 — DELEGATION / IMPERSONATION ABUSE

Impersonation / act-as / delegated-access features are abused because the entry point does not verify the
impersonator outranks the target, does not bound or log the impersonation, or leaves elevated privileges
in place after it should end.

**Detection signature (grep):**
```
grep -rn "impersonate\|become_user\|sudo\|act_as\|assume_identity\|switch_user\|login_as\|masquerade" controllers/ services/
grep -rn "on_behalf_of\|delegate\|delegation\|grant_access_to\|proxy_user\|effective_user" services/ models/
grep -rn "stop_impersonat\|revert\|original_user\|true_user\|impersonator_id" controllers/ middleware/
```

**Auth-vs-fetch flow:** Impersonation start checks "is caller staff/admin?" but not "may caller impersonate
THIS target"; the assumed identity's permissions then authorize everything, with no privilege ceiling,
time bound, or audit trail.

**Confirmation (all must hold):** (a) an impersonation/delegation entry point exists and is reachable;
(b) it does not verify the impersonator is strictly higher-privileged than the target (or any user can
invoke it); (c) the assumed identity grants access the caller lacks. **Safe when** impersonation requires
strictly-higher privilege, cannot target equal/higher accounts, is time-bounded and audit-logged, and
cleanly restores the original principal.

---

## Pattern 32 — TRANSFER SOURCE-VS-DESTINATION AUTHORIZATION GAP

A move/transfer/reparent operation checks permission on only ONE side of the move — source or destination
— when both are required. The attacker either extracts an object from a container they can only read, or
injects an object into a victim's container.

**Detection signature (grep):**
```
grep -rn "transfer\|move\|relocate\|reassign\|change_parent\|re.?parent\|migrate.*to" controllers/ services/
grep -rn "target_id\|destination\|to_container\|to_org\|new_parent\|dest_" controllers/ services/
grep -rn "source_id\|from_container\|current_parent\|origin_" controllers/ services/
```

**Auth-vs-fetch flow:** The handler authorizes "can I move this object?" (source) OR "can I create here?"
(destination) but not both; the object lands in / departs from a container against which the caller was
never authorized.

**Confirmation (all must hold):** (a) a move/transfer endpoint changes an object's container/owner;
(b) permission is enforced on only one endpoint of the move; (c) the attacker gains by the asymmetry —
pulls a restricted object into a space they read, or plants an object in a victim's space. **Safe when**
both remove-from-source AND create-in-destination permissions are enforced, and the object's effective
visibility is recomputed against the destination on landing.

---

## Pattern 33 — MASS ASSIGNMENT / OVER-POSTING BEYOND ROLE

A request binds extra fields the UI never exposes — `role`, `owner_id`, `is_admin`, `tenant_id`,
`verified`, `balance` — because the handler binds request input directly to the model without a per-role
allowlist.

**Detection signature (grep):**
```
grep -rn "params.permit\|strong_param\|permit!\|allowed_params\|attr_accessible" controllers/
grep -rn "@RequestBody\|@ModelAttribute\|BindingResult\|DataBinder\|ShouldBind\|mapstructure\|json.Unmarshal" controllers/ handlers/
grep -rn "update(params\|new(params\|assign_attributes\|Object.assign\|serializer.*fields\|dataclass" controllers/ services/
```

**Auth-vs-fetch flow:** Request body → bound wholesale onto the model/entity → privileged field set →
persisted. The gate that should exclude privileged fields (per-role allowlist / DTO) is absent or too
permissive.

**Confirmation (all must hold):** (a) a privilege- or ownership-determining field is bindable from
request input; (b) no allowlist excludes it for this role (or the allowlist includes it); (c) the
persisted change escalates privilege or reassigns ownership/tenant. **Safe when** a strict per-role field
allowlist (strong params / explicit DTO) excludes privileged fields, and ownership/tenant are set
server-side from the authenticated principal.

---

## Pattern 34 — TRANSACTION / PAYMENT FLOW AUTHORIZATION BYPASS

A money/entitlement flow trusts client-controlled values (price, amount, quantity, currency, coupon,
entitlement) or acts on an order/wallet/subscription fetched without ownership scoping, or lets a caller
skip a required step.

**Detection signature (grep):**
```
grep -rn "price\|amount\|total\|subtotal\|quantity\|discount\|coupon\|currency\|entitlement\|plan\|tier" controllers/ services/
grep -rn "order_id\|invoice\|cart\|wallet\|balance\|refund\|charge\|payout\|credit" controllers/ services/
grep -rn "checkout\|purchase\|subscribe\|grant.*entitlement\|apply.*credit\|confirm.*payment" services/
```

**Auth-vs-fetch flow:** The checkout/refund/entitlement endpoint reads a price/entitlement from the
request, or fetches an order/wallet by ID without verifying `owner_id == current_user`, and mutates
balance/entitlement. The authorization + integrity gate on the value and the owner is missing.

**Confirmation (all must hold):** (a) a value that determines money/entitlement is client-influenced, OR
an order/wallet/subscription is fetched unscoped; (b) the server does not re-derive the value from
authoritative data and/or does not enforce ownership; (c) the attacker gains funds/entitlement or acts on
another party's account. Also test step-skipping (jump to "confirm" without "pay"). **Safe when** amounts
and entitlements are derived server-side from the catalog, ownership is enforced on every
order/wallet/subscription operation, and state transitions are validated server-side in order.

---

## Pattern 35 — AUDIT LOG EVASION / INTEGRITY

A security-relevant action is reachable through a path that emits no audit event, or the audit record's
actor/attribution is derived from spoofable input, or logs can be suppressed/forged by the actor —
defeating accountability.

**Detection signature (grep):**
```
grep -rn "audit\|audit_event\|log_event\|track_activity\|activity_log\|security_event\|record_action" services/ models/
grep -rn "actor\|performed_by\|acting_user\|initiator\|caused_by\|user_id.*param" services/ controllers/
# sensitive actions vs the paths that skip auditing (bulk/import/worker/internal API)
grep -rn "bulk\|import\|internal_api\|system\|worker\|migration\|backfill" services/ workers/
```

**Auth-vs-fetch flow:** The primary path logs the action at the controller; an alternate path
(bulk/import/worker/internal API) performs the same action at the service or model layer without an audit
call, or the actor field is read from client input rather than the authenticated principal.

**Confirmation (all must hold):** (a) a security-relevant action has an alternate execution path or a
client-supplied actor field; (b) that path emits no audit record, or attributes the action to a spoofable
identity; (c) the action succeeds without a truthful, accountable trail. **Safe when** auditing is emitted
at the shared service/model layer (all paths converge on it) and the actor is always derived from the
authenticated principal, never from input.

---

## Pattern 36 — DATA EXPORT / BULK ACCESS OVER-FETCH

Export/report/download/backup endpoints assemble data in bulk with system or loose scoping, bypassing the
per-item visibility filter that interactive list/detail endpoints apply.

**Detection signature (grep):**
```
grep -rn "export\|download\|report\|csv\|xlsx\|pdf\|dump\|backup\|stream\|bulk_read\|batch_get" controllers/ services/
grep -rn "find_each\|in_batches\|SELECT \*\|all\b\|scan\|cursor\|pluck\|raw.*query" services/ finders/
# compare against the scoped query the interactive endpoint uses
grep -rn "policy_scope\|accessible_by\|visible_to\|for_user\|where.*tenant" finders/ repositories/
```

**Auth-vs-fetch flow:** The interactive path applies a per-item visibility/ownership predicate; the export
builder queries the underlying table/join directly (often for performance or via a system context) and
omits that predicate, so restricted rows land in the export.

**Confirmation (all must hold):** (a) a bulk export/report/download endpoint returns many records;
(b) it does not apply the same per-item visibility/ownership filter as the interactive endpoint; (c) the
export contains items the caller cannot see individually. Include aggregate counts that reveal restricted
existence. **Safe when** the export reuses the exact scoped query / policy_scope as the interactive path.

---

## Pattern 37 — GRAPHQL-SPECIFIC AUTHORIZATION GAPS

GraphQL's flexible query shape opens authorization gaps that REST does not: nested resolvers fetch related
objects without per-object checks; aliases and batching multiply access; fragments reach restricted
fields; subscriptions (WebSocket) skip HTTP middleware; introspection and field-suggestion errors leak
schema.

**Detection signature (grep):**
```
grep -rn "GraphQLObjectType\|type .* {\|field \|t.field\|resolve\|resolver\|Connection\|dataloader" graphql/ schema/ resolvers/
grep -rn "subscription\|subscribe\|Subscription\b" graphql/ schema/ resolvers/
grep -rn "multiplex\|batch\|alias\|fragment\|introspection\|__schema\|__type" graphql/ controllers/ config/
# per-field authorization presence
grep -rn "authorize\|can?\|permission\|guard\|visible?\|accessible?" resolvers/ graphql/
```

**Auth-vs-fetch flow:** Authorization is enforced at the top-level query (or at the HTTP layer) but each
nested resolver fetches related objects without its own check; aliased/batched queries fan out past a
single gate; subscriptions authenticate at connect and never re-check.

**Confirmation (all must hold):** (a) a field/resolver returns object data; (b) authorization is not
enforced at that resolver/field level (only at entry, or not at all); (c) a nested / aliased / batched /
subscription query returns restricted data. **Safe when** field-level authorization runs at every
resolver (not just the root), depth/complexity is bounded, subscriptions share the same auth as queries,
and introspection/field-suggestions are restricted in production.

---

## Pattern 38 — MULTI-TENANT SHARED INFRASTRUCTURE LEAKAGE

Requests are tenant-scoped at the application layer, but a shared subsystem — cache, search index, file
storage/CDN, message queue, or a globally-sequential ID space — co-mingles tenant data because its
key/scope omits the tenant discriminator.

**Detection signature (grep):**
```
grep -rn "cache_key\|cache.fetch\|redis.*key\|memcache\|fragment_cache" services/ lib/ | grep -vi "tenant\|org\|account"
grep -rn "elasticsearch\|opensearch\|solr\|meilisearch\|algolia\|typesense\|search_index" config/ services/
grep -rn "bucket\|storage.*path\|signed_url\|presigned\|blob.*key\|object_key\|cdn" services/ config/
grep -rn "sequence\|auto_increment\|global.*id\|SERIAL\|nextval\|snowflake" migrations/ models/ config/
```

**Auth-vs-fetch flow:** The app-layer query is tenant-scoped, but the shared subsystem is keyed without the
tenant (cache key omits tenant_id, search index is global, file path/signed-URL is guessable, IDs are
globally sequential), so tenant A's request resolves tenant B's data through that subsystem.

**Confirmation (all must hold):** (a) a shared subsystem stores or serves data for multiple tenants;
(b) its key/scope/index omits the tenant discriminator; (c) tenant A obtains tenant B's data via that
subsystem (guessable ID/path, shared cache hit, cross-tenant search result). **Safe when** every shared
subsystem key/index/scope includes the tenant, IDs are unguessable or per-tenant, and queries are
tenant-scoped by default.

---

## Pattern 39 — WEBHOOK / NOTIFICATION DATA OVER-EXPOSURE

Outbound webhooks, notifications, and emails carry more data than the recipient is authorized to see, or
a lower-privileged user can subscribe to events about resources they cannot read, because recipients and
payloads are computed from a system context without re-checking current visibility at send time.

**Detection signature (grep):**
```
grep -rn "webhook\|notify\|notification\|deliver\|send_email\|push_notification\|subscribe.*event" services/ models/
grep -rn "payload\|event_data\|serialize.*event\|to_webhook\|render.*notification" services/ lib/
grep -rn "recipients\|subscribers\|watchers\|audience\|mailing" services/ models/
```

**Auth-vs-fetch flow:** An event fires → the payload is built from the full object under a system context →
delivered to a subscriber/recipient whose *current* permission to that object is not re-checked at send
time.

**Confirmation (all must hold):** (a) an outbound webhook/notification/email carries object data; (b) the
recipient's current authorization to that object is not verified when the message is sent; (c) the
recipient receives data they cannot obtain through normal access (e.g., a user who lost access still gets
event payloads, or a subscription accepts a resource the subscriber cannot read). **Safe when** payloads
are filtered to the recipient's permission and subscription/config requires (and re-checks) read access
to the subject resource at send time.

---

## Pattern 40 — PRIVILEGE ESCALATION VIA OBJECT RELATIONSHIP MANIPULATION

An attacker sets or changes a relationship/foreign-key field (`parent_id`, `container_id`, `owner_id`,
`group_id`, membership/association links, nested attributes) to attach their object to a privileged
parent, re-parent to inherit permissions, or create a relationship row that grants access — without the
server verifying they may link to that target.

**Detection signature (grep):**
```
grep -rn "parent_id\|container_id\|group_id\|org_id\|owner_id\|team_id\|project_id\|foreign_key" controllers/ services/ models/
grep -rn "nested_attributes\|accepts_nested\|belongs_to\|has_many.*through\|association\|include:" models/ controllers/
grep -rn "add_member\|create.*membership\|link\|attach\|associate\|relate" services/ controllers/
```

**Auth-vs-fetch flow:** A create/update accepts a relationship ID; the server persists the link without
checking the caller is authorized on the *referenced target*; the object then inherits the target's
context, permissions, or role.

**Confirmation (all must hold):** (a) a relationship/foreign-key field is settable from input; (b) the
server does not verify the caller is authorized on BOTH the object and the referenced target; (c) the
resulting relationship grants inherited access or an escalated role (e.g., attach a record to a container
the attacker cannot access, or self-insert a membership row at a high role). **Safe when** every settable
relationship ID is authorized against the caller on both ends, and any permissions inherited through the
relationship are recomputed after the change.

---

## Core Technique: Normal GET vs Action Endpoint

The single most productive access-control technique, and the thread that ties Patterns A, B, C, D, I, and
32 together.

**Principle:** developers reliably lock the *read* endpoint but forget that *action* endpoints (POST/PUT
that move, clone, transfer, reorder, assign, link, approve, publish, archive) also return the object in
their response body — often through a different, unscoped code path.

**Why action endpoints leak even when the action itself is authorized:**
- The read endpoint (`GET /records/:id`) is the front door — it uses a scoped query, checks visibility
  flags, and 404s for unauthorized callers.
- The action endpoint is the side door — the developer focused on authorizing the *action* and forgot the
  *response* still serializes the object. The object is frequently fetched with a raw, unscoped lookup
  because the action logic "needs the record to operate on it."
- A self-referencing parameter (target == source: "move to the same container", "transfer to the current
  owner", "update with no changed fields") triggers a "nothing to do" early return that skips the
  authorization branch — but still returns the object (Pattern A).
- Even on the failure/forbidden branch, the handler may serialize the object into the error body
  (Pattern D), and the action's *target* parameter is often looked up raw, differentiating
  exists-but-forbidden from not-found (Pattern I).

**How to apply systematically — for every action endpoint:**
1. Find the normal read endpoint for the same object type. Confirm an unauthorized caller gets 404 and
   no body.
2. Read the action endpoint's code. Is the object fetched with the SAME scoped query, or a raw lookup?
   Are there early returns? Does the response always include the full object?
3. Compare: if `GET` returns 404 for caller X but `POST /action` returns 200 (or a 4xx *with a body*)
   carrying the object for caller X — that is a candidate.
4. Trace the three-way conjunction (mandatory): (a) object fetched without a read-permission check →
   (b) service early-returns/acts before authorization → (c) API serializes the returned object. All
   three true ⇒ real.
5. Test self-referencing (target = source) to trip the no-op path.
6. If data leaks, test integrity: can the caller also modify, move-to-own-space, or change visibility via
   the same endpoint? Read-only leak = confidentiality; state change = integrity too.

---

## Language / Framework Adaptation — Grep Translation

The greps above use generic terms; translate them to the target stack. Directory hints (`services/`,
`controllers/`, `resolvers/`, `models/`) map to whatever the project uses (`src/`, `app/`, `pkg/`,
`internal/`, `routes/`, `handlers/`).

### Current user / authentication

| Concept | Rails | Django | Express/Node | Spring | Laravel | Go |
|---|---|---|---|---|---|---|
| Current user | `current_user` | `request.user` | `req.user` | `SecurityContextHolder`, `@AuthenticationPrincipal` | `auth()->user()`, `Auth::user()` | `ctx.User`, `GetUser(ctx)` |
| Auth middleware | `before_action :authenticate` | `@login_required`, `LoginRequiredMixin` | `passport.authenticate`, `jwt.verify` | `SecurityFilterChain`, `@PreAuthorize` | `middleware('auth')` | `middleware.Auth()` |
| Permission check | `authorize!`, `can?` | `has_perm()`, `@permission_required` | `req.ability.can()`, `casl` | `hasAuthority()`, `hasRole()` | `Gate::allows()`, `$this->authorize()` | `casbin`, `can()` |
| Policy / ability | `app/policies/` | `permissions.py` | `abilities/`, `policies/` | `@PreAuthorize`, `AccessDecisionManager` | `app/Policies/` | `authz/`, `policy.go` |
| Route files | `config/routes.rb` | `urls.py` | `routes/`, `router.*` | `@RequestMapping`, `@GetMapping` | `routes/web.php`, `routes/api.php` | `router.go`, `routes.go` |

### Scoped vs unscoped object lookup

| Language | UNSCOPED (dangerous) | SCOPED (safer) |
|---|---|---|
| Rails | `Model.find(id)`, `Model.find_by(id:)` | `current_user.models.find(id)`, `policy_scope(Model)` |
| Django | `Model.objects.get(pk=id)` | `Model.objects.filter(user=request.user).get(pk=id)` |
| Express | `db.findById(id)` | `db.find({ _id: id, userId: req.user.id })` |
| Spring | `repo.findById(id)` | `repo.findByIdAndOwnerId(id, user.getId())` |
| Laravel | `Model::find($id)` | `auth()->user()->models()->find($id)` |
| Go | `db.First(&m, id)` | `db.Where("user_id = ?", uid).First(&m, id)` |

### Skip / bypass flags (disable auth during import/bulk/system paths)

| Language | Search for |
|---|---|
| Any | `skip_authorization`, `skip_auth`, `skip_validation`, `skip_callbacks`, `bypass`, `no_auth`, `system_user`, `admin_mode`, `sudo`, `importing`, `bulk`, `migration`, `seed`, `internal`, `trusted`, `service_context`, `save(validate: false)`, `force_create` |

### Entry points beyond HTTP (where auth is often missing)

| Entry point | Why dangerous | What to check |
|---|---|---|
| GraphQL subscriptions | WebSocket-based; skip HTTP middleware | IP/SSO/blocked-user/rate-limit re-checked? |
| Background workers / async-jobs | Run as system context, no session | Re-checks the original principal's permission? |
| WebSocket channels | Auth checked only at connect | What if the user is blocked *after* connect? |
| Message-queue consumers | System context; trust the payload | Are IDs and permissions re-verified per event? |
| Webhook receivers | External callbacks | How is the sender verified? Payload validated? |
| Import/export APIs | Process serialized external data | Are imported permissions re-validated (Pattern N)? |
| Proxy/relay endpoints | Relay to external services | What upstream data reaches the client (Pattern U)? |
| AI/LLM endpoints | May use system-level data access | Does it respect the requesting user's scope (Pattern Z)? |

---

## False-Positive Checklist (pre-report validation gate)

Before reporting ANY finding, all of these must be satisfied:

```
[ ] The exact code path that causes the flaw is identified (file:line for fetch, gate, response).
[ ] The behavior CONTRADICTS the code's own permission model / role matrix (not just your assumption).
[ ] Verified on the LOWEST role that should NOT have access — if the lowest blocked role matches the
    documented policy, it is NOT a vulnerability.
[ ] For visibility flags: confirmed the policy actually forbids this role from seeing this level
    (some roles seeing "confidential" may be by design).
[ ] The data is NOT reachable through another legitimate path for this role.
[ ] No deeper control (DB constraint, second check, tenant scope) prevents the actual harm.
[ ] This is a code bug, not a non-default configuration/setting the operator chose.
[ ] Docs / code comments / tests near the check do not declare this behavior intentional.
[ ] For Pattern A / action-endpoint findings: the three-way conjunction is traced end to end
    (unscoped fetch + pre-auth early return/serialization + response includes the object).
[ ] The response body (including 4xx bodies) was inspected for leaked data — not just the status code.
```

If behavior matches the intended permission model → FALSE POSITIVE. If it contradicts the model and a
low-privilege caller gains data/actions their role forbids → CONFIRMED.

---

## Result Values

Each row must be one of:

- Applied — finding
- Applied — potential/suspicious
- Applied — no issue found
- Not applicable — evidence-backed reason
- Gap/blocker — could not complete
