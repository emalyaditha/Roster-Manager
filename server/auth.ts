import type { Request, Response, NextFunction } from 'express';
import { store } from './store.js';
import firebaseConfig from '../firebase-applet-config.json';

/**
 * Firebase ID token verification for the API.
 *
 * Uses Google's Identity Toolkit `accounts:lookup` endpoint, which only
 * returns account data for cryptographically valid, unexpired Firebase ID
 * tokens — no Firebase Admin SDK / service account / extra dependency
 * required (works in every serverless runtime).
 *
 * The allow-list (settings.allowedEmails) is enforced server-side.
 */

// Imported (not fs-read) so the config is inlined into the serverless bundle —
// runtime fs paths are not traced into lambdas.
const webApiKey: string | undefined =
  process.env.FIREBASE_API_KEY?.trim() || firebaseConfig.apiKey;

export interface AuthedRequest extends Request {
  user?: { email?: string; user_id?: string };
}

interface LookupUser {
  email?: string;
  localId?: string;
}

/** Short-lived cache so repeated requests with the same token skip the lookup. */
const verificationCache = new Map<string, { user: LookupUser; expiresAt: number }>();
const CACHE_TTL_MS = 4 * 60 * 1000; // ID tokens live ~1h; re-verify well before expiry
const CACHE_MAX = 100;

function pruneCache(now: number) {
  for (const [k, v] of verificationCache) {
    if (v.expiresAt <= now) verificationCache.delete(k);
  }
  while (verificationCache.size > CACHE_MAX) {
    const first = verificationCache.keys().next().value;
    if (first === undefined) break;
    verificationCache.delete(first);
  }
}

export async function verifyFirebaseIdToken(token: string): Promise<LookupUser> {
  if (!webApiKey) {
    throw new Error('Firebase web API key unavailable — cannot verify tokens');
  }

  const now = Date.now();
  pruneCache(now);
  const cached = verificationCache.get(token);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(webApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) {
    // 400 INVALID_ID_TOKEN / EXPIRED_ID_TOKEN etc. — invalid token.
    throw new Error(`Token verification rejected (${res.status})`);
  }
  const data: any = await res.json();
  const user: LookupUser | undefined = data?.users?.[0];
  if (!user) {
    throw new Error('Token verification returned no user');
  }

  verificationCache.set(token, { user, expiresAt: now + CACHE_TTL_MS });
  return user;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Express middleware: require a valid Firebase ID token from an allowed email. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = await verifyFirebaseIdToken(token);
    const email = (user.email || '').toLowerCase();
    if (!email) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const settings = await store.getSettings();
    const allowed = (settings.allowedEmails || []).map((e) => String(e).toLowerCase());
    if (!allowed.includes(email)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    (req as AuthedRequest).user = { email: user.email, user_id: user.localId };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
