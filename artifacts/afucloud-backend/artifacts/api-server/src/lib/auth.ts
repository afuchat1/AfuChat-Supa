import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

let developmentJwtSecret: string | undefined;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "development") {
    // Local preview sessions are intentionally ephemeral. This avoids
    // requiring a persisted signing secret in Replit while keeping tokens
    // unpredictable during the lifetime of the development process.
    developmentJwtSecret ??= crypto.randomBytes(32).toString("hex");
    return developmentJwtSecret;
  }

  throw new Error("JWT_SECRET must be configured outside development.");
}
const JWT_EXPIRES_IN = "1h";
const REFRESH_EXPIRES_DAYS = 30;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (hash.startsWith("pbkdf2:")) {
    return verifyPbkdf2Password(password, hash);
  }
  return bcrypt.compare(password, hash);
}

/**
 * Matches the password format used by the Cloudflare Worker and other
 * AfuCloud services. Keeping this in the API server means users can use the
 * same credentials across every platform connected to the shared database.
 */
async function verifyPbkdf2Password(password: string, stored: string): Promise<boolean> {
  const [, saltHex, expectedHash] = stored.split(":");
  if (!saltHex || !expectedHash || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(expectedHash)) {
    return false;
  }

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(
      password,
      Buffer.from(saltHex, "hex"),
      100_000,
      32,
      "sha256",
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });

  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
}

export function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2");
}

export async function hashPbkdf2Password(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100_000, 32, "sha256", (error, key) => {
      error ? reject(error) : resolve(key);
    });
  });
  return `pbkdf2:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateTokenWithPrefix(prefix: string): { raw: string; hashed: string; prefix: string } {
  const random = crypto.randomBytes(24).toString("hex");
  const raw = `${prefix}_${random}`;
  const hashed = hashToken(raw);
  return { raw, hashed, prefix: `${prefix}_${random.slice(0, 8)}` };
}

export function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_EXPIRES_DAYS);
  return d;
}
