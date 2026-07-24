import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);

let archive = process.argv[2];
if (!archive) {
  const destination = mkdtempSync(join(tmpdir(), "x402-hl-pack-"));
  run("pnpm", ["pack", "--pack-destination", destination], packageRoot);
  const archives = readdirSync(destination).filter(name => name.endsWith(".tgz"));
  if (archives.length !== 1) {
    throw new Error(`Expected one package archive, found ${archives.length}`);
  }
  archive = join(destination, archives[0]);
}
archive = resolve(archive);

const listing = run("tar", ["-tzf", archive], packageRoot)
  .trim()
  .split("\n")
  .filter(Boolean);

const required = [
  "package/dist/intents/index.js",
  "package/dist/intents/index.d.ts",
  "package/dist/intents/client/index.js",
  "package/dist/intents/client/index.d.ts",
  "package/dist/intents/server/index.js",
  "package/dist/intents/server/index.d.ts",
];
for (const entry of required) {
  if (!listing.includes(entry)) {
    throw new Error(`Package is missing required entry: ${entry}`);
  }
}

const allowedFiles = new Set([
  "package/package.json",
  "package/README.md",
  "package/LICENSE",
  "package/CHANGELOG.md",
]);
const unexpected = listing.filter(entry => {
  if (entry.endsWith("/")) return false;
  return !(
    allowedFiles.has(entry) ||
    entry.startsWith("package/dist/") ||
    entry.startsWith("package/src/paywall/gen/")
  );
});
if (unexpected.length > 0) {
  throw new Error(`Package contains unexpected files:\n${unexpected.join("\n")}`);
}

const expectedName = `x402-hl-${packageJson.version}.tgz`;
if (!archive.endsWith(`/${expectedName}`)) {
  throw new Error(`Expected archive name ${expectedName}, got ${archive}`);
}

const consumer = mkdtempSync(join(tmpdir(), "x402-hl-consumer-"));
writeFileSync(
  join(consumer, "package.json"),
  JSON.stringify({
    name: "x402-hl-release-consumer",
    private: true,
    type: "module",
  }),
);
writeFileSync(
  join(consumer, "index.ts"),
  `import * as root from "x402-hl";
import * as exactClient from "x402-hl/exact/client";
import * as exactServer from "x402-hl/exact/server";
import * as exactFacilitator from "x402-hl/exact/facilitator";
import * as intents from "x402-hl/intents";
import * as intentsClient from "x402-hl/intents/client";
import * as intentsServer from "x402-hl/intents/server";
import * as paywall from "x402-hl/paywall";
void [root, exactClient, exactServer, exactFacilitator, intents, intentsClient, intentsServer, paywall];
`,
);
run("npm", ["install", "--ignore-scripts", archive], consumer);
run(
  "node",
  [
    "--input-type=module",
    "-e",
    `for (const name of ${JSON.stringify(Object.keys(packageJson.exports))}) await import(name === "." ? "x402-hl" : \`x402-hl\${name.slice(1)}\`);`,
  ],
  consumer,
);
run(
  join(packageRoot, "node_modules", ".bin", "tsc"),
  [
    "--noEmit",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    "--skipLibCheck",
    "index.ts",
  ],
  consumer,
);
run("npm", ["audit", "--omit=dev", "--audit-level=high"], consumer);

console.log(
  JSON.stringify(
    {
      ok: true,
      archive,
      version: packageJson.version,
      files: listing.filter(entry => !entry.endsWith("/")).length,
      required,
      freshConsumer: {
        runtimeImports: true,
        typeImports: true,
        productionAudit: true,
      },
    },
    null,
    2,
  ),
);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout;
}
