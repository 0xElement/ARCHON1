# ARCHON benchmark: OWASP Juice Shop

This benchmark measures how much of OWASP Juice Shop ARCHON discovers in a full black box
pentest. It dispatches a real run against a running Juice Shop instance, then scores the
findings against a catalog of the vulnerability classes Juice Shop is known to contain.

## What it measures

Class level coverage. Juice Shop ships around one hundred individual challenges, but ARCHON
reports by vulnerability class, so the benchmark checks whether each class in the ground truth
(SQL injection, XSS, broken access control, JWT weaknesses, and so on) is represented by at
least one confirmed finding. The headline score is the number of classes covered over the
total, and the scorecard also lists any extra findings that did not map to a ground truth class.

## Setup

1. Start Juice Shop in Docker:

   ```
   docker run -d --name juice-shop -p 3000:3000 bkimminich/juice-shop
   ```

2. Target the host IP, not localhost. The scan tooling (naabu and nmap) is unreliable against
   the loopback address and anything running in a container cannot reach the host as localhost,
   so use the machine LAN IP. Find it and confirm Juice Shop answers there:

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

## Files

| File | Purpose |
|---|---|
| `juice-shop-ground-truth.json` | The vulnerability classes expected in Juice Shop, with the CWE and keyword rules used to match ARCHON findings. |
| `score.js` | The pure scoring engine. Unit tested in `test/benchmark-score.test.js`. |
| `run-benchmark.js` | The command line runner: dispatch, wait, score, write results. |
| `score-task.js` | Score a run you already dispatched (from the portal) by its task id. |
| `report-md.js` | Generate a markdown benchmark report for a run (`node benchmark/report-md.js <taskId>`), written to `RESULTS-blackbox.md`. |
| `RESULTS-blackbox.md` | The latest black box benchmark result against Juice Shop. |

## Notes

A real run uses live LLM agents and takes roughly forty to ninety minutes. The ground truth is
deliberately class level, so it stays stable across Juice Shop versions and neither rewards nor
penalises ARCHON for the exact challenge names. To tune matching, edit the `cwe` and `keywords`
rules in the ground truth file; the scorer and its unit test pick the changes up automatically.
