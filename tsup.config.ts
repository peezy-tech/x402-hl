import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/exact/client/index.ts",
    "src/exact/server/index.ts",
    "src/exact/facilitator/index.ts",
    "src/paywall/index.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
});
