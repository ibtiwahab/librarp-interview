import { z } from "zod";

/** Number of trusted reverse-proxy hops ("true" = 1, "false" = 0). */
const proxyHops = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v.trim() === "") return undefined;
    const s = v.trim().toLowerCase();
    if (["true", "yes"].includes(s)) return 1;
    if (["false", "no"].includes(s)) return 0;
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : undefined;
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL: z.string().default("15m"),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    FRONTEND_URL: z.string().default("http://localhost:3000"),
    COOKIE_SAMESITE: z
      .enum(["lax", "strict", "none", ""])
      .optional()
      .transform((v) => (v ? v : undefined)),
    TRUST_PROXY: proxyHops,
    DNS_SERVERS: z.string().optional(),
  })
  .refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, {
    message: "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different",
  });

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    console.error(`\n[config] Invalid environment configuration:\n${issues}\n\nSee backend/.env.example.\n`);
    process.exit(1);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === "production";
  return {
    nodeEnv: e.NODE_ENV,
    isProd,
    isTest: e.NODE_ENV === "test",
    port: e.PORT,
    mongoUri: e.MONGODB_URI,
    jwt: {
      accessSecret: e.JWT_ACCESS_SECRET,
      refreshSecret: e.JWT_REFRESH_SECRET,
      accessTtl: e.ACCESS_TOKEN_TTL,
      refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
      issuer: "librarp-interview-api",
      audience: "librarp-interview",
    },
    corsOrigins: e.FRONTEND_URL.split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    cookie: {
      sameSite: (e.COOKIE_SAMESITE ?? (isProd ? "none" : "lax")) as "lax" | "strict" | "none",
      secure: isProd || e.COOKIE_SAMESITE === "none",
    },
    trustProxy: e.TRUST_PROXY ?? (isProd ? 1 : 0),
    dnsServers: (e.DNS_SERVERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    upload: {
      maxBytes: 10 * 1024 * 1024,
    },
  };
}

export const env = loadEnv();
export type Env = typeof env;
