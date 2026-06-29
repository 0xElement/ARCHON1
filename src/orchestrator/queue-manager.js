// src/orchestrator/queue-manager.js — Autonomous Agent OS canonical path
// (spec RECOMMENDED_REPO_STRUCTURE). The dispatch queue itself is owned by the
// daemon (event-bus.js: dispatch-queue.json + processQueue, single-writer via
// writeAtomic/withFileLock). This module re-exports the formal task-lifecycle
// state machine the queue's status writes must obey.
'use strict'
module.exports = require('./task-lifecycle')
