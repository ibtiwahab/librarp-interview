import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** A precomputed hash used to keep login timing uniform when the user does not exist. */
let dummyHash: string | undefined;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= await bcrypt.hash("timing-equaliser-not-a-real-password", BCRYPT_ROUNDS);
  await bcrypt.compare(plain, dummyHash);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Human-typeable temporary password: e.g. "Kf7q-Rt2m-Xw9p-Hb4n". */
export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  let pwd: string;
  // Guarantee at least one digit and letter for the password policy.
  do {
    pwd = [group(), group(), group(), group()].join("-");
  } while (!/\d/.test(pwd) || !/[a-zA-Z]/.test(pwd));
  return pwd;
}
