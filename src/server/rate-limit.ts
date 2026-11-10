import crypto from 'node:crypto';

export function hashClientIp(rawIp: string): string {
  const salt = process.env.IP_HASH_SALT || 'development-fallback-ip-salt-min-32-chars';
  return crypto.createHmac('sha256', salt).update(rawIp.trim()).digest('hex');
}

interface RateLimitRecord {
  timestamps: number[];
}

// In-memory sliding window rate limiter for guest sign-in
const ipSignIns = new Map<string, RateLimitRecord>();

export function checkGuestSignInRateLimit(
  ipHash: string,
  limit = 10,
  windowMs = 60 * 60 * 1000, // 10 attempts per hour
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  const record = ipSignIns.get(ipHash) ?? { timestamps: [] };
  const validTimestamps = record.timestamps.filter((ts) => ts > cutoff);

  if (validTimestamps.length >= limit) {
    const oldest = validTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  validTimestamps.push(now);
  ipSignIns.set(ipHash, { timestamps: validTimestamps });

  return { allowed: true, retryAfterSeconds: 0 };
}

