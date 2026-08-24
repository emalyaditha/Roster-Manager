import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { store } from './store.js';

/**
 * Firebase ID token verification for the API.
 *
 * Verifies Firebase Auth ID tokens locally against Google's public JWKS
 * (no Firebase Admin SDK / service account needed) and enforces the
 * settings.allowedEmails allowlist server-side.
 */

let firebaseProjectId: string | undefined = process.env.FIREBASE_PROJECT_ID;

if (!firebaseProjectId) {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      firebaseProjectId = config.projectId;
    }
  } catch {
    // handled below — auth fails closed when the project id is unavailable
  }
}

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface AuthedRequest extends Request {
  user?: JWTPayload & { email?: string; user_id?: string };
}

export async function verifyFirebaseIdToken(token: string): Promise<JWTPayload> {
  if (!firebaseProjectId) {
    throw new Error('Firebase project id unavailable — cannot verify tokens');
  }
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
    audience: firebaseProjectId,
  });
  return payload;
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
    const payload = (await verifyFirebaseIdToken(token)) as AuthedRequest['user'];
    const email = (payload.email || '').toLowerCase();
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
    (req as AuthedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
