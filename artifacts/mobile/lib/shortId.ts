const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Hermes does not support BigInt("0x...") hex-string syntax.
// Accumulate digit-by-digit using only BigInt(number) which is safe everywhere.
function hexToBigInt(hex: string): bigint {
  let result = 0n;
  for (let i = 0; i < hex.length; i++) {
    result = result * 16n + BigInt(parseInt(hex[i], 16));
  }
  return result;
}

function bytesToBase62(bytes: number[]): string {
  let num = hexToBigInt(bytesToHex(bytes));
  if (num === 0n) return CHARS[0];
  let result = "";
  const base = BigInt(CHARS.length);
  while (num > 0n) {
    result = CHARS[Number(num % base)] + result;
    num = num / base;
  }
  return result;
}

const MAX_128BIT = (1n << 128n) - 1n;

function base62ToBytes(str: string, byteLen: number): number[] {
  const base = BigInt(CHARS.length);
  let num = 0n;
  for (const ch of str) {
    const idx = CHARS.indexOf(ch);
    if (idx < 0) throw new Error("Invalid character");
    num = num * base + BigInt(idx);
  }
  if (byteLen === 16 && num > MAX_128BIT) throw new Error("Value exceeds UUID range");
  const hex = num.toString(16).padStart(byteLen * 2, "0");
  return hexToBytes(hex);
}

export function encodeId(uuid: string): string {
  const clean = uuid.replace(/-/g, "");
  const bytes = hexToBytes(clean);
  return bytesToBase62(bytes);
}

export function decodeId(shortId: string): string {
  try {
    const bytes = base62ToBytes(shortId, 16);
    const hex = bytesToHex(bytes);
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  } catch {
    return shortId;
  }
}

export function isEncodedId(str: string): boolean {
  if (!str || str.length < 10 || str.length > 25) return false;
  return /^[0-9A-Za-z]+$/.test(str);
}

export function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
