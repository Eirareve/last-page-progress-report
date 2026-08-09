import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const SPEC_PATH = resolve(
  PROJECT_ROOT,
  "stage7-work/visual/fixed-portrait-candidate-spec-v2.json",
);
const OUTPUT_DIR = resolve(
  PROJECT_ROOT,
  "stage7-review/assets/fixed-portrait-candidates-v2",
);

const config = Object.freeze({
  apiKey: requireEnvironment("AGNES_API_KEY"),
  baseUrl: process.env.AGNES_API_BASE_URL ?? "https://apihub.agnes-ai.com/v1",
  model: process.env.AGNES_IMAGE_MODEL ?? "agnes-image-2.1-flash",
  size: process.env.AGNES_IMAGE_SIZE ?? "2K",
  ratio: process.env.AGNES_IMAGE_RATIO ?? "3:4",
  timeoutMs: parsePositiveInteger(
    process.env.AGNES_IMAGE_TIMEOUT_MS ?? "120000",
    "AGNES_IMAGE_TIMEOUT_MS",
  ),
});

const specBytes = await readFile(SPEC_PATH);
const spec = JSON.parse(specBytes.toString("utf8"));
const referencePath = resolve(PROJECT_ROOT, spec.masterReference.path);
const referenceBytes = await readFile(referencePath);
const actualReferenceChecksum = `sha256:${createHash("sha256")
  .update(referenceBytes)
  .digest("hex")}`;
if (actualReferenceChecksum !== spec.masterReference.checksum) {
  throw new Error("Master Charlie reference checksum mismatch");
}
const reference = `data:${detectMimeType(referenceBytes)};base64,${referenceBytes.toString("base64")}`;

await mkdir(OUTPUT_DIR, { recursive: true });
const results = [];
for (const candidate of spec.candidates) {
  const existing = await loadExistingCandidate(candidate.plannedFileStem);
  const image =
    existing ?? (await generateImage(buildPrompt(candidate), reference));
  const extension = extensionForMimeType(image.mimeType);
  const outputPath =
    existing?.outputPath ??
    resolve(OUTPUT_DIR, `${candidate.plannedFileStem}${extension}`);
  if (existing === null) {
    await writeFile(outputPath, image.bytes, { flag: "wx" });
  }
  results.push({
    assetId: candidate.assetId,
    charlieStage: candidate.charlieStage,
    outputPath,
    mimeType: image.mimeType,
    byteLength: image.bytes.byteLength,
    sha256: createHash("sha256").update(image.bytes).digest("hex"),
    reusedExisting: existing !== null,
  });
}

console.log(
  JSON.stringify(
    {
      provider: "Agnes",
      model: config.model,
      masterReferenceChecksum: actualReferenceChecksum,
      promptSpecChecksum: `sha256:${createHash("sha256").update(specBytes).digest("hex")}`,
      results,
    },
    null,
    2,
  ),
);

function buildPrompt(candidate) {
  return [
    "Edit the input photograph. This is the exact same man, not a similar casting choice and not a reinterpretation.",
    "Copy his facial identity exactly: same apparent age, face shape, cheekbones, eyes, brows, nose, mouth, chin, ears, hairline, hairstyle, skin tone, asymmetries, and natural skin detail. Do not beautify, smooth, rejuvenate, or redesign his face.",
    "Change only the room, clothing, body pose, gaze direction, and lighting. Keep a close chest-up or upper-torso editorial framing so his identity remains clearly visible.",
    candidate.scenePrompt,
    "Make a clean, believable RAW digital editorial photograph with real pores, normal fabric, natural optical depth, and restrained expression.",
    "No illustration, render, concept art, plastic skin, glamour retouching, actor likeness, readable text, pseudo-writing, logo, watermark, or melodrama.",
  ].join("\n");
}

async function loadExistingCandidate(fileStem) {
  for (const extension of [".png", ".jpg", ".webp"]) {
    const outputPath = resolve(OUTPUT_DIR, `${fileStem}${extension}`);
    try {
      const bytes = await readFile(outputPath);
      return { bytes, mimeType: detectMimeType(bytes), outputPath };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function generateImage(prompt, reference) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/u, "")}/images/generations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          prompt,
          size: config.size,
          ratio: config.ratio,
          extra_body: {
            image: [reference],
            response_format: "b64_json",
          },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Agnes image generation failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    const result = payload?.data?.[0];
    if (typeof result?.b64_json === "string" && result.b64_json.length > 0) {
      const bytes = Buffer.from(result.b64_json, "base64");
      return { bytes, mimeType: detectMimeType(bytes) };
    }
    if (typeof result?.url === "string") {
      const imageResponse = await fetch(result.url, { signal: controller.signal });
      if (!imageResponse.ok) {
        throw new Error(
          `Agnes image download failed with HTTP ${imageResponse.status}`,
        );
      }
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      return { bytes, mimeType: detectMimeType(bytes) };
    }
    throw new Error("Agnes image response did not contain image data");
  } finally {
    clearTimeout(timeout);
  }
}

function detectMimeType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "image/png";
  }
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) {
    return "image/jpeg";
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  throw new Error("Agnes returned an unsupported image format");
}

function extensionForMimeType(mimeType) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  throw new Error(`Unsupported image MIME type: ${mimeType}`);
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
