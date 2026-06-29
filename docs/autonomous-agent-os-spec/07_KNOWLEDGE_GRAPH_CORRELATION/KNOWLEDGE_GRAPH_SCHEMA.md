# Knowledge Graph Schema

The Knowledge Graph is ARCHON's single source of truth.

## Node types

```text
Engagement
Target
Host
Port
Service
URL
Endpoint
API
GraphQLOperation
Feature
Actor
Role
Tenant
Session
Credential
SourceFile
Function
Class
Route
Controller
ServiceObject
Model
DataObject
SecurityControl
Hypothesis
Task
CandidateFinding
ConfirmedFinding
Evidence
AttackChain
ReportSection
```

## Relationship types

```text
TARGET_HAS_HOST
HOST_EXPOSES_PORT
PORT_RUNS_SERVICE
SERVICE_EXPOSES_URL
URL_MAPS_TO_ENDPOINT
ENDPOINT_BELONGS_TO_FEATURE
FEATURE_HANDLED_BY_SOURCE_FILE
ROUTE_CALLS_CONTROLLER
CONTROLLER_CALLS_SERVICE
SERVICE_USES_MODEL
ACTOR_HAS_ROLE
ROLE_CAN_PERFORM_ACTION
ACTION_REQUIRES_CONTROL
INPUT_FLOWS_TO_SINK
HYPOTHESIS_TARGETS_FEATURE
TASK_TESTS_HYPOTHESIS
EVIDENCE_SUPPORTS_CANDIDATE
CANDIDATE_CORRELATES_WITH_SOURCE
CANDIDATE_CORRELATES_WITH_BLACKBOX
FINDING_PART_OF_ATTACK_CHAIN
```

## Required properties

Every node should include:

```json
{
  "id": "",
  "type": "",
  "name": "",
  "source": "recon|blackbox|static|whitebox|audit|judge|report",
  "confidence": 0.0,
  "created_at": "",
  "updated_at": "",
  "evidence_refs": []
}
```
