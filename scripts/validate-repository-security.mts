import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const decodeGitPaths = (value: Buffer): string[] =>
  value
    .toString("utf8")
    .split("\0")
    .filter(Boolean);

const gitPaths = (...args: string[]): string[] =>
  decodeGitPaths(execFileSync("git", args, { encoding: "buffer" }));

const trackedFiles = new Set(gitPaths("ls-files", "-z"));
const candidateFiles = gitPaths(
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
);

const forbiddenEnvironmentFiles = [".env", ".env.local"];
for (const path of forbiddenEnvironmentFiles) {
  if (trackedFiles.has(path)) {
    throw new Error(`Repository security validation failed: ${path} is tracked.`);
  }
}

const envLocalIgnored =
  spawnSync("git", ["check-ignore", "--quiet", ".env.local"]).status === 0;
if (!envLocalIgnored) {
  throw new Error(
    "Repository security validation failed: .env.local is not ignored.",
  );
}

const textExtensions = new Set([
  ".css",
  ".example",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const secretPatterns = [
  { name: "OpenAI API key", pattern: /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g },
  { name: "Vercel token", pattern: /(?:vercel_|vcp_)[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", pattern: /(?:ghp_|github_pat_)[A-Za-z0-9_-]{20,}/g },
] as const;

const findings: Array<{ readonly path: string; readonly pattern: string }> = [];
for (const path of candidateFiles) {
  if (!existsSync(path) || statSync(path).size > 5_000_000) continue;
  if (!textExtensions.has(extname(path).toLowerCase()) && path !== ".gitignore") {
    continue;
  }
  const content = readFileSync(path, "utf8");
  for (const secretPattern of secretPatterns) {
    secretPattern.pattern.lastIndex = 0;
    if (secretPattern.pattern.test(content)) {
      findings.push({ path, pattern: secretPattern.name });
    }
  }
}

if (findings.length > 0) {
  const safeLocations = findings
    .map((finding) => `${finding.path} (${finding.pattern})`)
    .join(", ");
  throw new Error(
    `Repository security validation failed: secret-like values found in ${safeLocations}.`,
  );
}

console.log(
  "Foodseyo repository security validation: 0 secret-pattern matches; .env.local is ignored and untracked.",
);
