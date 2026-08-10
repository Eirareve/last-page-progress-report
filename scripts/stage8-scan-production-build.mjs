import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const rcId = process.env.RC_ID;
if (!rcId) {
  throw new Error("RC_ID is required for the Stage 8 production artifact scan");
}

const buildRoot = path.resolve(".next");
const placeholderEvidence = JSON.parse(
  await readFile("content/placeholder/evidence-cards.json", "utf8"),
);
const placeholderPortraits = JSON.parse(
  await readFile("content/placeholder/portrait-config.json", "utf8"),
);
const placeholderManifest = JSON.parse(
  await readFile("content/placeholder/manifest.json", "utf8"),
);
const verifiedFacts = JSON.parse(
  await readFile("content/verified/verified-facts.json", "utf8"),
);

const forbidden = [
  placeholderManifest.contentBundleId,
  ...placeholderEvidence.records.flatMap((record) => [
    record.publicText,
    record.question,
  ]),
  ...placeholderPortraits.records.flatMap((record) => [
    record.assetPath,
    record.altText,
  ]),
  ...verifiedFacts.records.map((record) => record.internalExcerpt),
].filter((value) => typeof value === "string" && value.length > 0);

const files = await collectFiles(buildRoot);
const violations = [];
for (const file of files) {
  if (!/\.(?:js|json|map|html|txt)$/u.test(file)) continue;
  const bytes = await readFile(file);
  const text = bytes.toString("utf8");
  if (forbidden.some((value) => text.includes(value))) {
    violations.push(path.relative(process.cwd(), file));
  }
}

console.info(
  JSON.stringify({
    rcId,
    gate: "production_placeholder_private_content_scan",
    scannedFiles: files.length,
    violations,
  }),
);

if (violations.length > 0) {
  process.exitCode = 1;
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const resolved = path.join(directory, entry.name);
      if (directory === buildRoot && entry.isDirectory() && entry.name === "dev") {
        return [];
      }
      return entry.isDirectory() ? collectFiles(resolved) : [resolved];
    }),
  );
  return nested.flat();
}
