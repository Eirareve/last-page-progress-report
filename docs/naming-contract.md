# Naming Contract

> `namingContractVersion: 0.1.0`
> Status: draft for final human approval
> DRI: Codex（技术一致性）
> Final approver: 项目负责人

## 1. General naming

- TypeScript functions and logical capabilities: `camelCase`.
- Types and runtime Schema exports: `PascalCase` / `<name>Schema`.
- JSON enum values: `snake_case`.
- FSM stages and events: `UPPER_SNAKE_CASE`.
- Diff status: `proposed | accepted | rejected`.
- `pendingDiff` means only the Session's single unresolved Diff slot.

Frozen product-literal exceptions are `CharlieStage.futureFacing` and the content categories `VERIFIED_FACT | CURATORIAL_INTERPRETATION | ORIGINAL_INTERACTION`. They must not acquire snake-case aliases.

The only public Session-event vocabulary is the stage-4 guide inventory represented by [`experienceEventSchema`](../src/domain/schemas/experience.schema.ts). Legacy synonyms are invalid input, not compatibility aliases. `START_NEW_SESSION` remains a separate application command and is deliberately rejected by the Session-event Schema.

## 2. Version fields

Every version field names its owner. The generic field `schemaVersion` is forbidden.

Canonical names are defined in [`provenance-contract.md`](./provenance-contract.md). In particular, the only Agent Contract field is `agentContractVersion`.

## 3. StableTextAnchor

The sole persisted rule-version field is `stableTextAnchorSchemaVersion`; it fulfills the guide's requirement for an independently versioned anchor rule. A second `anchorVersion` field must not be introduced.

Version `0.1.0` freezes:

- normalization: NFC;
- index unit: Unicode code point;
- range start: inclusive;
- range end: exclusive;
- hash input: NFC-normalized UTF-8 bytes;
- hash algorithm: SHA-256;
- hash representation: `sha256:` followed by 64 lowercase hexadecimal characters;
- context window: at most 32 immediately adjacent code points on each side;
- no implicit line-ending conversion;
- no UTF-16 code-unit index persisted as a formal anchor.

The executable source of truth is [`stable-text-anchor.schema.ts`](../src/domain/text/stable-text-anchor.schema.ts). Both variants contain `stableTextAnchorSchemaVersion`, `textDocument`, `baseRevisionId`, `normalization`, `indexUnit`, `baselineTextSha256`, `contextWindowCodePoints`, `prefixText`, `prefixTextSha256`, `suffixText`, and `suffixTextSha256`.

- `kind=point` additionally contains `offsetCodePoint`.
- `kind=range` additionally contains `startCodePoint`, `endCodePoint`, `expectedText`, and `expectedTextSha256`.

Point anchors therefore store one code-point offset. Range anchors store start/end plus expected text/hash. No other persisted Anchor shape or compatibility alias is valid for version `0.1.0`.

Rebase is exact and deterministic: only one matching candidate succeeds; none or more than one produces stale. Fuzzy and nearest-position matching are forbidden.

For `DocumentDiff.operation=annotate`, `targetAnchor` always anchors `precise_text` or `plain_text`. If `documentTarget=margin_note`, the value describes the annotation output channel attached to that source anchor; it does not imply a second, undefined margin-note text-index model.

## 4. Open issues

None for the stage 1 naming surface.
