import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

let shuttingDown = false;

export async function connectDatabase(uri: string = env.mongoUri): Promise<typeof mongoose> {
  // Atlas "mongodb+srv://" URIs need a DNS SRV lookup. Some local setups (VPNs,
  // ad-blockers, DNS proxies on 127.0.0.1) can't answer it; DNS_SERVERS lets the
  // backend use specific resolvers instead, e.g. "8.8.8.8,1.1.1.1".
  if (env.dnsServers.length) {
    dns.setServers(env.dnsServers);
    console.info(`[db] Using DNS servers: ${env.dnsServers.join(", ")}`);
  }

  mongoose.connection.on("disconnected", () => {
    if (!shuttingDown) console.warn("[db] MongoDB disconnected — the driver will keep retrying");
  });
  mongoose.connection.on("reconnected", () => console.info("[db] MongoDB reconnected"));
  mongoose.connection.on("error", (err) => console.error("[db] MongoDB error:", err.message));

  const conn = await mongoose.connect(uri, {
    // Keep the pool small: Atlas M0 allows ~500 connections shared across clients.
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15_000,
    autoIndex: true,
  });
  console.info(`[db] Connected to MongoDB (${conn.connection.name})`);
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  shuttingDown = true;
  await mongoose.disconnect();
}
