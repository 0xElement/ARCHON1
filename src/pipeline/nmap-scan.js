'use strict'
// nmap-scan.js — deterministic, daemon-run service scan. The "heart truth".
//
// The user gives http://<target> (often no port), but the real attack surface is
// every open port/service on the HOST — FTP, SSH, a web app on :3000, an API on
// :8080, a DB, etc. Letting an LLM recon agent "remember" to run nmap is flaky and
// its output never becomes a structured artifact the pipeline keys off. So we run
// nmap ourselves, ONCE, before the recon agents, and write nmap-<taskId>.json that
// every downstream agent + the crawl read as ground truth.
//
// Scan: nmap -sV -p- --min-rate 3000 -T4 --open  (all 65535 ports, version detect,
// fast). Connect scan (unprivileged) so it runs without root. Bounded by a timeout.

const { execFile, spawn } = require('node:child_process')

// host from a URL or bare host:port — port-agnostic (we scan the whole host)
function extractHost(target) {
  const t = String(target || '').trim()
  try { return new URL(/^[a-z]+:\/\//i.test(t) ? t : 'http://' + t).hostname }
  catch { return t.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0] }
}

// parse nmap -oX XML → [{port, proto, state, service, product, version}] (open only)
function parseNmapXml(xml) {
  const ports = []
  const portRe = /<port\s+protocol="(\w+)"\s+portid="(\d+)">([\s\S]*?)<\/port>/g
  let m
  while ((m = portRe.exec(String(xml || '')))) {
    const [, proto, portid, body] = m
    if (((body.match(/<state\s+state="(\w+)"/) || [])[1] || '') !== 'open') continue
    const svc = (body.match(/<service\s+([^>]*?)\/?>/) || [])[1] || ''
    const attr = k => (svc.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || ''
    ports.push({ port: +portid, proto, state: 'open', service: attr('name'), product: attr('product'), version: attr('version') })
  }
  return ports
}

const HTTP_SVC = /^(http|https|http-alt|http-proxy|https-alt|ssl\/http|sslhttp|ssl)$/i
const WEB_PORTS = new Set([80, 443, 8080, 8000, 8443, 3000, 5000, 8888, 9000, 8081, 4000, 8001])
// Common port → service name, for inferring service when nmap -sV gets no version detail
// over a lossy link (naabu confirmed the port is open; we still want sensible labels + web URLs).
const PORT_SVC = { 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 80: 'http', 110: 'pop3', 111: 'rpcbind', 135: 'msrpc', 139: 'netbios-ssn', 143: 'imap', 389: 'ldap', 443: 'https', 445: 'microsoft-ds', 993: 'imaps', 995: 'pop3s', 1433: 'ms-sql', 1521: 'oracle', 2049: 'nfs', 3000: 'http', 3306: 'mysql', 3389: 'rdp', 5000: 'http', 5432: 'postgresql', 5900: 'vnc', 6379: 'redis', 8000: 'http', 8080: 'http', 8443: 'https', 8888: 'http', 9000: 'http', 9200: 'http', 11211: 'memcached', 27017: 'mongodb' }
// every web service → a URL the pipeline should crawl/test (default ports drop the :port)
function httpServicesOf(host, ports) {
  const urls = []
  for (const p of ports) {
    const https = /https|ssl/i.test(p.service) || p.port === 443 || p.port === 8443
    if (!(HTTP_SVC.test(p.service) || WEB_PORTS.has(p.port))) continue
    const scheme = https ? 'https' : 'http'
    const isDefault = (scheme === 'https' && p.port === 443) || (scheme === 'http' && p.port === 80)
    urls.push(isDefault ? `${scheme}://${host}` : `${scheme}://${host}:${p.port}`)
  }
  return [...new Set(urls)]
}

// Fast full-port discovery with naabu (ProjectDiscovery). Returns an array of open
// ports ([] if it ran and found none), or null when naabu isn't installed (caller then
// falls back to nmap -p-). Far faster than nmap -p- and survives a lossy VPN that times
// a full nmap out. Output is `host:port` per line (-silent). Connect scan (no root needed).
function runNaabu(host, { timeoutMs = 45000 } = {}) {
  const parse = s => [...new Set(String(s).split('\n')
    .map(l => { const m = l.match(/:(\d{1,5})\s*$/); return m ? +m[1] : null })
    .filter(p => p && p > 0 && p < 65536))]
  return new Promise(resolve => {
    let out = '', done = false
    const fin = v => { if (!done) { done = true; resolve(v) } }
    let child
    // -tp 1000 (top-1000 ports), NOT full: a full 65535-port scan over a lossy/high-latency
    // VPN is glacial (timed out >4min finding nothing) while top-1000 finds the real ports
    // — web 80/443/8080/8443/3000/5000 + common services — in ~7s. No --rate (the default is
    // reliable; -rate 10000 floods a lossy link and drops ports). stdin = 'ignore' (/dev/null)
    // is THE hang fix: naabu also reads hosts from stdin, so an open stdin blocks forever.
    try { child = spawn('naabu', ['-host', host, '-tp', '1000', '-silent'], { stdio: ['ignore', 'pipe', 'ignore'] }) }
    catch { return fin(null) }
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} ; fin(parse(out)) }, timeoutMs)
    child.on('error', e => { clearTimeout(timer); fin(e && e.code === 'ENOENT' ? null : parse(out)) }) // ENOENT = not installed
    child.stdout.on('data', d => { out += d })
    child.on('close', () => { clearTimeout(timer); fin(parse(out)) })
  })
}

// Recon port scan: naabu (fast discovery) → nmap -sV on JUST the open ports (quick
// service/version detection). Falls back to a full nmap -p- only if naabu is missing.
async function runNmapScan(target, { timeoutMs = 8 * 60 * 1000, ip } = {}) {
  // scan the box IP when given (hostname targets that aren't in DNS); else the URL host.
  // httpServices still report the original host so the vhost flows downstream.
  const host = (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) ? ip : extractHost(target)
  if (!host || !/^[a-zA-Z0-9.\-]+$/.test(host)) {
    return { ok: false, host, error: 'invalid host', ports: [], httpServices: [] }
  }
  // Phase A — naabu fast discovery.
  const naabuPorts = await runNaabu(host)
  // naabu ran and found NOTHING → no open ports, skip nmap entirely.
  if (Array.isArray(naabuPorts) && naabuPorts.length === 0) {
    return { ok: true, host, scannedAt: new Date().toISOString(), command: 'naabu -tp 1000 (0 open ports)', ports: [], httpServices: [] }
  }
  // Phase B — nmap -sV on the discovered ports (fast), or full -p- if naabu is absent.
  // -Pn: naabu already confirmed the host + ports are up, so skip nmap's host discovery
  // (it fails over a lossy VPN). naabu remains the source of truth for OPEN PORTS; nmap
  // only ADDS service/version detail — if it returns nothing (lossy link chokes its
  // version probes), we fall back to naabu's ports with port-based service inference.
  const usedNaabu = Array.isArray(naabuPorts) && naabuPorts.length > 0
  const args = usedNaabu
    ? ['-sV', '-Pn', '-p', naabuPorts.join(','), '-T4', '--open', '-oX', '-', host]
    : ['-sV', '-p-', '--min-rate', '3000', '-T4', '--open', '-oX', '-', host]
  return new Promise(resolve => {
    execFile('nmap', args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      let ports = parseNmapXml(stdout)
      // Fallback: nmap found nothing but naabu DID → trust naabu's ports (infer service by port).
      if (!ports.length && usedNaabu) {
        ports = naabuPorts.map(p => ({ port: p, proto: 'tcp', state: 'open', service: PORT_SVC[p] || '', product: '', version: '' }))
        return resolve({ ok: true, host, scannedAt: new Date().toISOString(),
          command: `naabu -tp 1000 → nmap -sV (no version detail over lossy link; using naabu ports ${naabuPorts.join(',')})`,
          ports, httpServices: httpServicesOf(host, ports) })
      }
      if (!ports.length && err) {
        return resolve({ ok: false, host, error: err.killed ? `timeout after ${Math.round(timeoutMs / 60000)}min` : err.message, ports: [], httpServices: [] })
      }
      resolve({ ok: true, host, scannedAt: new Date().toISOString(),
        command: usedNaabu ? `naabu -tp 1000 → nmap -sV -Pn -p ${naabuPorts.join(',')}` : 'nmap ' + args.join(' '),
        ports, httpServices: httpServicesOf(host, ports) })
    })
  })
}

// one-line summary for logs/recon panel: "21/tcp ftp vsftpd 3.0.3, 22/tcp ssh ..."
function nmapSummary(r) {
  if (!r || !r.ok || !r.ports.length) return ''
  return r.ports.map(p => `${p.port}/${p.proto} ${p.service || '?'}${p.product ? ' ' + p.product : ''}${p.version ? ' ' + p.version : ''}`).join(', ')
}

// authoritative block injected into every agent prompt
function nmapPromptBlock(r, nmapFilePath) {
  if (!r || !r.ok || !r.ports.length) return ''
  const rows = r.ports.map(p => `  - ${p.port}/${p.proto} — ${p.service || 'unknown'}${p.product ? ` (${p.product}${p.version ? ' ' + p.version : ''})` : ''}`).join('\n')
  const web = r.httpServices.length
    ? `\nWeb services discovered (test EVERY one, not just the URL in your task):\n${r.httpServices.map(u => '  - ' + u).join('\n')}`
    : ''
  return `\n## AUTHORITATIVE NMAP — HEART TRUTH (read FIRST, test EVERY service)\nA full -p- -sV service scan ALREADY RAN on the host. This is ground truth — every open port/service:\n${rows}${web}\nDO NOT re-run a full port scan (no \`nmap -p-\`, no \`-T2/--max-rate\` sweeps) — it is DONE and wastes ~25 min. Only run a targeted \`nmap -sV -sC -p <known-port>\` on a specific service if you need deeper version/script detail. Test EVERY service above (FTP, SSH, web on any port, APIs, DBs) — do NOT limit yourself to the single URL in your task. Raw scan: cat ${nmapFilePath} 2>/dev/null\n`
}

module.exports = { runNmapScan, runNaabu, extractHost, parseNmapXml, httpServicesOf, nmapSummary, nmapPromptBlock }

// self-check: parse a representative nmap XML (run directly)
if (require.main === module) {
  const assert = require('node:assert')
  const xml = `<nmaprun><host><ports>
    <port protocol="tcp" portid="21"><state state="open"/><service name="ftp" product="vsftpd" version="3.0.3"/></port>
    <port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH"/></port>
    <port protocol="tcp" portid="3000"><state state="open"/><service name="http" product="Node.js Express"/></port>
    <port protocol="tcp" portid="9999"><state state="closed"/><service name="x"/></port>
  </ports></host></nmaprun>`
  const ports = parseNmapXml(xml)
  assert.strictEqual(ports.length, 3, `expected 3 open ports, got ${ports.length}`)
  assert.strictEqual(ports[0].service, 'ftp')
  assert.strictEqual(ports[0].version, '3.0.3')
  const web = httpServicesOf('10.0.0.1', ports)
  assert.deepStrictEqual(web, ['http://10.0.0.1:3000'], `web services: ${JSON.stringify(web)}`)
  assert.strictEqual(extractHost('http://10.0.0.1/foo'), '10.0.0.1')
  assert.strictEqual(extractHost('10.0.0.1:3000'), '10.0.0.1')
  console.log('ok — nmap XML parse + httpServices + host extraction')
}
