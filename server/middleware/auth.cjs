// Authentication + RBAC middleware for the Perumda Ledger API.
//
// Identity comes from a signed JWT delivered as an httpOnly cookie
// (`perumda_session`), set by POST /api/auth/login. The token carries
// { username, role }; `getUser(req)` verifies it and `getRole(req)` returns the
// role string. Route handlers keep using `requireRole(allowedRoles)` exactly as
// before — only the source of the role changed (cookie instead of a trusted
// client header).
//
// Transition escape hatch: when `ALLOW_HEADER_ROLE=1`, an `X-User-Role` header
// is honored as a fallback when no valid cookie is present. This is OFF by
// default (the header was the original vulnerability — any caller could claim
// any role) and is intended only for tests / one-release backward-compat.
//
// `requireRole(allowedRoles)` returns Express middleware that:
//   • allows the request if the caller's role ∈ allowedRoles
//   • always allows `admin` / `super_admin`
//   • allows everything if env DISABLE_RBAC=1 (dev/test escape hatch)
//   • 401 if the caller has no identity, 403 if the role isn't permitted
//
// Forced password change: a session opened with a password that must be
// changed (seeded default, or an admin reset) carries `mcp: 1` in its token.
// `requirePasswordChanged` refuses every API call from such a session except
// /api/auth/* until the password is changed. Before this, must_change_password
// only drove a dismissible banner — the default password worked for everything.

const jwt = require('jsonwebtoken');

const ROLE_HEADER = 'x-user-role';
const COOKIE_NAME = 'perumda_session';
const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 hours

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    // Loud, but don't crash — a misconfigured deploy should still surface the
    // warning in logs rather than hard-failing every request silently.
    console.warn('[auth] JWT_SECRET is not set in production — using an insecure fallback. Set JWT_SECRET.');
  }
  return 'perumda-dev-secret-change-me';
}

function headerRoleAllowed() {
  return process.env.ALLOW_HEADER_ROLE === '1';
}

/** Sign a session token for { username, role, mustChangePassword }. */
function signToken(payload) {
  return jwt.sign(
    {
      username: payload.username,
      role: String(payload.role || '').toLowerCase(),
      ...(payload.mustChangePassword ? { mcp: 1 } : {}),
    },
    jwtSecret(),
    { expiresIn: TOKEN_TTL_SECONDS }
  );
}

/** Verify a raw token string → payload, or null if invalid/expired. */
function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret());
  } catch (_) {
    return null;
  }
}

/** Cookie options for the session cookie (Secure only in production). */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  };
}

/**
 * Resolve the authenticated user for a request → { username, role,
 * mustChangePassword } or null.
 * Order: verified session cookie → (if ALLOW_HEADER_ROLE=1) X-User-Role header.
 * Memoized on the request object.
 */
function getUser(req) {
  if (req._authUser !== undefined) return req._authUser;

  let user = null;
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.role) {
      user = {
        username: payload.username || null,
        role: String(payload.role).toLowerCase(),
        mustChangePassword: payload.mcp === 1,
      };
    }
  }
  if (!user && headerRoleAllowed()) {
    const role = (req.headers[ROLE_HEADER] || '').toString().trim().toLowerCase();
    if (role) user = { username: null, role, mustChangePassword: false };
  }

  req._authUser = user;
  return user;
}

/** Role string for a request, or null. */
function getRole(req) {
  const user = getUser(req);
  return user ? user.role : null;
}

function requireRole(allowedRoles) {
  const allow = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .map((r) => String(r).toLowerCase());

  return function (req, res, next) {
    if (process.env.DISABLE_RBAC === '1') return next();

    const role = getRole(req);
    if (!role) {
      return res.status(401).json({
        error: 'Akses ditolak: silakan login terlebih dahulu',
        code: 'AUTH_REQUIRED',
      });
    }
    // super_admin & admin selalu lolos
    if (role === 'super_admin' || role === 'admin' || allow.includes(role)) {
      req.userRole = role;
      return next();
    }
    return res.status(403).json({
      error: `Access Denied: peran "${role}" tidak memiliki izin untuk endpoint ini`,
      code: 'AUTH_FORBIDDEN',
      requiredRoles: allow,
    });
  };
}

/** Block a session that still has to change its password (see header). */
function requirePasswordChanged(req, res, next) {
  if (process.env.DISABLE_RBAC === '1') return next();
  const user = getUser(req);
  if (user && user.mustChangePassword) {
    return res.status(403).json({
      error: 'Ganti password Anda terlebih dahulu sebelum memakai aplikasi.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  return next();
}

module.exports = {
  requireRole,
  requirePasswordChanged,
  getRole,
  getUser,
  signToken,
  verifyToken,
  cookieOptions,
  ROLE_HEADER,
  COOKIE_NAME,
  TOKEN_TTL_SECONDS,
};
