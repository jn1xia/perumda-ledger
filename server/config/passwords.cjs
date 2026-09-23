// Password rules shared by the seed, the auth routes and user administration.
//
// The seed default ('perumda2026', or env SEED_USER_PASSWORD) is written in this
// repository, and the repository is public.
//
// ENFORCE_PASSWORD_CHANGE=1 makes that matter: a session opened with a default or
// reset password can do nothing but change it, and no route accepts a known
// default as a new or initial password. It is OFF unless set — at the owner's
// request the default passwords keep working as before (full access, reminder
// banner) until the current round of fixes is finished. Turning it on needs no
// code change: `flyctl secrets set ENFORCE_PASSWORD_CHANGE=1 -a perumda-ledger-scs9va`.

const FALLBACK_DEFAULT_PASSWORD = 'perumda2026';
const MIN_PASSWORD_LENGTH = 8;

/** True when a default/reset password must be changed before the app can be used. */
function passwordChangeEnforced() {
  return process.env.ENFORCE_PASSWORD_CHANGE === '1';
}

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
 * A known default is refused only while the forced change is enforced.
 */
function newPasswordProblem(password, label = 'Password baru') {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD_LENGTH) return `${label} minimal ${MIN_PASSWORD_LENGTH} karakter`;
  if (passwordChangeEnforced() && isKnownDefault(p)) return `${label} tidak boleh memakai password bawaan — pilih password lain`;
  return null;
}

module.exports = { defaultPassword, isKnownDefault, newPasswordProblem, passwordChangeEnforced, MIN_PASSWORD_LENGTH };
