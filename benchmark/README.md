# ARCHON benchmark: OWASP Juice Shop

This benchmark measures how much of OWASP Juice Shop ARCHON discovers, scored against a catalog
of the vulnerability classes Juice Shop is known to contain. The same ground truth and scorer
grade two run types against the same app:

- **Black box** — a live pentest against a running Juice Shop instance.
- **Static / white-box** — a code review of the Juice Shop source tree.

## Results

| Run type | Class coverage | Findings on board | Report |
|---|---|---|---|
| Black box (live) | **12 / 15 (80%)** | 26 | [`RESULTS-blackbox.md`](./RESULTS-blackbox.md) |
| Static / white-box (source) | **12 / 15 (80%)** | 48 (36 beyond the 15 classes) | [`RESULTS-codereview.md`](./RESULTS-codereview.md) |

Same class coverage from both angles, but the source review goes deeper — reading all the code
surfaces roughly twice the confirmed findings (YAML-deserialization RCE, JWT algorithm confusion,
unsalted-MD5 password storage, and more), each pinned to a file and line.

## What it measures

Class level coverage. Juice Shop ships around one hundred individual challenges, but ARCHON
reports by vulnerability class, so the benchmark checks whether each class in the ground truth
(SQL injection, XSS, broken access control, JWT weaknesses, and so on) is represented by at
least one confirmed finding. The headline score is the number of classes covered over the
total, and the scorecard also lists any extra findings that did not map to a ground truth class.

## Setup

1. Run OWASP Juice Shop somewhere reachable — from source, or any instance you control:

   ```
   git clone https://github.com/juice-shop/juice-shop && cd juice-shop
   npm install && npm start        # serves on http://localhost:3000
   ```

2. Target the host IP, not localhost. The scan tooling (naabu and nmap) is unreliable against
   the loopback address, so use the machine LAN IP. Find it and confirm Juice Shop answers there:

   ```
   ipconfig getifaddr en0            # macOS, prints your host LAN IP
   curl -s -o /dev/null -w "%{http_code}\n" http://<host-ip>:3000
   ```

   Use `http://<host-ip>:3000` as the target everywhere below.

3. Start the ARCHON daemon in a separate shell:

   ```
   node event-bus.js
   ```

## Run

   ```
   npm run benchmark
   # or against a different instance / with a longer window:
   node benchmark/run-benchmark.js http://localhost:3000 --timeout-min 120
   ```

The runner checks the target is reachable and the daemon is up, dispatches a full black box
pentest, waits for the run to reach awaiting triage, prints a coverage scorecard, and writes
`benchmark/results-<taskId>.json`.

## Run from the portal

You can also drive the benchmark from the dashboard instead of the command line:

1. Open the portal at http://localhost:4000 and dispatch a black box pentest against
   `http://localhost:3000`.
2. Watch the run on the card and let it reach awaiting triage.
3. Score it by task id (copy the id from the run card):

   ```
   node benchmark/score-task.js <taskId>
   ```

   This reads that run's findings and prints the same coverage scorecard, then writes
   `benchmark/results-<taskId>.json`. No second dispatch and no waiting.

## Static / white-box benchmark

Score a source code review the same way — no live target needed:

1. Get the Juice Shop source:

   ```
   git clone https://github.com/juice-shop/juice-shop ./juice-shop-src
   ```

2. From the portal, dispatch a **static** review (source directory = the Juice Shop source) — or a
   **white-box** run (source + the live URL, which then verifies the source findings against the box).
3. Score it by task id once it completes, and write the visual report:

   ```
   node benchmark/score-task.js <taskId>
   node benchmark/report-md.js <taskId> benchmark/RESULTS-codereview.md
   ```

   `report-md.js` detects the run type from its squad and titles the report accordingly (black-box
   vs code review), so the same command produces the right report for either.

## Files

| File | Purpose |
|---|---|
| `juice-shop-ground-truth.json` | The vulnerability classes expected in Juice Shop, with the CWE and keyword rules used to match ARCHON findings. |
| `score.js` | The pure scoring engine. Unit tested in `test/benchmark-score.test.js`. |
| `run-benchmark.js` | The command line runner: dispatch, wait, score, write results. |
| `score-task.js` | Score a run you already dispatched (from the portal) by its task id. |
| `report-md.js` | Generate a markdown benchmark report for a run (`node benchmark/report-md.js <taskId> [outfile]`). Mode-aware: black-box → `RESULTS-blackbox.md`, code review → `RESULTS-codereview.md`. |
| `RESULTS-blackbox.md` | The latest black box benchmark result against Juice Shop. |
| `RESULTS-codereview.md` | The latest static / white-box code-review benchmark result. |

## Notes

A real run uses live LLM agents and takes roughly forty to ninety minutes. The ground truth is
deliberately class level, so it stays stable across Juice Shop versions and neither rewards nor
penalises ARCHON for the exact challenge names. To tune matching, edit the `cwe` and `keywords`
rules in the ground truth file; the scorer and its unit test pick the changes up automatically.
