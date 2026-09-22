// Password rules shared by the seed, the auth routes and user administration.
//
// The seed default ('perumda2026', or env SEED_USER_PASSWORD) is written in this
// repository, and the repository is public. So a default can only ever be a
// first-login password: seeded accounts are flagged for a forced change, and no
// route accepts a known default as a new or initial password.

const FALLBACK_DEFAULT_PASSWORD = 'perumda2026';
const MIN_PASSWORD_LENGTH = 8;

/** Password given to seeded accounts (forced change on first login). */
function defaultPassword() {
  return process.env.SEED_USER_PASSWORD || FALLBACK_DEFAULT_PASSWORD;
}

/** True for any password that is a shared default rather than the user's own. */
function isKnownDefault(password) {
  const p = String(password || '');
  return p === FALLBACK_DEFAULT_PASSWORD || (!!process.env.SEED_USER_PASSWORD && p === process.env.SEED_USER_PASSWORD);
}

/**
 * Why `password` cannot be set as someone's password, or null when it can.
 * `label` names the field in the message ("Password baru", "Password awal").
 */
function newPasswordProblem(password, label = 'Password baru') {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD_LENGTH) return `${label} minimal ${MIN_PASSWORD_LENGTH} karakter`;
  if (isKnownDefault(p)) return `${label} tidak boleh memakai password bawaan — pilih password lain`;
  return null;
}

module.exports = { defaultPassword, isKnownDefault, newPasswordProblem, MIN_PASSWORD_LENGTH };
