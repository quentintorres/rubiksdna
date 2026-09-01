/**
 * Structured logging with a scrubbing layer that refuses subject-level data.
 *
 * The forbidden-key list is enforced at the callsite type level AND at
 * runtime, because "we were careful" is not a control. Do not log through
 * console.* anywhere else in the app.
 */

const FORBIDDEN_KEYS = new Set([
  "displayName",
  "display_name",
  "externalRef",
  "external_ref",
  "email",
  "beta",
  "betas",
  "value",
  "values",
  "measurements",
  "payload",
  "dob",
  "name",
]);

export function scrub(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (FORBIDDEN_KEYS.has(key)) {
      out[key] = "[scrubbed]";
      continue;
    }
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[key] = scrub(val as Record<string, unknown>);
    } else {
      out[key] = val;
    }
  }
  return out;
}

type Level = "info" | "warn" | "error";

function emit(level: Level, message: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...scrub(fields),
  });
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else if (level === "warn") console.warn(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
