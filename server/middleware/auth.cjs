// Lightweight RBAC middleware for the Perumda Ledger API.
//
// Role is read from the `X-User-Role` HTTP header (case-insensitive).
// In production this should be replaced with proper JWT/session decoding,
// but the contract (request → role string) stays the same so route handlers
// don't need to change.
//
// `requireRole(allowedRoles)` returns Express middleware that:
//   • allows the request if X-User-Role ∈ allowedRoles
//   • allows the request if env DISABLE_RBAC=1 (dev/test escape hatch)
//   • otherwise responds 403 with a user-friendly Indonesian message
//
// Roles used by the system (must match seed/login flow):
//   admin, akuntan, manajer_keuangan, direktur, auditor, kasir,
//   staff_gudang, staff_pembelian, super_admin

const ROLE_HEADER = 'x-user-role';

function getRole(req) {
  const raw = (req.headers[ROLE_HEADER] || '').toString().trim().toLowerCase();
  return raw || null;
}

function requireRole(allowedRoles) {
  const allow = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .map((r) => String(r).toLowerCase());

  return function (req, res, next) {
    if (process.env.DISABLE_RBAC === '1') return next();

    const role = getRole(req);
    if (!role) {
      return res.status(401).json({
        error: 'Akses ditolak: header X-User-Role wajib disertakan',
        code: 'AUTH_MISSING_ROLE',
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

module.exports = { requireRole, getRole, ROLE_HEADER };
