import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Env } from "../types";

export interface TokenPayload extends JWTPayload {
  userId: string;
  email: string;
}

function getSecret(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signAccessToken(
  payload: { userId: string; email: string },
  env: Env,
): Promise<string> {
  return new SignJWT({ userId: payload.userId, email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret(env));
}

export async function verifyAccessToken(
  token: string,
  env: Env,
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(env));
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // PBKDF2 path — new hashes created by this Worker
  if (stored.startsWith("pbkdf2:")) {
    const [, saltHex, expectedHash] = stored.split(":");
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
      key,
      256,
    );
    const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
    return hashHex === expectedHash;
  }

  // bcrypt path — hashes created by the Express API server ($2b$ prefix)
  // nodejs_compat makes bcryptjs available in Workers
  if (stored.startsWith("$2")) {
    const { default: bcrypt } = await import("bcryptjs");
    return bcrypt.compare(password, stored);
  }

  return false;
}

/**
 * Returns true when a stored hash was created with bcrypt (Express server).
 * Use to trigger re-hash to PBKDF2 on successful login.
 */
export function isBcryptHash(stored: string): boolean {
  return stored.startsWith("$2");
}

export function generateSecureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "afu_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex hash using Web Crypto (CF Worker safe) */
export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function refreshTokenExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
