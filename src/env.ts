import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function stripOptionalQuotes(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function loadEnvFile(filePath = ".env"): void {
  const fullPath = resolve(process.cwd(), filePath);

  if (!existsSync(fullPath)) {
    return;
  }

  const content = readFileSync(fullPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] === undefined) {
      process.env[key] = stripOptionalQuotes(rawValue);
    }
  }
}
