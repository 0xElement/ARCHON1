/* ARCHON operator console — SPA logic (no framework, no build). */
'use strict'
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmtTime = ts => { try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return '' } }

let SQUADS = [], SQUAD_BY = {}
let REPORTS = [], lastState = null
const reportCache = {}          // rel → raw markdown (fetched once)

// find the report file that belongs to a task (by taskId in path/name)
function reportForTask(t) {
  if (!t || !t.id) return null
  const id = String(t.id)
  const hits = REPORTS.filter(r => r.rel.includes(id) || r.name.includes(id))
  if (!hits.length) return null
  // prefer the canonical reports/<id>.md, else the most recent match
  return (hits.find(r => r.rel === `reports/${id}.md`) || hits.sort((a, b) => b.mtime - a.mtime)[0]).rel
}
async function loadReport(rel) {
  if (reportCache[rel] != null) return
  try { reportCache[rel] = await fetch('/api/report?f=' + encodeURIComponent(rel)).then(r => r.text()) }
  catch { reportCache[rel] = '_Could not load report._' }
}

const SQUAD_HUE = {
  pentest: '#ff5d8f', stocks: '#3ddc97', 'cloud-security': '#2fd9e8',
  'network-pentest': '#9b8cff', 'code-review': '#f6a623', 'red-team': '#ff6b81',
  'ai-security': '#ffcf5c', universal: '#9aa8c2',
}
const squadHue = id => SQUAD_HUE[String(id).replace(/-squad$/, '')] || '#f6a623'

/* deterministic avatar color from a name */
function avatarColor(name) {
  let h = 0; const s = String(name || '?')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return `hsl(${h} 70% 62%)`
}
function avatar(name, size = 28) {
  const init = String(name || '?').slice(0, 2).toUpperCase()
  return `<span class="av" title="${esc(name)}" style="background:${avatarColor(name)};width:${size}px;height:${size}px">${esc(init)}</span>`
}
function avatarStack(names, max = 5) {
  const shown = names.slice(0, max)
  let html = '<div class="avs">' + shown.map(n => avatar(n)).join('')
  if (names.length > max) html += `<span class="av more">+${names.length - max}</span>`
  return html + '</div>'
}

/* progress ring */
function ring(pct, color = 'url(#ringGrad)') {
  const r = 24, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return `<div class="ring"><svg width="56" height="56" viewBox="0 0 56 56">
    <circle class="track" cx="28" cy="28" r="${r}" fill="none" stroke-width="5"/>
    <circle class="fill" cx="28" cy="28" r="${r}" fill="none" stroke-width="5" stroke="${color}"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
  </svg><span class="pct">${Math.round(pct)}<small style="font-size:8px">%</small></span></div>`
}

/* ── routing ── */
let currentView = 'overview'
function show(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view))
  $$('.nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view))
  currentView = view
  const main = document.querySelector('.main'); if (main) main.scrollTop = 0
}
$$('[data-view]').forEach(b => b.addEventListener('click', () => show(b.dataset.view)))

/* ── full-page report ── */
let reportBackTo = 'tasks'
async function openReportPage(rel, title) {
  if (currentView !== 'report') reportBackTo = currentView
  $('#repTitle').textContent = title || 'Report'
  $('#repPath').textContent = rel
  $('#repBody').innerHTML = '<div class="skel"></div>'
  show('report')
  await loadReport(rel)
  $('#repBody').innerHTML = md(reportCache[rel] || '_Could not load report._')
}

/* ── toasts ── */
function toast(title, sub, kind = '') {
  const el = document.createElement('div')
  el.className = 'toast ' + kind
  el.innerHTML = `<div class="ttl">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`
  $('#toasts').appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.4s'; setTimeout(() => el.remove(), 400) }, 4400)
}

/* ── markdown → html ── */
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n')
  let out = '', i = 0, inUl = false, inOl = false
  const closeLists = () => { if (inUl) { out += '</ul>'; inUl = false } if (inOl) { out += '</ol>'; inOl = false } }
  const inline = t => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  while (i < lines.length) {
    let l = lines[i]
    if (/^```/.test(l)) { closeLists(); i++; let code = ''; while (i < lines.length && !/^```/.test(lines[i])) code += lines[i++] + '\n'; i++; out += `<pre><code>${esc(code)}</code></pre>`; continue }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeLists(); const head = l.split('|').slice(1, -1).map(c => `<th>${inline(c.trim())}</th>`).join(''); i += 2
      let body = ''
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body += '<tr>' + lines[i].split('|').slice(1, -1).map(c => `<td>${inline(c.trim())}</td>`).join('') + '</tr>'; i++ }
      out += `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`; continue
    }
    let m
    if (m = l.match(/^(#{1,6})\s+(.*)/)) { closeLists(); const n = m[1].length; out += `<h${n}>${inline(m[2])}</h${n}>`; i++; continue }
    if (/^\s*>\s?/.test(l)) { closeLists(); out += `<blockquote>${inline(l.replace(/^\s*>\s?/, ''))}</blockquote>`; i++; continue }
    if (/^\s*([-*+])\s+/.test(l)) { if (!inUl) { closeLists(); out += '<ul>'; inUl = true } out += `<li>${inline(l.replace(/^\s*[-*+]\s+/, ''))}</li>`; i++; continue }
    if (/^\s*\d+\.\s+/.test(l)) { if (!inOl) { closeLists(); out += '<ol>'; inOl = true } out += `<li>${inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`; i++; continue }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { closeLists(); out += '<hr>'; i++; continue }
    if (/^\s*$/.test(l)) { closeLists(); i++; continue }
    closeLists(); out += `<p>${inline(l)}</p>`; i++
  }
  closeLists(); return out
}

/* ── status + phases ── */
const statusClass = s => 's-' + String(s || 'pending').toLowerCase().replace(/\s+/g, '-')
function phaseSteps(task) {
  const sq = SQUAD_BY[String(task.squad || '').replace(/-squad$/, '')]
  const phases = (sq && sq.phases) || []
  if (!phases.length) return ''
  const prog = Math.max(0, Math.min(100, task.progress || 0))
  const done = ['completed', 'done'].includes(task.status) ? phases.length : Math.floor(prog / 100 * phases.length)
  const running = task.status === 'in-progress'
  const stateOf = idx => idx < done ? 'done' : (running && idx === done ? 'active' : '')
  // Triage-hub layout: recon · exploit · validate · chain sit on a rail that FEEDS a continuous
  // `triage` node below — triage runs the whole scan, fed one-by-one by every phase above it.
  // The rail flows (animates) while the run is live. Linear squads (code-review) keep the stepper.
  if (phases.includes('triage')) {
    const flow = phases.filter(p => p !== 'triage')
    const tIdx = phases.indexOf('triage')
    const tState = tIdx < done ? 'done' : (running ? 'live' : '')
    return `<div class="stepper hub">
      <div class="flowrow">${flow.map((p, idx) => `<span class="ph ${stateOf(idx)}"><b>${esc(p)}</b></span>`).join('')}</div>
      <div class="bus ${running ? 'flowing' : ''}"></div>
      <div class="hubrow"><span class="triage ${tState}">triage</span></div>
    </div>`
  }
  return `<div class="stepper">${phases.map((p, idx) =>
    `<div class="step ${stateOf(idx)}">${esc(p)}</div>`).join('')}</div>`
}

/* ── task card ── */
function taskCard(t) {
  const running = t.status === 'in-progress'
  const completed = ['completed', 'done'].includes(t.status)
  const prog = completed ? 100 : (t.progress || 0)
  const c = squadHue(t.squad)
  const agentNames = t.costByAgent ? Object.keys(t.costByAgent) : (t.assignee ? [t.assignee] : [])
  const sq = SQUAD_BY[String(t.squad || '').replace(/-squad$/, '')]
  const phases = (sq && sq.phases) || []
  const done = completed ? phases.length : Math.floor(prog / 100 * phases.length)
  const phaseLabel = phases.length
    ? (completed ? `Complete · ${phases.length} phases` : `Phase ${Math.min(done + 1, phases.length)} of ${phases.length}`)
    : (t.statusMessage || '')
  const tick2 = phases.length ? (t.statusMessage || '') : ''
  const metric = (k, v, cls = '') => `<div class="metric"><span class="mk">${k}</span><span class="mv ${cls}">${v}</span></div>`
  const metrics = [
    t.cacheHitRate ? metric('cache', t.cacheHitRate + '%') : '',
    t.tokens ? metric('output', (t.tokens.output || 0).toLocaleString()) : '',
  ].filter(Boolean).join('')
  const awaiting = t.status === 'awaiting-triage'
  const opener = awaiting ? 'Triage findings →' : (completed ? 'View findings & report →' : 'Open run →')
  return `<div class="tcard clickable ${running ? 'running' : ''}" style="--c:${c}" data-taskopen="${esc(t.id)}" title="Open run">
    <div class="pad">
      <div class="thead">
        <div class="readout"><span class="val">${Math.round(prog)}</span><span class="pc">%</span></div>
        <div class="hstatus">
          ${running ? `<span class="runtag"><span class="dot"></span>Running</span>` : ''}
          <span class="badge ${statusClass(t.status)}">${esc(t.status || '?')}</span>
        </div>
      </div>
      <div class="pbar"><div class="pfill" style="width:${Math.max(2, Math.min(100, prog))}%"></div></div>
      <div class="ticks"><span>${esc(phaseLabel)}</span><span>${esc(tick2)}</span></div>
      <div class="ttl">${esc(t.title || t.id)}</div>
      <div class="tid">${esc(t.id)}</div>
      <div class="row">
        ${t.squad ? `<span class="badge squad">${esc(String(t.squad).replace(/-squad$/, ''))}</span>` : ''}
        ${sq && sq.type ? `<span class="badge">${esc(sq.type)}</span>` : ''}
      </div>
      ${phaseSteps(t)}
      ${agentNames.length ? `<div style="margin-top:13px">${avatarStack(agentNames)}</div>` : ''}
      ${metrics ? `<div class="sep-line"></div><div class="footgrid">${metrics}</div>` : ''}
      <div class="card-open">${opener}</div>
    </div>
  </div>`
}

/* ── render ── */
let lastTaskSig = '', lastRepSig = ''
function render(s) {
  lastState = s
  REPORTS = s.reports || []
  const up = s.daemon
  $('#daemonPill').className = 'pill ' + (up ? 'live' : 'down')
  $('#daemonText').textContent = up ? 'operational' : 'standby'
  $('#clock').textContent = fmtTime(s.now)
  $('#footMeta').innerHTML = `intel ▸<br>${esc(s.intel.replace(/^.*?(var\/intel.*)$/, '…/$1'))}`
  $('#cTasks').textContent = s.tasks.length
  $('#cReports').textContent = s.reports.length
  // if the detail page is open, keep its header (status + Cancel) and overview / live logs current
  if (currentView === 'task') updateTdHeader((s.tasks || []).find(x => String(x.id) === String(tdTaskId)))
  if (currentView === 'task' && tdSub === 'overview') renderTaskOverview()
  if (currentView === 'task' && tdSub === 'log') renderTaskLogs()
  // findings tab: refresh live ONLY while the run is in-progress (no triage yet to clobber),
  // so validated findings appear on the tab as they land
  if (currentView === 'task' && tdSub === 'findings') {
    const t = (s.tasks || []).find(x => String(x.id) === String(tdTaskId))
    if (t && t.status === 'in-progress') loadFindings()
  }
  // report tab: while SCRIBE is generating (or once it finishes), keep the tab current
  if (currentView === 'task' && tdSub === 'report') {
    const t = (s.tasks || []).find(x => String(x.id) === String(tdTaskId))
    if (t && (/generating/i.test(t.status || '') || !reportForTask(t))) renderTaskReport()
  }

  const active = s.tasks.filter(t => t.status === 'in-progress').length
  const done = s.tasks.filter(t => ['completed', 'done'].includes(t.status)).length
  const queued = s.queue.filter(d => d.status === 'pending').length
  $('#stats').innerHTML = [
    ['acc', active, 'active tasks'],
    ['cyan', queued, 'queued'],
    ['ok', done, 'completed'],
    ['violet', s.tasks.length, 'total tasks'],
  ].map(([cls, n, l]) => `<div class="stat ${cls}"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')
  $('#ovSub').textContent = `${SQUADS.filter(x => x.id !== 'universal' && !x.hidden).length} squads · live ${fmtTime(s.now)}`
  $('#ovActivity').innerHTML = actList(s.activity.slice(0, 16))
  $('#activityFull').innerHTML = actList(s.activity)

  renderTasks(s)
  renderReports(s)
}
// Overview empty-state: an animated preview of what a run looks like (dispatch →
// progress → findings stream → report). Uses only .demo-* classes (in app.css); the
// sample findings are illustrative — rendered ONLY when state.tasks is empty.
const DEMO_LOOP_HTML = `<p class="empty" style="text-align:left;margin:0 0 12px">No runs yet — here's what one looks like. Queue a target from <b>New dispatch</b> to begin.</p>
<div class="demo">
  <div class="demo-chrome">
    <i style="background:#fb7185"></i><i style="background:#fbbf24"></i><i style="background:#34d399"></i>
    <span class="u">127.0.0.1:4000</span>
  </div>
  <div class="demo-body">
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:18px">
      <span style="width:30px;height:30px;border-radius:8px;display:grid;place-items:center"><svg viewBox="0 0 256 256" width="30" height="30" fill="none"><defs><radialGradient id="dt" cx="50%" cy="34%" r="82%"><stop offset="0" stop-color="#1c2a42"/><stop offset="1" stop-color="#0a0e16"/></radialGradient><linearGradient id="dr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4a784"/><stop offset="1" stop-color="#cf5d39"/></linearGradient></defs><rect x="8" y="8" width="240" height="240" rx="60" fill="url(#dt)"/><circle cx="128" cy="128" r="70" fill="none" stroke="#38bdf8" stroke-width="3" stroke-opacity=".3"/><g stroke="url(#dr)" stroke-width="9" stroke-linecap="round"><line x1="24" y1="128" x2="52" y2="128"/><line x1="204" y1="128" x2="232" y2="128"/><line x1="128" y1="204" x2="128" y2="232"/></g><path d="M96 200 L128 52 L160 200" fill="none" stroke="url(#dr)" stroke-width="24" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/><line x1="106" y1="150" x2="150" y2="150" stroke="url(#dr)" stroke-width="17" stroke-linecap="round"/><circle cx="128" cy="128" r="6" fill="#38bdf8"/></svg></span>
      <div style="font-weight:650;font-size:15px">ARCHON <small style="display:block;font-weight:400;font-size:10px;color:var(--fg-dim)">offensive operations console</small></div>
      <span class="pill live" style="margin-left:auto"><span class="dot"></span> daemon live</span>
    </div>
    <div class="demo-stage">
      <div class="demo-s1"><b>▸ DISPATCH</b><small>target accepted · scope gate passed</small></div>
      <div class="demo-s2"><b>▸ LIVE PROGRESS</b><small>recon → fingerprint → plan → specialist waves</small></div>
      <div class="demo-s3"><b>▸ AWAITING TRIAGE</b><small>findings verified · you confirm each</small></div>
      <div class="demo-s4"><b>▸ REPORT GENERATED</b><small>SCRIBE wrote one de-duplicated report</small></div>
    </div>
    <div class="demo-cols">
      <div class="demo-card" style="position:relative;overflow:hidden">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent)"></div>
        <div style="font-weight:650;font-size:14.5px">juice-shop.local</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--fg-dim);margin-top:3px">ENG-4471 · black-box + source</div>
        <div style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:500;color:var(--accent-2);margin-top:9px"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(124,131,255,.22)"></span>running</div>
        <div class="demo-bars">
          <div><div style="font-size:11px;color:var(--fg-mut);margin-bottom:5px">Recon &amp; fingerprint</div><div class="demo-bar b1"><i></i></div></div>
          <div><div style="font-size:11px;color:var(--fg-mut);margin-bottom:5px">ATLAS attack plan</div><div class="demo-bar b2"><i></i></div></div>
          <div><div style="font-size:11px;color:var(--fg-mut);margin-bottom:5px">Specialist waves</div><div class="demo-bar b3"><i></i></div></div>
        </div>
        <div style="display:flex;gap:6px;margin-top:15px;flex-wrap:wrap">
          <span class="chip" style="color:#22d3ee">SCOUT</span><span class="chip" style="color:#fb7185">VIPER</span><span class="chip" style="color:#fbbf24">DRILL</span><span class="chip" style="color:#34d399">WARDEN</span><span class="chip" style="color:#b08cff">RELAY</span>
        </div>
      </div>
      <div class="demo-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-size:12.5px;font-weight:600">Findings board</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--fg-dim)">verified · one at a time</span>
        </div>
        <div class="demo-find demo-f1"><span class="badge sev-critical">CRIT</span><span class="t">SQL injection · /rest/products/search</span><span class="sc" style="color:var(--emerald)">9.8</span></div>
        <div class="demo-find demo-f2"><span class="badge sev-high">HIGH</span><span class="t">JWT algorithm confusion</span><span class="sc">8.1</span></div>
        <div class="demo-find demo-f3"><span class="badge sev-medium">MED</span><span class="t">Stored XSS · product review</span><span class="sc">6.1</span></div>
        <div class="demo-find demo-f4"><span class="badge sev-high">HIGH</span><span class="t">IDOR · /api/basket/{id}</span><span class="sc">7.5</span></div>
        <div class="demo-report"><span class="chk">✓</span><div style="flex:1"><div style="font-size:12.5px;font-weight:600">report.md</div><div style="font-family:var(--mono);font-size:10.5px;color:var(--fg-dim)">4 confirmed · correlated + de-duplicated</div></div></div>
      </div>
    </div>
  </div>
</div>`
// task-card render — skipped when nothing changed so an inline-open report survives the poll
function renderTasks(s, force) {
  const sig = JSON.stringify(s.tasks.map(t => [t.id, t.status, t.progress, t.totalCost])) + '|' + REPORTS.length
  if (!force && sig === lastTaskSig) return
  lastTaskSig = sig
  const recent = s.tasks.slice(0, 4)
  $('#ovTasks').innerHTML = recent.length ? `<div class="grid" style="gap:14px">${recent.map(taskCard).join('')}</div>` : DEMO_LOOP_HTML
  $('#taskList').innerHTML = s.tasks.length ? s.tasks.map(taskCard).join('') : '<div class="empty">No tasks yet.</div>'
  bindDynamic()
}
// reports tab — each row opens the full-page report (no popup)
function renderReports(s, force) {
  const sig = (s.reports || []).map(r => r.rel + r.mtime).join('|')
  if (!force && sig === lastRepSig) return
  lastRepSig = sig
  $('#reportList').innerHTML = s.reports.length ? s.reports.map(r =>
    `<div class="r" data-ropen="${esc(r.rel)}" data-title="${esc(r.name)}">
      <span class="ic"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5M9 13h7M9 17h7"/></svg></span>
      <span class="nm">${esc(r.name)}</span>
      <span class="meta">${esc(r.dir)} · ${(r.size / 1024).toFixed(1)} KB · ${fmtTime(r.mtime)}</span>
    </div>`).join('') : '<div class="empty">No reports yet. Run a task to completion.</div>'
  bindDynamic()
}
function actList(acts) {
  if (!acts || !acts.length) return '<div class="empty">No activity yet.</div>'
  return acts.map(a => `<div class="act"><span class="t">${a.ts ? fmtTime(a.ts) : ''}</span><span class="ag">${esc(a.agent || '·')}</span><span class="msg">${esc((a.action || a.raw || '').slice(0, 170))}</span></div>`).join('')
}
function bindDynamic() {
  // clicking a task card opens its per-run page (Overview / Findings / Report)
  $$('[data-taskopen]').forEach(el => el.onclick = () => openTaskPage(el.dataset.taskopen))
  // Reports-tab rows open the full-page report
  $$('[data-ropen]').forEach(el => el.onclick = () => openReportPage(el.dataset.ropen, el.dataset.title))
}
$('#repBack').onclick = () => show(reportBackTo || 'tasks')

/* ── findings & triage ── */
const SEV = ['Critical', 'High', 'Medium', 'Low', 'Info']

/* ── CVSS 3.1 base-score calculator — defined in cvss.js (loaded before app.js) ── */
let fnTaskId = '', fnFindings = [], fnVerdicts = {}
let tdTaskId = '', tdBackTo = 'tasks', tdSub = 'overview', tdLogLoaded = false

/* ── per-run detail page (Overview / Findings / Report) ── */
async function openTaskPage(taskId) {
  // resolve to the engagement root so iterations all open the same aggregated page
  try { const ir = await api('GET', '/api/iterations?taskId=' + encodeURIComponent(taskId)); if (ir && ir.engagementId) taskId = ir.engagementId } catch {}
  tdBackTo = currentView === 'task' ? tdBackTo : currentView
  tdTaskId = taskId; fnTaskId = taskId; tdLogLoaded = false
  const t = (lastState ? lastState.tasks : []).find(x => String(x.id) === String(taskId)) || { id: taskId }
  $('#tdTitle').textContent = t.title || taskId
  $('#tdId').textContent = taskId
  updateTdHeader(t)
  const sub = t.status === 'in-progress' ? 'log'
    : t.status === 'awaiting-triage' ? 'findings'
    : (reportForTask(t) ? 'report' : 'overview')
  show('task'); setTdSub(sub)
  if (sub !== 'findings') loadFindings() // populate the Findings count + summary even when landing elsewhere
}
function setTdSub(sub) {
  tdSub = sub
  $$('#tdTabs button').forEach(b => b.classList.toggle('on', b.dataset.td === sub))
  ;['overview', 'findings', 'log', 'report'].forEach(s => { const el = $('#td-' + s); if (el) el.style.display = s === sub ? '' : 'none' })
  if (sub === 'overview') renderTaskOverview()
  else if (sub === 'findings') loadFindings()
  else if (sub === 'log') renderTaskLogs()
  else if (sub === 'report') renderTaskReport()
}
$$('#tdTabs button').forEach(b => b.onclick = () => setTdSub(b.dataset.td))
$('#tdBack').onclick = () => show(tdBackTo || 'tasks')
// Keep the run-page header (status badge + Cancel) current on every tab. The Cancel button
// lives in the header so it's reachable while running no matter which tab you landed on
// (in-progress opens on Logs) — same for black-box and code-review.
function updateTdHeader(t) {
  if (!t) return
  $('#tdStatus').textContent = t.status || ''
  $('#tdStatus').className = 'badge ' + statusClass(t.status)
  const cb = $('#tdCancelHdr'); if (cb) cb.style.display = t.status === 'in-progress' ? '' : 'none'
}
$('#tdCancelHdr').onclick = async () => {
  const cb = $('#tdCancelHdr'); cb.disabled = true
  const r = await api('POST', '/api/cancel', { taskId: tdTaskId })
  toast(r && !r.error ? 'Cancel sent' : 'Cancel failed', tdTaskId, r && !r.error ? 'ok' : 'err')
}

function renderTaskOverview() {
  const t = (lastState ? lastState.tasks : []).find(x => String(x.id) === String(tdTaskId))
  if (!t) { $('#td-overview').innerHTML = '<div class="empty">Run not found.</div>'; return }
  const running = t.status === 'in-progress'
  const agentNames = t.costByAgent ? Object.keys(t.costByAgent) : (t.assignee ? [t.assignee] : [])
  // Agents that ran + their model (runs on the Claude subscription, so no per-agent dollar cost).
  let costRows = ''
  if (t.costByAgent && Object.keys(t.costByAgent).length) {
    costRows = '<table class="costtable"><tr><th>Agent</th><th>Model</th></tr>' +
      Object.keys(t.costByAgent).map((a) => { const cm = (t.costs || []).find(x => x.agent === a); return `<tr><td><span class="mini-av">${avatar(a, 20)} ${esc(a)}</span></td><td style="color:var(--fg-dim)">${esc(cm ? cm.model : '')}</td></tr>` }).join('') + '</table>'
  }
  const prog = ['completed', 'done'].includes(t.status) ? 100 : (t.progress || 0)
  $('#td-overview').innerHTML = `<div class="grid cols-2">
    <div class="card">
      <h3>Run</h3>
      <div class="kv"><span>squad <b>${esc(String(t.squad || '').replace(/-squad$/, ''))}</b></span><span>lead <b>${esc(t.assignee || '')}</b></span>${t.cacheHitRate ? `<span>cache <b>${t.cacheHitRate}%</b></span>` : ''}</div>
      <div class="pbar" style="margin-top:14px"><div class="pfill" style="width:${Math.max(2, Math.min(100, prog))}%"></div></div>
      ${phaseSteps(t)}
      ${t.statusMessage ? `<div class="hint">${esc(t.statusMessage)}</div>` : ''}
      ${agentNames.length ? `<div style="margin-top:12px">${avatarStack(agentNames)}</div>` : ''}
      ${costRows}
      ${(running || t.status === 'awaiting-triage') ? `<div class="report-bar" style="margin-top:16px"><button class="btn" id="tdAmend">✎ Amend run</button>${running ? `<button class="btn danger" id="tdCancel">■ Cancel</button>` : ''}</div>` : ''}
    </div>
    <div class="card"><h3>Goal</h3><div class="md">${md(t.goal || '_(none)_')}</div></div>
  </div>`
  const am = $('#tdAmend'); if (am) am.onclick = () => openAmendPage(t.id, t.title)
  const cc = $('#tdCancel'); if (cc) cc.onclick = async () => { cc.disabled = true; const r = await api('POST', '/api/cancel', { taskId: t.id }); toast(r && !r.error ? 'Cancel sent' : 'Cancel failed', t.id, r && !r.error ? 'ok' : 'err') }
}
async function renderTaskReport() {
  const t = (lastState ? lastState.tasks : []).find(x => String(x.id) === String(tdTaskId)) || { id: tdTaskId }
  const rel = reportForTask(t)
  // SCRIBE is writing — show a live "generating" state; render() keeps polling until the report lands
  if (/generating/i.test(t.status || '')) {
    $('#tdReportBody').innerHTML = `<div class="empty"><div class="spin"></div>Generating report — SCRIBE is writing from the confirmed findings. This takes a few minutes; it'll appear here automatically.</div>`
    return
  }
  if (!rel) { $('#tdReportBody').innerHTML = `<div class="empty">No report yet.${t.status === 'awaiting-triage' ? ' Triage the findings, then click Generate report.' : ' Generate it from the Findings tab.'}</div>`; return }
  $('#tdReportBody').innerHTML = '<div class="skel"></div>'
  await loadReport(rel); $('#tdReportBody').innerHTML = md(reportCache[rel] || '_Could not load report._')
}
// friendly label for a raw artifact filename
function artLabel(name) {
  const m = name.replace(/-t-\d+-[a-f0-9]+/i, '').replace(/\.(json|jsonl|md)$/i, '').replace(/^pentest-/, '')
  return { 'brief': 'Engagement brief', 'env-fingerprint': 'Environment fingerprint', 'tech-stack': 'Tech stack', 'target-profile': 'Target profile', 'scope': 'Scope', 'endpoints': 'Discovered endpoints', 'live-findings': 'Raw findings (live)', 'engagement': 'Engagement', 'triage': 'Triage verdicts' }[m] || m.replace(/[-_]/g, ' ')
}
// attack-surface snapshot box at the top of the Testing-logs tab
function renderReconBox(r) {
  const box = $('#tdReconBox'); if (!box) return
  if (!r || (!r.ports.length && !r.product && !r.endpoints && !r.notablePaths.length)) { box.innerHTML = ''; return }
  const chips = (arr, cls) => arr.map(x => `<span class="rchip ${cls || ''}">${esc(x)}</span>`).join('')
  const facts = [
    r.ports.length ? `<div class="rrow"><span class="rk">Open ports</span><div class="rv">${chips(r.ports, 'port')}</div></div>` : '',
    r.product ? `<div class="rrow"><span class="rk">Product</span><div class="rv">${esc(r.product)}${r.server ? ` <span class="dim">· ${esc(r.server)}</span>` : ''}</div></div>` : '',
    r.waf ? `<div class="rrow"><span class="rk">WAF</span><div class="rv">${esc(r.waf)}</div></div>` : '',
    r.frameworks.length ? `<div class="rrow"><span class="rk">Stack</span><div class="rv">${chips(r.frameworks)}</div></div>` : '',
    r.endpoints ? `<div class="rrow"><span class="rk">Surface</span><div class="rv"><span class="rchip">${r.endpoints.total} URLs</span>${r.endpoints.apis ? `<span class="rchip">${r.endpoints.apis} APIs</span>` : ''}${r.endpoints.forms ? `<span class="rchip">${r.endpoints.forms} forms</span>` : ''}</div></div>` : '',
    r.notablePaths.length ? `<div class="rrow"><span class="rk">Notable paths</span><div class="rv">${chips(r.notablePaths, 'path')}</div></div>` : '',
    r.cveCandidates.length ? `<div class="rrow"><span class="rk">CVE leads</span><div class="rv">${chips(r.cveCandidates, 'cve')}</div></div>` : '',
  ].filter(Boolean).join('')
  box.innerHTML = `<div class="reconhead">Attack surface</div>${facts}`
}
async function renderTaskLogs() {
  const tid = tdTaskId
  const stream = $('#tdLogStream'), arts = $('#tdLogArtifacts')
  if (!stream) return
  if (!tdLogLoaded) stream.innerHTML = '<div class="skel"></div>'
  const r = await api('GET', '/api/logs?taskId=' + encodeURIComponent(tid))
  if (tid !== tdTaskId) return // navigated away while fetching
  tdLogLoaded = true
  const acts = (r && r.activity) || []
  const artifacts = (r && r.artifacts) || []
  renderReconBox(r && r.recon)
  arts.innerHTML = artifacts.length
    ? `<div class="art-lbl">Raw results — download</div>` + artifacts.map(a =>
        `<a class="art" href="/api/report?f=${encodeURIComponent(a.rel)}" download="${esc(a.name)}" title="${esc(a.name)} · ${(a.size / 1024).toFixed(1)} KB">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg>
          <span>${esc(artLabel(a.name))}</span><span class="art-sz">${(a.size / 1024).toFixed(1)} KB</span></a>`).join('')
    : ''
  // The log flows on the page (no internal scroll box) and new lines append at the bottom,
  // so the browser keeps your page-scroll position across this 2.5s re-render — never a yank.
  // We deliberately do NOT touch scroll: you scroll the whole page freely, top to bottom.
  stream.innerHTML = acts.length ? acts.map(a => {
    const det = String(a.details || '').trim()
    const act = String(a.action || a.raw || '').trim()
    const isPhase = /phase\s*[\d.]/i.test(act)
    return `<div class="logrow${isPhase ? ' phase' : ''}">
      <span class="lt">${a.ts ? fmtTime(a.ts) : ''}</span>
      <span class="la">${esc(a.agent || '·')}</span>
      <div class="lc"><div class="lact">${esc(act)}</div>${det && det !== act ? `<pre class="ldet">${esc(det)}</pre>` : ''}</div>
    </div>`
  }).join('') : '<div class="empty">No activity logged for this run yet.</div>'
}

let fnEngagementId = '', fnIterations = [], fnFilter = ''
async function loadFindings() {
  if (!fnTaskId) { $('#fnList').innerHTML = '<div class="empty">No run selected.</div>'; $('#fnActions').style.display = 'none'; $('#fnIterBar').innerHTML = ''; return }
  const r = await api('GET', '/api/findings?taskId=' + encodeURIComponent(fnTaskId))
  fnFindings = (r && r.findings) || []
  fnEngagementId = (r && r.engagementId) || fnTaskId
  fnIterations = (r && r.iterations) || []
  fnVerdicts = {}
  for (const f of fnFindings) fnVerdicts[f.key] = {
    verdict: (f.triage && f.triage.verdict) || 'confirmed',
    severity: (f.triage && f.triage.severity) || f.severity,
    cvss: (f.triage && f.triage.cvss != null) ? f.triage.cvss : f.cvss,
    cvssVector: (f.triage && f.triage.cvssVector) || f.cvssVector || '',
    notes: (f.triage && f.triage.notes) || '',
  }
  $('#tdFnCount').textContent = fnFindings.length
  renderIterBar()
  renderFindings()
}
// iterations bar: filter chips (when >1 iteration) + "Run another test"
function renderIterBar() {
  const multi = fnIterations.length > 1
  const chips = multi ? `<span class="iter-lbl">Iterations</span>` +
    `<button class="iter-chip ${fnFilter === '' ? 'on' : ''}" data-iter="">All · ${fnFindings.length}</button>` +
    fnIterations.map(it => `<button class="iter-chip ${fnFilter === it.taskId ? 'on' : ''}" data-iter="${esc(it.taskId)}">${esc(it.label || 'run')} · ${it.count}</button>`).join('') : ''
  // "Run another test" spawns a live pentest iteration (needs a target URL + engagement), so
  // it applies to black-box and white-box (both route through the pentest engine) but NOT to a
  // standalone static review — there is no live target to re-test. Hiding it there is correct,
  // not a parity gap, and avoids the button erroring with "engagement not found".
  const curT = (lastState ? lastState.tasks : []).find(x => String(x.id) === String(fnTaskId))
  const canIterate = curT && /pentest/.test(String(curT.squad || ''))
  const runBtn = canIterate ? `<button class="btn sm primary" id="fnRunAnother" style="margin-left:auto">＋ Run another test</button>` : ''
  $('#fnIterBar').innerHTML = `${chips}${runBtn}`
  const ra = $('#fnRunAnother'); if (ra) ra.onclick = () => { const f = $('#fnIterForm'); f.style.display = f.style.display === 'none' ? 'block' : 'none' }
  $$('#fnIterBar .iter-chip').forEach(c => c.onclick = () => { fnFilter = c.dataset.iter; renderIterBar(); renderFindings() })
}
// lifecycle pill: agent-confirmed (amber) → validated (green) → scored (green + CVSS) → suspected (grey)
function stagePill(f) {
  const s = f.stage || (f.source === 'validated' ? 'validated' : 'agent-confirmed')
  if (s === 'scored') return `<span class="fstatus ok" title="Validator-confirmed and CVSS-scored">✓ Validated · CVSS</span>`
  if (s === 'validated') return `<span class="fstatus ok" title="Confirmed by the validator (AUDITOR)">✓ Validated</span>`
  if (s === 'agent-confirmed') return `<span class="fstatus amber" title="The finding agent confirmed this — awaiting validator">● Agent-confirmed</span>`
  if (s === 'suspected') return `<span class="fstatus muted" title="Suspected — not yet confirmed">Suspected</span>`
  return ''
}
// runtime-vs-source confirmation badge (keyed on the derived confirmation_status) — makes clear
// whether a finding was proven against the live target or only in the code.
function confirmationBadge(f) {
  switch (f.confirmation_status) {
    case 'RUNTIME_CONFIRMED': return `<span class="fstatus ok" title="Proven against the live target — runtime evidence captured">⚡ Runtime</span>`
    case 'SOURCE_CONFIRMED': return `<span class="fstatus" style="color:#8ab4ff;background:rgba(138,180,255,.13);border:1px solid rgba(138,180,255,.4)" title="Confirmed by reading the code — not fired at a live target">◆ Source</span>`
    case 'NEEDS_LIVE_VALIDATION': return `<span class="fstatus muted" title="Hypothesis — needs a live target to settle">Needs live</span>`
    case 'DISPROVEN': return `<span class="fstatus" style="color:#f87171;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.4)" title="Checked and refuted">Disproven</span>`
    default: return ''
  }
}
// severity summary reflects the CURRENT triage across the WHOLE engagement (overrides applied, rejected excluded)
function recountSummary() {
  const counts = {}; for (const s of SEV) counts[s] = 0
  let cancelled = 0
  for (const f of fnFindings) { const v = fnVerdicts[f.key] || {}; if (v.verdict === 'rejected') { cancelled++; continue } const sv = v.severity || f.severity; counts[sv] = (counts[sv] || 0) + 1 }
  $('#fnSummary').innerHTML = SEV.map(s => `<div class="stat"><div class="n" style="color:var(--sev-${s.toLowerCase()})">${counts[s] || 0}</div><div class="l">${s}</div></div>`).join('')
  const el = $('#tdFnCount'); if (el) el.textContent = cancelled ? `${fnFindings.length - cancelled} (${cancelled} cancelled)` : String(fnFindings.length)
}
function renderFindings() {
  recountSummary()
  if (!fnFindings.length) { $('#fnList').innerHTML = '<div class="empty">No findings for this run yet.</div>'; $('#fnActions').style.display = 'none'; return }
  const shown = fnFindings.filter(f => !fnFilter || f.srcTask === fnFilter)
  $('#fnList').innerHTML = shown.map(f => {
    const v = fnVerdicts[f.key]
    const sevNow = v.severity || f.severity
    const cvssNow = v.cvss != null ? v.cvss : f.cvss
    return `<div class="finding clickable ${v.verdict === 'rejected' ? 'rejected' : ''}" data-fkey="${esc(f.key)}" title="Open finding">
      <div class="fmain">
        <span class="badge fbadge sev-${sevNow.toLowerCase()}">${esc(sevNow)}</span>
        ${cvssNow != null ? `<span class="fcvss">CVSS ${cvssNow}</span>` : ''}
        ${v.verdict === 'rejected' ? '<span class="fcancelled">✕ Cancelled</span>' : stagePill(f) + confirmationBadge(f)}
        <span class="ftitle">${esc(f.title)}</span>
        ${f.iteration ? `<span class="iter-tag">${esc(f.iteration)}</span>` : ''}
        <div class="seg fverdict" data-noopen><button data-fv="confirmed" class="${v.verdict !== 'rejected' ? 'on' : ''}" type="button" title="Confirm">✓</button><button data-fv="rejected" class="${v.verdict === 'rejected' ? 'on' : ''}" type="button" title="Reject">✕</button></div>
        <span class="fopen">open →</span>
      </div>
      <div class="fmeta">${esc(f.agent)}${f.url ? ` · <span class="fmono">${esc(f.method || '')} ${esc(f.url)}</span>` : ''}${v.notes ? ' · <span style="color:var(--accent-2)">noted</span>' : ''}${f.enriched ? ' · <span style="color:var(--ok)">enriched</span>' : ''}</div>
    </div>`
  }).join('') || '<div class="empty">No findings in this iteration.</div>'
  $$('#fnList .finding').forEach(card => {
    const key = card.dataset.fkey
    card.onclick = (e) => { if (e.target.closest('[data-noopen]')) return; openFindingPage(key) }
    card.querySelectorAll('.fverdict button').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      fnVerdicts[key].verdict = b.dataset.fv
      renderFindings() // re-render so the Cancelled tag swaps + count adjusts live
      saveTriage() // persist immediately so opening a finding / navigating never loses the verdict
    })
  })
  $('#fnActions').style.display = 'flex'
  updateTriageState()
}
function updateTriageState() {
  const conf = Object.values(fnVerdicts).filter(v => v.verdict !== 'rejected').length
  const rej = Object.values(fnVerdicts).length - conf
  $('#fnTriageState').textContent = `${conf} confirmed · ${rej} rejected — report will include the ${conf} confirmed`
}
// route each finding's verdict to its source iteration's triage file (byTask)
async function saveTriage() {
  if (!fnFindings.length) return { triaged: 0 }
  const byTask = {}
  for (const f of fnFindings) { const v = fnVerdicts[f.key]; if (!v) continue; (byTask[f.srcTask] = byTask[f.srcTask] || {})[f.id] = v }
  return api('POST', '/api/triage', { byTask })
}
$('#fnSave').onclick = async () => { const r = await saveTriage(); if (r && !r.error) toast('Triage saved', `${r.triaged} verdict(s)`, 'ok'); else toast('Save failed', r && r.error, 'err') }
$('#fnEnrich').onclick = async () => {
  const r = await api('POST', '/api/enrich-findings', { taskId: fnTaskId })
  if (r && !r.error) toast('Enriching findings…', 'AUDITOR writing description / impact / remediation — reload in ~1 min', 'ok')
  else toast('Enrich failed', r && r.error, 'err')
}

/* ── single finding page (structured info + CVSS calculator + notes) ── */
let fdKey = '', fdCalcTouched = false
function openFindingPage(key) {
  const f = fnFindings.find(x => x.key === key); if (!f) return
  const v = fnVerdicts[key] || {}
  fdKey = key
  fdCalcTouched = false
  const sevNow = v.severity || f.severity
  $('#fdTitle').textContent = f.title
  $('#fdSevBadge').textContent = sevNow; $('#fdSevBadge').className = 'badge sev-' + sevNow.toLowerCase()
  const sec = (k, val, mono) => `<div class="fsec"><div class="fk">${k}</div>${val ? (mono ? `<pre class="fv mono">${esc(val)}</pre>` : `<div class="fv">${esc(val)}</div>`) : '<div class="fv dim">— not provided · use “Enrich details”</div>'}</div>`
  const steps = Array.isArray(f.testSteps) && f.testSteps.length
    ? `<div class="fsec"><div class="fk">Reproduction steps</div><ol class="fsteps">${f.testSteps.map(s => `<li>${esc(String(s).replace(/^step\s*\d+\s*[:.\-]\s*/i, ''))}</li>`).join('')}</ol></div>`
    : ''
  // POC block — CURL Request (+ raw HTTP request for "modify the request below" cases). The
  // response is intentionally omitted; the "Observed that …" step is the proof, and dumping
  // full responses bloats the report.
  const pocRow = (label, val) => val ? `<div class="pocrow"><div class="fk sub">${label}</div><pre class="fv mono">${esc(val)}</pre></div>` : ''
  // Source location line: live URL for runtime findings, file:line for source findings.
  const locSec = f.url
    ? sec('Vulnerable URL', (f.method ? f.method + ' ' : '') + f.url)
    : (f.file ? sec('Source location', f.file + (f.line ? ':' + f.line : '')) : '')
  // Static / white-box: show the VULNERABLE CODE BLOCK (file:line + snippet) — no HTTP request.
  const codeSec = f.codeBlock
    ? `<div class="fsec pocsec"><div class="fk poc">Vulnerable code${f.file ? ` · ${esc(f.file)}${f.line ? ':' + f.line : ''}` : ''}</div><pre class="fv mono">${esc(f.codeBlock)}</pre></div>`
    : ''
  // Static taint trace (untrusted input → vulnerable sink) — the most valuable part of a source finding.
  const dfSec = f.dataFlow ? sec('Data flow', f.dataFlow) : ''
  // POC (CURL Request, no response) — ONLY for findings with a live URL. Static code review
  // needs none; the vulnerable code block above is the proof.
  const pocBlock = f.url && (f.poc || f.rawRequest)
    ? `<div class="fsec pocsec"><div class="fk poc">POC</div>${pocRow('CURL Request', f.poc)}${f.rawRequest && f.rawRequest !== f.poc ? pocRow('HTTP Request', f.rawRequest) : ''}</div>`
    : (!f.codeBlock && !f.url && f.poc ? `<div class="fsec pocsec"><div class="fk poc">POC</div>${pocRow('Command', f.poc)}</div>` : '')
  const tags = [
    f.cvss != null ? `<span class="fcvss">CVSS ${f.cvss}</span>` : '',
    f.cwe ? `<span class="fcwe">${esc(f.cwe)}</span>` : '',
    stagePill(f),
    confirmationBadge(f),
  ].filter(Boolean).join(' ')
  $('#fdInfo').innerHTML = `<h3>${esc(f.id)} · ${esc(f.agent || '')} ${tags}</h3>
    ${sec('Description', f.description)}
    ${locSec}
    ${steps}
    ${codeSec}
    ${dfSec}
    ${pocBlock}
    ${sec('Impact', f.impact)}
    ${sec('Remediation', f.remediation)}`
  $$('#fdVerdict button').forEach(b => b.classList.toggle('on', (v.verdict || 'confirmed') === b.dataset.fv))
  $('#fdSev').innerHTML = SEV.map(s => `<option ${sevNow === s ? 'selected' : ''}>${s}</option>`).join('')
  const m = parseVector(v.cvssVector || f.cvssVector)
  $('#fdCvssCalc').innerHTML = Object.entries(CVSS_METRICS).map(([k, def]) =>
    `<label class="cvss-m"><span>${def.label}</span><select data-m="${k}">${def.opts.map(([val, lbl]) => `<option value="${val}" ${m[k] === val ? 'selected' : ''}>${lbl} (${val})</option>`).join('')}</select></label>`).join('')
  $('#fdNotes').value = v.notes || ''
  // metric change → operator is using the calc → it drives severity
  $$('#fdCvssCalc select').forEach(s => s.onchange = () => { fdCalcTouched = true; recalcCvss(true) })
  // manual severity override → reflect on the header badge, independent of the calc
  $('#fdSev').onchange = () => setSevBadge($('#fdSev').value)
  // initial display: show score/vector but DO NOT override the stored severity
  recalcCvss(false)
  const storedCvss = (v.cvss != null ? v.cvss : f.cvss)
  const hasVector = !!(v.cvssVector || f.cvssVector)
  if (!hasVector && storedCvss != null) {
    // no vector to seed the calc — show the finding's stored score, not the calc's 0.0
    $('#fdScore').textContent = Number(storedCvss).toFixed(1)
    $('#fdScoreSev').textContent = sevNow; $('#fdScoreSev').className = 'badge sev-' + sevNow.toLowerCase()
  }
  $('#fdSev').value = sevNow            // operator's stored severity (NOT calc-derived)
  setSevBadge(sevNow)
  show('finding')
}
function setSevBadge(sev) { $('#fdSevBadge').textContent = sev; $('#fdSevBadge').className = 'badge sev-' + String(sev).toLowerCase() }
function readCvssMetrics() { const m = {}; $$('#fdCvssCalc select').forEach(s => m[s.dataset.m] = s.value); return m }
// follow=true (operator changed a metric) → also set the severity dropdown + badge.
// follow=false (initial render) → update score/vector display only; leave severity alone.
function recalcCvss(follow = true) {
  const { score, vector } = cvss31(readCvssMetrics())
  const sev = sevFromScore(score)
  $('#fdScore').textContent = score.toFixed(1)
  $('#fdVector').textContent = vector
  $('#fdScoreSev').textContent = sev; $('#fdScoreSev').className = 'badge sev-' + sev.toLowerCase()
  if (follow) { $('#fdSev').value = sev; setSevBadge(sev) }
}
$$('#fdVerdict button').forEach(b => b.onclick = () => $$('#fdVerdict button').forEach(x => x.classList.toggle('on', x === b)))
$('#fdBack').onclick = () => { show('task'); setTdSub('findings') }
$('#fdSave').onclick = async () => {
  const verdict = ($('#fdVerdict button.on') || {}).dataset?.fv || 'confirmed'
  const severity = $('#fdSev').value
  // CVSS: only use the calc if the operator actually touched it — otherwise keep the
  // finding's stored score/vector (prevents clobbering to 0.0 when there's no vector).
  let cvss, vector
  if (fdCalcTouched) { const c = cvss31(readCvssMetrics()); cvss = c.score; vector = c.vector }
  else { const f = fnFindings.find(x => x.key === fdKey) || {}; const vv = fnVerdicts[fdKey] || {}; cvss = (vv.cvss != null ? vv.cvss : f.cvss); vector = vv.cvssVector || f.cvssVector || '' }
  fnVerdicts[fdKey] = { verdict, severity, cvss, cvssVector: vector, notes: $('#fdNotes').value.trim() }
  const r = await saveTriage()
  if (r && !r.error) { toast('Finding saved ✓', `${(fnFindings.find(x => x.key === fdKey) || {}).id || ''} · ${cvss != null ? 'CVSS ' + Number(cvss).toFixed(1) + ' ' : ''}${severity}`, 'ok'); show('task'); setTdSub('findings') }
  else toast('Save failed', r && r.error, 'err')
}
$('#fnGen').onclick = async () => {
  const btn = $('#fnGen'); if (btn.disabled) return // guard against double-spawn
  btn.disabled = true
  const s = await saveTriage(); if (s && s.error) { btn.disabled = false; return toast('Save failed', s.error, 'err') }
  // target the engagement root → daemon aggregates confirmed findings across all iterations
  const r = await api('POST', '/api/generate-report', { taskId: fnEngagementId || fnTaskId })
  if (r && !r.error) { toast('Generating report ✓', 'SCRIBE writing from confirmed findings — appears on the Report tab in a few minutes', 'ok'); setTdSub('report') }
  else toast('Generate failed', r && r.error, 'err')
  setTimeout(() => { btn.disabled = false }, 8000) // re-enable after the request settles
}
// ── run another iteration on this engagement ──
$('#itCancel').onclick = () => { $('#fnIterForm').style.display = 'none' }
$$('#itFocusClasses button').forEach(b => b.onclick = () => b.classList.toggle('on'))
$('#itRun').onclick = async () => {
  const focusClasses = $$('#itFocusClasses button.on').map(b => b.dataset.cls)
  const r = await api('POST', '/api/iterate', { engagementId: fnEngagementId, focusClasses, skipRecon: false })
  if (r && !r.error) {
    toast('Iteration started ✓', `${r.iterationLabel} — runs independently, results will append`, 'ok')
    $('#fnIterForm').style.display = 'none'
    $$('#itFocusClasses button').forEach(b => b.classList.remove('on'))
    show('tasks'); tick()
  } else toast('Iteration failed', r && r.error, 'err')
}

/* ── amend a run ── */
let amTaskId = '', amBackTo = 'tasks'
function openAmendPage(taskId, title) {
  amTaskId = taskId
  amBackTo = currentView === 'amend' ? amBackTo : currentView
  $('#amTitle').textContent = 'Amend: ' + (title || taskId)
  $('#amInstr').value = ''; $('#amScope').value = ''
  $('#amInfo').innerHTML = md(`Amending **${title || taskId}** appends your instructions to the engagement brief and merges any hosts into the task's scope config.\n\n- Remaining phases + the report use the amended brief.\n- New in-scope hosts pass the scope gate.\n\n> Agents run autonomously, so this steers remaining/forthcoming work — it doesn't interrupt an agent mid-action.`)
  show('amend')
}
$('#amBack').onclick = () => show(amBackTo || 'tasks')
$('#amApply').onclick = async () => {
  const instructions = $('#amInstr').value.trim()
  const addScope = $('#amScope').value.split('\n').map(s => s.trim()).filter(Boolean)
  if (!instructions && !addScope.length) { toast('Nothing to amend', 'Add instructions or scope', 'err'); return }
  const r = await api('POST', '/api/amend', { taskId: amTaskId, instructions, addScope })
  if (r && !r.error) { toast('Amendment applied ✓', amTaskId, 'ok'); show(amBackTo || 'tasks') }
  else toast('Amend failed', r && r.error, 'err')
}

/* ── squads ── */
function renderSquads() {
  $('#cSquads').textContent = SQUADS.filter(s => s.id !== 'universal' && !s.hidden).length
  $('#squadList').innerHTML = SQUADS.filter(s => !s.hidden).map(sq => `<div class="squad" style="--sq:${squadHue(sq.id)}">
    <div class="banner"><span class="name">${esc(sq.id)}</span></div>
    <div class="body">
      ${sq.leader !== '—' ? `<div class="lead">${avatar(sq.leader, 26)} <b>${esc(sq.leader)}</b><span style="color:var(--fg-dim);font-size:11px">leads</span></div>` : '<div class="lead"><b style="color:var(--fg-mut)">cross-squad</b></div>'}
      <div class="type">${esc(sq.type || '')} · ${sq.agents.length} personas</div>
      ${sq.phases.length ? `<div class="stepper" style="margin:4px 0 14px">${sq.phases.map(p => `<div class="step">${esc(p)}</div>`).join('')}</div>` : ''}
      <div class="chips">${sq.agents.map(a => `<span class="chip">${esc(a)}</span>`).join('')}</div>
    </div>
  </div>`).join('')

  const sel = $('#fSquad')
  sel.innerHTML = SQUADS.filter(s => s.id !== 'universal' && !s.hidden).map(s => `<option value="${esc(s.id)}">${esc(s.id)} — leader ${esc(s.leader)}</option>`).join('')
  updateDispatchInfo()
}
const isCR = () => $('#fSquad').value === 'code-review'
const isPT = () => $('#fSquad').value === 'pentest'

// ── pentest credential rows ──
function credRow(u = '', p = '', role = 'normal') {
  const div = document.createElement('div')
  div.className = 'credrow'
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center'
  div.innerHTML = `<input class="input cu" placeholder="username" value="${esc(u)}" style="flex:2">
    <input class="input cp" placeholder="password" value="${esc(p)}" style="flex:2">
    <select class="select cr" style="flex:1">
      <option value="admin"${role === 'admin' ? ' selected' : ''}>admin</option>
      <option value="normal"${role === 'normal' ? ' selected' : ''}>normal</option>
      <option value="other"${role === 'other' ? ' selected' : ''}>other</option>
    </select>
    <button type="button" class="btn sm danger cx" title="remove" style="flex:0 0 auto">✕</button>`
  div.querySelector('.cx').onclick = () => div.remove()
  return div
}
function ensureCredRows() { if (!$('#ptCreds').children.length) $('#ptCreds').appendChild(credRow()) }
if ($('#ptAddCred')) $('#ptAddCred').onclick = () => $('#ptCreds').appendChild(credRow())

// ATLAS → specialist waves → triage. Pass the squad's roster; falls back to defaults.
// Purely presentational overview diagram (.dvz-* styles live in app.css); safe to add/remove.
function squadDispatchViz(sq) {
  const SPEC_HUE = { SCOUT:'#22d3ee', VIPER:'#fb7185', DRILL:'#fbbf24',
    RELAY:'#9ba2ff', WARDEN:'#34d399', GATEWAY:'#b08cff' }
  const lead = (sq && sq.leader) || 'ATLAS'
  const specs = ((sq && sq.agents) || Object.keys(SPEC_HUE)).slice(0, 6)
  const pkts = specs.map((_, i) =>
    `<span class="pkt" style="left:${8 + i * (84 / Math.max(1, specs.length - 1))}%;animation-delay:${(i * .35).toFixed(2)}s"></span>`).join('')
  const cards = specs.map((a, i) => {
    const hue = SPEC_HUE[String(a).toUpperCase()] || '#9ba2ff'
    return `<div class="dvz-spec" style="--sp:${hue};animation-delay:${(i * .3).toFixed(2)}s"><b>${esc(a)}</b><span></span></div>`
  }).join('')
  return `<div class="dvz">
    <div class="dvz-lead-row"><div class="dvz-lead"><b>${esc(lead)}</b><span>lead · plans the attack walk</span></div></div>
    <div class="dvz-rail"><span class="down"></span><span class="flow"></span>${pkts}</div>
    <div class="dvz-specs">${cards}</div>
    <div class="dvz-triage-row"><div class="dvz-triage"><span class="dot"></span><span>every finding → TRIAGER → AUDITOR → you</span></div></div>
  </div>`
}
function updateDispatchInfo() {
  const sq = SQUAD_BY[$('#fSquad').value]; if (!sq) return
  const cr = isCR(), pt = isPT()
  // code-review + pentest swap the free-text target for a structured form
  $('#crFields').style.display = cr ? 'block' : 'none'
  $('#ptFields').style.display = pt ? 'block' : 'none'
  $('#fGoalField').style.display = (cr || pt) ? 'none' : 'block'
  if (pt) ensureCredRows()
  $('#fSquadHint').textContent = cr
    ? `White-box review: ${sq.leader} discovers + consolidates; specialists map per-feature then assess per vuln-class.`
    : pt
    ? `${sq.leader} runs recon → specialists → AUDITOR verify → ARBITER judge → SCRIBE report. Scope is hard-enforced at Phase 0.`
    : `Leader ${sq.leader} coordinates ${sq.agents.length} personas through ${sq.phases.length} phases.`
  $('#dispatchInfo').innerHTML = squadDispatchViz(sq) + md(cr
    ? `**Code review (white-box, phase1-maps method)** on a local source tree.\n\n`
      + `1. **Inventories** — scripted multi-language enumeration\n2. **Feature queue** — CURATOR auto-discovers features from the surface\n`
      + `3. **Feature mapping** — one agent per feature → \`features/<slug>.md\`\n4. **Consolidation** — CURATOR → coverage matrices + review queue\n`
      + `5. **Vuln assessment** — per feature × class (access-control → MARSHAL, XSS → CIPHER)\n6. **Verify** — AUDITOR (+ PROBER if Deploy URL)\n7. **Report** — SCRIBE\n\n`
      + `Artifacts land under \`phase1-maps/\` + \`phase2/\`, viewable in **Reports**.\n\n> Stack-agnostic: works for any project (Rails, Django, Express, Spring, Laravel, Go, .NET, …); breadth scales with codebase size.`
    : pt
    ? `**Web pentest** of the target URL.\n\n`
      + `On dispatch the console writes a **scope config** (\`scope-<taskId>.json\`) and an **engagement brief** (target, scope, focus, the test-account table).\n\n`
      + `1. **Phase 0** scope hard-block (out-of-scope hosts rejected)\n2. **Recon** (SCOUT, RANGER) — auth/WAF/surface\n3. **Specialists** — per vuln class, authenticating with your test accounts\n4. **AUDITOR** verify → **ARBITER** judge → **SCRIBE** report\n\n`
      + `> **Full** tests the whole app; **Feature-driven** focuses on what you name. Each role is tested for cross-role authz (IDOR / priv-esc). Out-of-scope hosts are never touched.`
    : `Dispatching to **${sq.id}** queues a task for **${sq.leader}**.\n\nThe daemon picks it up within seconds and runs the pipeline:\n\n`
      + sq.phases.map((p, i) => `${i + 1}. **${p}**`).join('\n')
      + `\n\nLive status, per-agent cost and model routing appear under **Tasks**. The final report lands under **Reports**.\n\n> Dispatch & cancel flow through the daemon's inbox — the console never writes core state directly.`)
}
$('#fSquad').addEventListener('change', updateDispatchInfo)
$$('#fPriority button').forEach(b => b.onclick = () => { $$('#fPriority button').forEach(x => x.classList.remove('on')); b.classList.add('on') })
$$('#ptType button').forEach(b => b.onclick = () => { $$('#ptType button').forEach(x => x.classList.remove('on')); b.classList.add('on'); $('#ptFocusField').style.display = b.dataset.v === 'feature' ? 'block' : 'none' })
// focus-class chips: multi-select toggle (none on = full A→Z). The "Custom /
// abuse-driven" chip (data-custom) reveals the free-text box instead of being a class.
$$('#ptFocusClasses button').forEach(b => b.onclick = () => {
  b.classList.toggle('on')
  if (b.dataset.custom) { $('#ptCustomFocusWrap').style.display = b.classList.contains('on') ? 'block' : 'none'; if (b.classList.contains('on')) $('#ptCustomFocus').focus() }
})
// ── test-type mode: Black-box / Static Analysis / White-box → reshape the form ──
//   black-box      = live target only
//   static (analysis) = source code review only (no live testing; URL optional)
//   white-box      = source review + live pentest together (URL required + source)
function applyPtMode(mode) {
  const stat = mode === 'static', wb = mode === 'whitebox', bb = mode === 'blackbox'
  $('#ptSourceGroup').style.display = (stat || wb) ? 'block' : 'none'   // source needed for static + white-box
  $('#ptBlackGroup').style.display = (bb || wb) ? 'block' : 'none'      // live scope for black-box + white-box
  $('#ptStrategyField').style.display = (bb || wb) ? 'block' : 'none'
  $('#ptUrlReq').style.display = stat ? 'none' : 'inline'              // URL optional only in Static Analysis
  $('#ptUrlLabel').firstChild.nodeValue = stat ? 'Deployed URL ' : 'Web application URL '
  $('#ptUrlHint').textContent = stat
    ? 'Optional — if the source is deployed, agents runtime-validate the source findings against this live URL.'
    : 'The primary live target. Its host is auto-added to in-scope.'
}
$$('#ptMode button').forEach(b => b.onclick = () => { $$('#ptMode button').forEach(x => x.classList.remove('on')); b.classList.add('on'); applyPtMode(b.dataset.v) })
if ($('#ptMode')) applyPtMode('blackbox')

/* ── dispatch ── */
$('#fSubmit').onclick = async () => {
  const squad = $('#fSquad').value
  let body
  if (isCR()) {
    const sourceDir = $('#crSourceDir').value.trim()
    if (!sourceDir) { toast('Source directory required', 'Absolute path to the source tree', 'err'); $('#crSourceDir').focus(); return }
    const vulnClasses = $$('#crClasses input:checked').map(c => c.value)
    const meta = { sourceDir }
    if (vulnClasses.length) meta.vulnClasses = vulnClasses
    const dep = $('#crDeployUrl').value.trim(); if (dep) meta.deployUrl = dep
    const mf = +$('#crMaxFeatures').value; if (mf > 0) meta.maxFeatures = mf
    const mp = +$('#crMaxPhase2').value; if (mp > 0) meta.maxPhase2 = mp
    body = { squad, taskTitle: $('#fTitle').value.trim() || undefined, priority: ($('#fPriority button.on') || {}).dataset?.v || 'normal', meta }
  } else if (isPT()) {
    const mode = ($('#ptMode button.on') || {}).dataset?.v || 'blackbox'
    const targetUrl = $('#ptUrl').value.trim()
    const sourceDir = $('#ptSourceDir').value.trim()
    const prio = ($('#fPriority button.on') || {}).dataset?.v || 'normal'
    const title = $('#fTitle').value.trim() || undefined
    const credentials = $$('#ptCreds .credrow').map(r => ({
      username: r.querySelector('.cu').value.trim(), password: r.querySelector('.cp').value, role: r.querySelector('.cr').value,
    })).filter(c => c.username)

    if (mode === 'static') {
      // Static Analysis → source-only code-review squad; URL (if given) becomes the runtime-validation target
      if (!sourceDir) { toast('Source directory required', 'Absolute path to the source tree', 'err'); $('#ptSourceDir').focus(); return }
      const meta = { sourceDir }   // stack auto-detected by the code-review engine (stack-agnostic)
      if (targetUrl) meta.deployUrl = targetUrl
      if (credentials.length) meta.testAccounts = { attacker: credentials[0], ...(credentials[1] ? { victim: credentials[1] } : {}) }
      body = { squad: 'code-review', taskTitle: title, priority: prio, meta }
    } else {
      // black-box OR white-box → live pentest (white-box also runs a source-review iteration)
      if (!targetUrl) { toast('Target URL required', 'e.g. https://app.example.com', 'err'); $('#ptUrl').focus(); return }
      const testType = ($('#ptType button.on') || {}).dataset?.v || 'full'
      const featureFocus = $('#ptFocus').value.trim()
      if (testType === 'feature' && !featureFocus) { toast('Focus required', 'Name the features to focus on', 'err'); $('#ptFocus').focus(); return }
      const lines = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean)
      const meta = { targetUrl, testType, inScope: lines('#ptInScope'), outOfScope: lines('#ptOutScope'), credentials, skipRecon: false, focusClasses: $$('#ptFocusClasses button.on').map(b => b.dataset.cls).filter(Boolean) }
      if (testType === 'feature') meta.featureFocus = featureFocus
      const customFocus = $('#ptCustomChip').classList.contains('on') ? $('#ptCustomFocus').value.trim() : ''
      if (customFocus) meta.customFocus = customFocus
      if (mode === 'whitebox') {
        if (!sourceDir) { toast('Source directory required', 'White-box needs a live URL and a source directory', 'err'); $('#ptSourceDir').focus(); return }
        meta.sourceDir = sourceDir   // stack auto-detected (stack-agnostic)
      }
      body = { squad: 'pentest', taskTitle: title, priority: prio, meta }
    }
  } else {
    const goal = $('#fGoal').value.trim()
    if (!goal) { toast('Goal required', 'Describe the target or task', 'err'); $('#fGoal').focus(); return }
    body = { squad, goal, taskTitle: $('#fTitle').value.trim() || goal.slice(0, 80), priority: ($('#fPriority button.on') || {}).dataset?.v || 'normal', model: $('#fModel').value || undefined }
  }
  $('#fSubmit').disabled = true
  const r = await api('POST', '/api/dispatch', body)
  $('#fSubmit').disabled = false
  if (r && !r.error) { toast('Dispatched ✓', `${r.assignee} · ${r.taskId}`, 'ok'); $('#fGoal').value = ''; $('#fTitle').value = ''; $('#crSourceDir').value = ''; $('#ptSourceDir').value = ''; $('#ptCustomFocus').value = ''; const cc = $('#ptCustomChip'); if (cc) cc.classList.remove('on'); $('#ptCustomFocusWrap').style.display = 'none'; $$('#ptMode button').forEach(x => x.classList.toggle('on', x.dataset.v === 'blackbox')); applyPtMode('blackbox'); show('tasks'); tick() }
  else toast('Dispatch failed', r && r.error, 'err')
}

/* ── api + polling ── */
async function api(method, url, body) {
  try { return await (await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json() }
  catch (e) { return { error: String(e.message || e) } }
}
// Live-validate a source directory as it is typed (the daemon reads the tree straight off local
// disk, so a wrong or non-absolute path fails the run). Shows a green readable line or a red error.
function wireSourceCheck(inputId, hintId) {
  const inp = document.getElementById(inputId), hint = document.getElementById(hintId)
  if (!inp || !hint) return
  let t
  const run = async () => {
    const dir = inp.value.trim()
    if (!dir) { hint.textContent = ''; hint.className = 'hint scheck'; inp.classList.remove('src-ok', 'src-bad'); return }
    const r = await api('GET', '/api/check-source?dir=' + encodeURIComponent(dir))
    if (r && r.ok) { hint.textContent = `✓ readable · ${r.entries} entries`; hint.className = 'hint scheck ok'; inp.classList.add('src-ok'); inp.classList.remove('src-bad') }
    else { hint.textContent = `✗ ${r && r.error || 'invalid path'}`; hint.className = 'hint scheck bad'; inp.classList.add('src-bad'); inp.classList.remove('src-ok') }
  }
  inp.addEventListener('blur', run)
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 700) })
}
wireSourceCheck('crSourceDir', 'crSourceCheck')
wireSourceCheck('ptSourceDir', 'ptSourceCheck')
async function tick() { const s = await api('GET', '/api/state'); if (s && !s.error) render(s); if (currentView === 'overview') renderHealth() }
// System Health card — the Operational Supervisor's latest snapshot
async function renderHealth() {
  const el = $('#ovHealth'); if (!el) return
  const h = await api('GET', '/api/health'); if (!h || h.error) { el.innerHTML = '<div class="empty">health unavailable</div>'; return }
  if (h.ok === null) { el.innerHTML = `<div class="empty">${esc(h.note || 'supervisor starting…')}</div>`; return }
  const pill = (ok) => `<span class="hstat ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '⚠'}</span>`
  const rows = (h.checks || []).map(c => `<div class="hrow">${pill(c.ok)}<span class="hk">${esc(c.name.replace(/_/g, ' '))}</span><span class="hv ${c.ok ? '' : 'dim'}">${esc(c.detail || '')}${c.autoFixed ? ' <span class="hfix">auto-fixed</span>' : ''}</span></div>`).join('')
  const q = h.queue || {}, t = h.tasks || {}
  const meta = `<div class="hmeta">queue ${q.pending || 0} pending · ${q.processing || 0} processing${q.stuckProcessing ? ` · <span class="warn">${q.stuckProcessing} stuck</span>` : ''} &nbsp;|&nbsp; ${t.inProgress || 0} in-progress · ${t.liveAgents || 0} live agents${t.zombie ? ` · <span class="warn">${t.zombie} zombie</span>` : ''} &nbsp;|&nbsp; uptime ${h.daemonUptimeS != null ? Math.round(h.daemonUptimeS / 60) + 'm' : '—'}</div>`
  const fixes = (h.recentFixes || []).length ? `<div class="hfixes">recent: ${h.recentFixes.map(f => esc(f)).join(' · ')}</div>` : ''
  const sent = h.sentinel ? `<div class="hsent">🩺 SENTINEL: ${esc(h.sentinel.diagnosis || '')}${h.sentinel.fix ? ` — fix: ${esc(h.sentinel.fix)}` : ''}</div>` : ''
  $('#healthSub').textContent = h.ok ? 'all systems healthy · every 10s' : 'anomaly detected · every 10s'
  $('#healthSub').className = 'sub ' + (h.ok ? '' : 'warn')
  el.innerHTML = `<div class="hbanner ${h.ok ? 'ok' : 'warn'}">${h.ok ? '✓ All operational invariants healthy' : '⚠ Anomaly — see below'}</div>${rows}${meta}${fixes}${sent}`
}
async function boot() {
  const r = await api('GET', '/api/squads')
  SQUADS = (r && r.squads) || []
  SQUAD_BY = Object.fromEntries(SQUADS.map(s => [s.id, s]))
  renderSquads(); await tick(); setInterval(tick, 2500)
}
boot()
