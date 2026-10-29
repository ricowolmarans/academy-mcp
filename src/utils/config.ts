import { z } from "zod";
import { config as loadEnv } from "dotenv";

loadEnv();

const ConfigSchema = z.object({
  CANVAS_BASE_URL: z
    .string()
    .url("CANVAS_BASE_URL must be a valid URL")
    .transform((u) => u.replace(/\/+$/, "")),
  CANVAS_ACCESS_TOKEN: z
    .string()
    .min(1, "CANVAS_ACCESS_TOKEN is required")
    .refine((t) => !t.includes(" "), "Token must not contain spaces"),
  CANVAS_ACCOUNT_ID: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  CANVAS_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 30_000)),
  CANVAS_MAX_RETRIES: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 3)),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

export function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
