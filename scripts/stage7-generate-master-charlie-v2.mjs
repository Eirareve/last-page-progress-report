import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const BIBLE_PATH = resolve(
  PROJECT_ROOT,
  "stage7-work/visual/charlie-original-v2-visual-bible.json",
);
const OUTPUT_DIR = resolve(
  PROJECT_ROOT,
  "stage7-review/assets/master-candidates-v2",
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

const bibleBytes = await readFile(BIBLE_PATH);
const bible = JSON.parse(bibleBytes.toString("utf8"));
await mkdir(OUTPUT_DIR, { recursive: true });

const results = [];
for (const candidate of bible.candidates) {
  const existing = await loadExistingCandidate(candidate.plannedFileStem);
  const image = existing ?? (await generateImage(buildPrompt(candidate)));
  const extension = extensionForMimeType(image.mimeType);
  const outputPath =
    existing?.outputPath ??
    resolve(OUTPUT_DIR, `${candidate.plannedFileStem}${extension}`);
  if (existing === null) {
    await writeFile(outputPath, image.bytes, { flag: "wx" });
  }
  results.push({
    candidateId: candidate.candidateId,
    assetId: candidate.assetId,
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
      visualBibleChecksum: `sha256:${createHash("sha256").update(bibleBytes).digest("hex")}`,
      results,
    },
    null,
    2,
  ),
);

function buildPrompt(candidate) {
  return [
    "Create a real high-resolution digital photograph for a fictional-character casting board.",
    `The subject is one project-original adult man. ${candidate.faceDirection}`,
    "Make a vertical chest-up editorial portrait at natural eye level, photographed on a full-frame digital camera with an 85mm portrait lens and moderate optical background blur.",
    "Use soft daylight from a real window, true-to-life neutral color, normal highlight roll-off, and a plain charcoal-gray cotton shirt with ordinary fabric weave and folds.",
    "Keep real pores, fine facial hair, subtle under-eye texture, small asymmetries, natural pupils and catchlights, individual hair strands, and an attentive restrained expression without a camera smile.",
    "The room is real, simple, and softly out of focus. The result must look like an unretouched RAW editorial photograph of a believable human being.",
    "No illustration, painting, texture overlay, beauty retouching, actor likeness, text, logo, watermark, glamour pose, or melodramatic expression.",
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

async function generateImage(prompt) {
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
          return_base64: true,
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
