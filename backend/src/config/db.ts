import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

let shuttingDown = false;

export async function connectDatabase(uri: string = env.mongoUri): Promise<typeof mongoose> {
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
