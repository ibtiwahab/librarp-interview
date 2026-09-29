import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";

function limited(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message } });
  };
}

const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

/** Brute-force protection for sign-in: per IP + identifier, and per IP overall. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const identifier = typeof req.body?.identifier === "string" ? req.body.identifier.toLowerCase().slice(0, 80) : "";
    return `${ip(req)}|${identifier}`;
  },
  handler: limited("Too many sign-in attempts. Please wait 15 minutes and try again."),
});

export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: ip,
  handler: limited("Too many sign-in attempts from this network. Please wait and try again."),
});

export const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: ip,
  handler: limited("Too many session refresh requests. Please wait a moment."),
});

export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: ip,
  handler: limited("Too many document uploads. Please wait a few minutes."),
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: ip,
  handler: limited("Too many requests. Please slow down."),
});
