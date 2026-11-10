import { NextRequest, NextResponse } from 'next/server';
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth';
import { checkGuestSignInRateLimit, hashClientIp } from '@/server/rate-limit';

const authHandlers = toNextJsHandler(auth);

export const runtime = 'nodejs';

export const GET = authHandlers.GET;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);

  // Per rules.md §9: rate limit guest sign-in per IP and verify DEMO_MODE
  if (url.pathname.includes('/sign-in/anonymous')) {
    if (process.env.DEMO_MODE !== 'true') {
      return NextResponse.json(
        { error: 'Guest sign-in is disabled in this environment.' },
        { status: 404 },
      );
    }

    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const rawIp = forwardedFor ? forwardedFor.split(',')[0].trim() : realIp || '127.0.0.1';

    const ipHash = hashClientIp(rawIp);
    const { allowed, retryAfterSeconds } = checkGuestSignInRateLimit(ipHash);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many guest sign-in attempts from this IP. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfterSeconds.toString(),
          },
        },
      );
    }
  }

  return authHandlers.POST(req);
}

