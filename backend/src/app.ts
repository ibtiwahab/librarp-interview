import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { buildRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { AppError } from "./utils/errors.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  // Number of proxy hops in front of the API (Render = 1; Vercel rewrite + Render = 2).
  if (env.trustProxy > 0) app.set("trust proxy", env.trustProxy);

  app.use(
    helmet({
      // Pure JSON API: lock everything down.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser clients (curl, health checks) send no Origin header.
        if (!origin || env.corsOrigins.includes(origin.replace(/\/+$/, ""))) return cb(null, true);
        cb(new AppError("FORBIDDEN", "This origin is not allowed to access the Libra RP API."));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(cookieParser());

  app.get("/", (_req, res) => {
    res.json({ name: "Libra RP Interview API", status: "ok", docs: "/api/health" });
  });

  app.use("/api", apiLimiter, buildRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
