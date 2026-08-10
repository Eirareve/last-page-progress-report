import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.live.ts"],
    maxConcurrency: 1,
    fileParallelism: false,
    disableConsoleIntercept: true,
  },
});
