import { GetAuthUserResponse } from '@workspace/api-zod';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import * as oidc from 'openid-client';

import {
  clearSession,
  createSession,
  getOidcConfig,
  getSessionId,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from '../lib/auth';

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host =
    req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost';
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return '/';
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const firstName = (claims.first_name as string) || null;
  const lastName = (claims.last_name as string) || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  const profileImageUrl = (claims.profile_image_url || claims.picture) as string | null;
  const email =
    typeof claims.email === 'string'
      ? claims.email.trim().toLowerCase()
      : null;

  const userData = {
    id: claims.sub as string,
    email,
    firstName,
    lastName,
    profileImageUrl: profileImageUrl ?? null,
  };

  const profileData = {
    email: userData.email,
    firstName: userData.firstName,
    lastName: userData.lastName,
    profileImageUrl: userData.profileImageUrl,
    updatedAt: new Date(),
  };

  let user: typeof usersTable.$inferSelect | undefined;
  const [existingById] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userData.id))
    .limit(1);

  if (existingById) {
    [user] = await db
      .update(usersTable)
      .set(profileData)
      .where(eq(usersTable.id, userData.id))
      .returning();
  } else if (userData.email) {
    [user] = await db
      .insert(usersTable)
      .values(userData)
      .onConflictDoUpdate({
        target: usersTable.email,
        set: profileData,
      })
      .returning();
  } else {
    [user] = await db
      .insert(usersTable)
      .values(userData)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: profileData,
      })
      .returning();
  }

  if (!user) {
    throw new Error('Unable to create or update the authenticated user.');
  }

  return {
    dbUser: user,
    authUser: {
      id: user.id,
      name: fullName,
      profileImage: user.profileImageUrl ?? null,
      roles: [] as string[],
    },
  };
}

// Returns { user: AuthUser | null } — format expected by useAuth() in replit-auth-web
router.get('/auth/user', (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.json({ user: null });
    return;
  }
  res.json({
    user: GetAuthUserResponse.parse(req.user),
  });
});

router.get('/login', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: 'openid email profile offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'login consent',
    state,
    nonce,
  });

  setOidcCookie(res, 'code_verifier', codeVerifier);
  setOidcCookie(res, 'nonce', nonce);
  setOidcCookie(res, 'state', state);
  setOidcCookie(res, 'return_to', returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get('/callback', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect('/api/login');
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect('/api/login');
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie('code_verifier', { path: '/' });
  res.clearCookie('nonce', { path: '/' });
  res.clearCookie('state', { path: '/' });
  res.clearCookie('return_to', { path: '/' });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect('/api/login');
    return;
  }

  const { authUser } = await upsertUser(claims as unknown as Record<string, unknown>);

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: authUser,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : (claims.exp as number | undefined),
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get('/logout', async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const postLogoutRedirectUrl = new URL(returnTo, `${origin}/`).href;

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutRedirectUrl,
  });

  res.redirect(endSessionUrl.href);
});

export { ISSUER_URL };
export default router;
