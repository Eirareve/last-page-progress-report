# Content Contract

> `contentContractVersion: 0.2.0`
> `contentSchemaVersion: 0.2.0`
> Status: frozen for Stage 5 implementation
> DRI: Codex（technical consistency）
> Final approver: project owner
> Execution guide: v1.2.5 (`SHA-256 5715711665D2C3D6985602052C9ADB31C28FF59907981F810DAEB2610AF8C020`)
> Stage 5 approval: project owner, 2026-08-09

## 1. Authority, compatibility, and scope

This Contract owns content authoring records, private/public projections,
placeholder fixtures, bundle checksums, content access, and production content
gating. Product meaning remains in [`scope-freeze.md`](./scope-freeze.md), while
the current Domain Schemas remain the executable source of truth for
Domain values.

Version `0.2.0` is the approved G2/G3/G4 Stage 5 repair. It adds reviewed,
unique portrait `descriptorOptions`, an attributed `originalInteraction`
record to both private and public bundles, and the deterministic projection
used by `FinalEnvelope.contentSnapshot`. It does not widen verified evidence
or permit UI code to read raw content files. Content-layer authoring records
remain deliberately distinct from strict Domain types.

If a future content requirement cannot be represented through the projections
defined here without changing a frozen stage 1 Contract, implementation must
stop and report a Contract gap.

## 2. Dependency direction

```text
Authoring source files
  -> private authoring Schema validation and reference validation
  -> private bundle canonicalization/checksum
  -> public projection and Domain projection
  -> public bundle canonicalization/checksum
  -> ContentLoader
  -> evaluateContentGate(...) / ContentGateEvaluation
  -> atomically bound gated content access
  -> application / UI / later Agent and Final Review services
```

Application, Agent, Final Review, and UI code may consume content only through
the gated content access interface returned together with a passed evaluation.
The server entry module is `src/content/server.ts`; the general content barrel
does not export the raw loader, source adapter, sealing functions, or access
constructor. Downstream code must not import or parse raw `content/**/*.json`
files. Private authoring fields must not be reconstructed from a public or
Domain projection.

## 3. Four distinct representations

### 3.1 Authoring/private records

The private source types are owned by the content layer:

- `BookEditionAuthoringRecord`;
- `VerifiedFactAuthoringRecord`;
- `CuratorialInterpretationAuthoringRecord`;
- `EvidenceCardAuthoringRecord`;
- `PortraitConfigAuthoringRecord`.

A portrait authoring record uses an explicitly reviewed, safe root-relative
`publicAssetPath`. Machine-local and private filesystem paths are not content
fields and therefore cannot enter either checksum representation.

`VerifiedFactAuthoringRecord` contains at least:

- `id`, `contentType=VERIFIED_FACT`, `theme`, `round`;
- `verifiedFact`, structured `sourceLocation`, and `internalExcerpt`;
- `publicSummary`, `publicPresentationMode`;
- `allowedInterpretations`, `prohibitedInferences`;
- `copyrightStatus`, `verifiedBy`, `verifiedAt`, `verificationStatus`, and
  `editionId`.

An actual verified record is valid only when its edition and source references
resolve, its human-verification fields are complete, and
`verificationStatus=approved`. A template object containing null fields is
documentation only and is never a content record.

`EvidenceCardAuthoringRecord` contains at least:

- `id`, `round`, `title`;
- `factIds`, `interpretationIds`;
- `publicText`, `question`, `allowedFollowUps`, `prohibitedClaims`, and
  `attribution`.

Every fact and interpretation reference must resolve within the same validated
bundle. A verified evidence card requires at least one approved fact. Images
and portrait configuration cannot satisfy a fact reference.

### 3.2 Private validated bundle

The private bundle contains the complete approved authoring records, including
`internalExcerpt` and internal human-verification metadata. It is available
only to the trusted server-side verification boundary: CI/build-time and the
server-only first-request validation path. It must not be sent to a browser,
model prompt, public API, ordinary log, analytics event, or SessionState.

### 3.3 Public runtime bundle

The public projection is generated from a validated private bundle. It removes
at least:

- `internalExcerpt`;
- private reviewer identity or notes not explicitly approved for public use;
- template instructions and authoring-only workflow fields;
- private asset paths and unapproved assets.

It retains the public summary, approved public source location, content
classification, allowed/prohibited interpretation boundaries, evidence-card
copy, attribution, approved portrait configuration, bundle identity, versions,
and its public checksum.

The public projection is generated; it is not independently hand-edited.

### 3.4 Placeholder fixtures

Placeholder files are a separate representation, not incomplete
`VerifiedFactAuthoringRecord` values and not Domain `VerifiedFact` values.
They are permitted only when `APP_ENV` is `development` or `test`, with
`CONTENT_MODE=placeholder`, for deterministic Mock orchestration or UI work.

Placeholder fixtures:

- use the explicit snake-case record kinds `placeholder_evidence_card` and
  `placeholder_portrait_scene`, plus `provenance=placeholder`;
- contain no real novel fact, quotation, Charlie dialogue, source excerpt, or
  curatorial claim;
- do not invent `editionId`, `sourceLocation`, `verifiedBy`, `verifiedAt`, or
  an approved verification status;
- never enter a verified bundle;
- never satisfy `retrieveVerifiedEvidence`;
- never project to Domain `VerifiedFact`;
- always fail a production content gate.

A placeholder evidence-card fixture does not carry `factIds`. It is not parsed
as the strict Domain `EvidenceCard`, whose `verifiedFactIds` invariant applies
only to a verified Domain projection.

The executable Schema names are unambiguous:

| Representation | Executable Schema |
|---|---|
| verified private authoring material | `verifiedContentBundleMaterialSchema` |
| sealed verified private bundle | `sealedVerifiedContentBundleSchema` |
| verified public checksum material | `publicRuntimeContentBundleMaterialSchema` |
| verified client/public runtime bundle | `publicRuntimeContentBundleSchema` |
| placeholder runtime bundle | `placeholderRuntimeContentBundleSchema` |
| Domain fact projection | `domainVerifiedFactProjectionSchema` |
| Domain evidence-card projection | `domainEvidenceCardProjectionSchema` |

The word `public` refers only to the client/runtime representation. A Domain
projection is named as such and is not a second public bundle Schema.

## 4. Approved projections to Domain

The content layer may project only fully approved records. The projection is
deterministic and rejects missing or ambiguous source data.

### 4.1 Verified fact projection

| Domain `VerifiedFact` field | Authoring source |
|---|---|
| `id` | `id` |
| `contentType` | literal `VERIFIED_FACT` |
| `text` | approved `publicSummary` |
| `sourceReference` | the frozen versioned tuple projection described below |
| `verifiedByHuman` | literal `true`, emitted only after all approval guards pass |

The Domain projection never contains `internalExcerpt`. `verifiedByHuman=true`
is a consequence of successful authoring validation; it must not be copied from
untrusted input or synthesized for a placeholder.

`sourceReference` is exactly `source-location:v1:` followed by JSON
serialization of this fixed-order tuple:

```text
[
  NFC(editionId),
  NFC(sectionType),
  NFC(sectionLabel),
  pageStart,
  pageEnd,
  NFC(locatorNote)
]
```

Tuple strings use normal JSON escaping. No object-key ordering decision is
involved in this field projection. The prefix makes a later incompatible
locator format distinguishable.

### 4.2 Evidence card projection

| Domain `EvidenceCard` field | Authoring source |
|---|---|
| `id` | `id` |
| `roundId` | `round` (`round1`, `round2`, or `round3`) |
| `title` | `title` |
| `publicSummary` | `publicText` |
| `verifiedFactIds` | `factIds`, after every ID resolves to an approved fact |
| `interpretationIds` | `interpretationIds`, after every ID resolves to an approved interpretation |

`question`, `allowedFollowUps`, `prohibitedClaims`, and `attribution` remain in
the public content record consumed through the content access interface. They
are not silently added to or substituted for fields in the strict Domain
projection.

### 4.3 Curatorial interpretation projection

An approved authoring interpretation projects to the existing Domain shape as
`id`, `contentType=CURATORIAL_INTERPRETATION`, `text`, and
`basedOnVerifiedFactIds`. Each referenced fact must already have a valid Domain
projection. A curatorial interpretation must not be represented as an authorial
or uniquely correct conclusion.

## 5. Canonical JSON and the two checksums

Both checksums use SHA-256 and the persisted form
`sha256:<64 lowercase hexadecimal characters>`.
The frozen algorithm identifier is `rfc8785-sha256-nfc-v1`.

Before RFC 8785 canonical serialization:

1. object keys and all string values are normalized to Unicode NFC;
2. normalization that would create duplicate object keys is rejected;
3. CR, LF, and CRLF occurring inside JSON string values are preserved exactly
   and remain checksum-significant;
4. arrays retain authored order;
5. numbers must be finite JSON numbers and use RFC 8785 number serialization;
6. filesystem paths, current time, runtime insertion order, and process-local
   values are forbidden checksum inputs;
7. only the root representation's `checksum`,
   `internalContentBundleChecksum`, and `contentBundleChecksum` fields are
   excluded from their own checksum input; equally named nested business fields
   remain included.

The SHA-256 input is the UTF-8 byte sequence of the resulting RFC 8785
canonical JSON. Whitespace used only to format the source JSON outside string
values has no effect on the parsed value or checksum.

Two representations are hashed independently:

- `internalContentBundleChecksum` hashes the complete validated private bundle,
  including `internalExcerpt` and private approval metadata. It never enters
  SessionState or a client payload.
- `contentBundleChecksum` hashes the generated public runtime bundle. This is
  the only content checksum used by `SessionState.contentBundleChecksum`, the
  existing `ContentGateEvaluation.checksum`, recovery binding, Final Review
  inputs, and FinalEnvelope provenance.

The two values must not share a generic manifest slot or be substituted for one
another. Changing a private-only field may change only the internal checksum;
changing any public projection field must change the public checksum and
normally the internal checksum as well.

## 6. Environment matrix

| APP_ENV | CONTENT_MODE | AGENT_MODE | Result |
|---|---|---|---|
| `development` | `placeholder` | `mock` | allowed |
| `development` | `verified` | `mock` or `live` | allowed |
| `test` | `placeholder` or `verified` | `mock` | allowed |
| `production` | `verified` | `mock` or `live` | allowed if every gate check passes |
| `production` | `placeholder` | any | forbidden |
| `test` | any | `live` | forbidden in the approved baseline |

No entrypoint may silently change a requested mode, hide a content failure, or
fall back from verified to placeholder content.

## 7. The single content-gate evaluator

`evaluateContentGate(...)` is the only deterministic content-gate decision.
It consumes a Schema-validated bundle binding, the two checksums where
applicable, the target environment, content mode, and the approved environment
matrix. It returns the existing stage 1 `ContentGateEvaluation` and no competing
`ProductionGateResult`, `ContentValidationResult`, or similar result type.

A passed evaluation must bind:

- `contentBundleId` and `contentBundleVersion`;
- the public `contentBundleChecksum` in its existing `checksum` field;
- `contentSchemaVersion`;
- `targetEnvironment`;
- an empty failure-code list.

A failed evaluation has at least one stable failure code. The evaluator
distinguishes placeholder in production, invalid environment combinations,
unapproved verified content, placeholder leakage into a verified bundle, and
checksum mismatch for its already validated input.

Schema validation, reference validation, private/public projection, and sealed
bundle integrity verification happen in `ContentLoader` before the evaluator,
as required by the validated-input boundary. Those failures throw explicit
typed errors and fail the production entrypoint closed; they are not represented
by a competing gate-result type and cannot silently fall back to placeholder
content.

For a successfully loaded bundle, the production entrypoint independently
recomputes the public checksum and passes both the declared and computed values
to the evaluator. A passed evaluation and its matching `ContentAccess` are
returned as one deeply frozen `GatedContentAccess`; no access is returned when
evaluation fails.

The evaluator does not create or imply a `ContentGateAttestation`. The approved
baseline does not require attestation.

## 8. Production entrypoints

The frozen deployment baseline has `serverStart=false`. Production therefore
uses both real, supported boundaries:

1. CI/build-time validation;
2. server first-request validation for each deployment/runtime instance.

Both entrypoints call the same `evaluateContentGate(...)` with equivalent
business inputs. Their binding, status, and failure semantics must match;
entrypoint-specific `evaluationId` and injected `evaluatedAt` metadata may
differ. They do not duplicate environment or checksum logic. A nonexistent
server-start hook must not be simulated or claimed. If either required
entrypoint fails, production content is unavailable and startup/request
handling must fail explicitly.

## 9. Recovery and persistence binding

An editable Session may resume only when its `contentBundleId`,
`contentBundleVersion`, public `contentBundleChecksum`, and
`contentSchemaVersion` match the validated current bundle and its
`targetEnvironment` matches the current target, or when an explicit compatible
migration has been registered. A mismatch never silently applies new content
to old state.

Without an explicit migration:

- an unfinished Session with a mismatched content binding is rejected from
  editable recovery;
- a COMPLETE snapshot remains a read-only rendering of its original embedded
  snapshot when the registered compatibility decoder permits it;
- a damaged or unverifiable snapshot is rejected as complete and may only be
  exported raw or cleared through the later persistence/UI boundary.

The internal checksum is never a Session recovery key. Stage 2 defines these
bindings but does not implement IndexedDB, migrations, retention, or UI.

## 10. Stage 2 non-goals

Stage 2 does not:

- add or alter Domain, Runtime, Provenance, Finalization, FSM, or Agent types;
- implement an Agent, Agent Adapter, FinalReviewService, `/api/agent`, MCP, or a
  real model call;
- write production prompts, Charlie dialogue, novel quotations, or any
  unverified novel fact;
- add formal verified content or final visual assets;
- implement UI, IndexedDB persistence, state migration, or COMPLETE rendering;
- add provider SDKs, third-party public APIs, databases, KV, or attestation;
- deploy, commit, or publish content.

The files under `content/verified` are non-runnable authoring templates until a
human supplies and approves every required value and both checksums are
generated by the validated sealing and loader pipeline implemented here.
