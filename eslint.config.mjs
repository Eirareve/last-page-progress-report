import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "next/**",
            "@/app/**",
            "@/runtime/**",
            "@/provenance/**",
            "@/finalization/**",
            "@/agent/**",
            "@/final-review/**",
            "@/application/**",
            "@/fsm/**"
          ]
        }
      ]
    }
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts"
  ])
]);
