# Stage 7 visual workflow research: Charlie v2

Status: research complete; no third-party code, weights, checkpoints, scripts, or dependencies were downloaded or executed.

## Decision

Use a two-step, human-gated workflow:

1. Generate a small casting set of project-original Master Charlie editorial portraits.
2. After one master is approved, treat that exact image as the identity reference and derive `early`, `peak`, and `futureFacing` through Agnes image editing/reference input.

The master reference will control facial identity only. Each derived prompt will separately declare the permitted scene, wardrobe, pose, and lighting changes and will repeat the identity invariants. Model-specific parameters from other ecosystems are not copied into Agnes requests.

## Sources compared

### OpenAI Codex imagegen skill

- Source: https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/imagegen/SKILL.md
- Repository/license: OpenAI `codex`, Apache-2.0.
- Borrowed method: label every input image by role; use a structured production prompt; preserve edit invariants explicitly; save non-destructively; inspect the output; iterate with one targeted change.
- Not borrowed: OpenAI-specific model names, CLI flags, API fields, or scripts.
- Safety assessment: first-party repository and documentation. Its scripts were not executed because Agnes remains the approved provider.

### InstantID

- Source: https://github.com/instantX-research/InstantID
- Repository/license: official InstantX research repository; code is Apache-2.0. The README separately restricts released checkpoints to research use and notes non-commercial research terms for the InsightFace face models.
- Borrowed method: a single approved face can act as an identity anchor while textual controls vary the surrounding image; identity strength and prompt editability are competing objectives that must be visually reviewed.
- Not borrowed: checkpoints, face encoders, weights, scale values, dependencies, or inference code.
- Safety assessment: useful as workflow research only. Its model/checkpoint licensing is not suitable to assume for production, and the repository instructs users to install packages and download external model files. Nothing was installed or run.

### PhotoMaker

- Source: https://github.com/TencentARC/PhotoMaker
- Repository/license: official Tencent ARC Lab repository; Apache-2.0 except for separately identified third-party components.
- Borrowed method: separate identity reference material from stylistic prompting; improve identity fidelity with clear, face-focused references rather than relying on prose alone; review identity fidelity and style quality as separate dimensions.
- Not borrowed: class-word syntax, merge steps, model weights, demos, API parameters, or code.
- Safety assessment: official research repository, but it has a substantial Python/model dependency surface and third-party components. Nothing was installed or run.

### PuLID v1.1

- Source: https://github.com/ToTheBeginning/PuLID and https://github.com/ToTheBeginning/PuLID/blob/main/docs/pulid_v1.1.md
- Repository/license: official project repository associated with the NeurIPS 2024 work; Apache-2.0.
- Borrowed method: preserve facial identity while allowing deliberate edits to viewpoint, expression, lighting, and style; treat naturalness and facial detail as an explicit review dimension rather than assuming identity similarity is sufficient.
- Not borrowed: SDXL/FLUX model choices, community checkpoints, parameters, ComfyUI nodes, dependencies, or scripts.
- Safety assessment: official research source, but local execution would require weights and a GPU-oriented dependency chain. Nothing was installed or run.

## Resulting project workflow

- `charlie-original-v1` remains a rejected audit record and is never used as the v2 reference.
- `charlie-original-v2` begins with four independent casting candidates, all made with the same photographic art direction but intentionally different facial identities.
- A selected master freezes face, apparent age range, bone structure, hair, skin tone, and baseline temperament.
- The selected master is then passed to Agnes as an identity reference for all three fixed portraits.
- Each scene derivation changes only approved contextual properties. It must not carry over the master's neutral backdrop or pose by accident.
- Each derivation receives visual QA for identity, skin, eyes, hair, anatomy, physical plausibility, restrained emotion, and unwanted text.
- No image is public or production-approved until the project owner explicitly approves it.

## Dependency and Contract effect

- New production dependencies: none.
- Frozen ContentBundle, Evidence, FSM, Finalization, Agent, Runtime, Domain, and Provenance contracts: unchanged.
- Agnes API parameters remain governed only by the existing server/runtime integration and official Agnes behavior.
