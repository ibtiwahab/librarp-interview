import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { createApp } from "./app.js";
import { ensureOrganizations } from "./services/organization.service.js";
import { runStartupMigrations } from "./services/migration.service.js";

async function main() {
  await connectDatabase();
  await ensureOrganizations();
  await runStartupMigrations();

  const app = createApp();
  // Render (and most PaaS) inject PORT and require binding to 0.0.0.0.
  const server = app.listen(env.port, "0.0.0.0", () => {
    console.info(`[server] Libra RP API listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
    console.info(`[server] Allowed origins: ${env.corsOrigins.join(", ") || "(none)"}`);
  });

  const shutdown = (signal: string) => {
    console.info(`[server] ${signal} received, shutting down…`);
    server.close(async () => {
      await disconnectDatabase().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
