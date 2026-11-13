// Sign in with Apple (backend side).
//
// - verifyAppleIdentityToken: checks the identity token the app received from
//   Apple against Apple's public keys (RS256, issuer, audience, expiry).
// - appleAuthService: finds or creates the user for a verified token.
// - exchangeAuthorizationCode / revokeAppleToken: needed so that deleting an
//   account also revokes the Apple sign-in grant (App Store guideline 5.1.1(v)).
//
// Env:
//   APPLE_BUNDLE_ID            iOS bundle id (the token's audience). Required.
//   APPLE_TEAM_ID              Apple developer team id. For revoke.
//   APPLE_SIGNIN_KEY_ID        Key id of a "Sign in with Apple" key. For revoke.
//   APPLE_SIGNIN_PRIVATE_KEY   Contents of that .p8 file (\n for line breaks).

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const APPLE_ISSUER = "https://appleid.apple.com";

const appleJwksClient = jwksClient({
  jwksUri: `${APPLE_ISSUER}/auth/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
});

function httpError(message, status, extra = {}) {
  return Object.assign(new Error(message), { status }, extra);
}

async function verifyAppleIdentityToken(identityToken) {
  const audience = process.env.APPLE_BUNDLE_ID;
  if (!audience) {
    throw httpError("Apple sign-in is not configured on this server.", 500);
  }

  const decoded = jwt.decode(identityToken, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw httpError("Invalid Apple identity token.", 401);

  let publicKey;
  try {
    publicKey = (await appleJwksClient.getSigningKey(kid)).getPublicKey();
  } catch (e) {
    throw httpError("Could not verify the Apple identity token.", 401);
  }

  try {
    return jwt.verify(identityToken, publicKey, {
      algorithms: ["RS256"],
      issuer: APPLE_ISSUER,
      audience,
    });
  } catch (e) {
    throw httpError("Invalid Apple identity token.", 401);
  }
}

function claimIsTrue(value) {
  return value === true || value === "true";
}

// Stable placeholder for people who hide their email and give us none.
function placeholderEmail(appleUserId) {
  const hash = crypto.createHash("sha256").update(appleUserId).digest("hex").slice(0, 24);
  return `apple_${hash}@users.apple.invalid`;
}

function assertAccountUsable(user) {
  if (user.active === false) {
    throw httpError("Your account is deactivated. Please contact support.", 403);
  }
  if (user.isBanned) {
    throw httpError("Your account is banned. Please contact support.", 403, {
      bannedReason: user.bannedReason || "",
    });
  }
}

// Returns the user. `fullName` only fills in a missing display name, and the
// email used is ONLY the one inside Apple's signed token, never one sent by the
// client: otherwise anyone could claim someone else's account by posting their
// address next to their own valid Apple token.
async function appleAuthService({ identityToken, fullName }, User) {
  const claims = await verifyAppleIdentityToken(identityToken);
  const appleUserId = claims.sub;
  if (!appleUserId) throw httpError("Apple token has no subject.", 400);

  const name = String(fullName || "").trim().slice(0, 100);
  const verifiedEmail =
    claims.email && claimIsTrue(claims.email_verified)
      ? String(claims.email).trim().toLowerCase()
      : "";

  let user = await User.findOne({ appleId: appleUserId });
  if (user) {
    assertAccountUsable(user);
    if (name && !user.name) {
      user.name = name;
      await user.save();
    }
    return user;
  }

  if (verifiedEmail) {
    user = await User.findOne({ email: verifiedEmail });
    if (user) {
      if (user.appleId && user.appleId !== appleUserId) {
        throw httpError("This email is already linked to a different Apple ID.", 409);
      }
      assertAccountUsable(user);
      user.appleId = appleUserId;
      if (name && !user.name) user.name = name;
      if (!user.emailVerified) user.emailVerified = true;
      await user.save();
      return user;
    }
  }

  const email = verifiedEmail || placeholderEmail(appleUserId);
  return User.create({
    name: name || (verifiedEmail ? verifiedEmail.split("@")[0] : "Apple User"),
    email,
    appleId: appleUserId,
    emailVerified: Boolean(verifiedEmail),
  });
}

// ---- token revocation (account deletion) ------------------------------------

function revokeConfigured() {
  return Boolean(
    process.env.APPLE_BUNDLE_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_SIGNIN_KEY_ID &&
      process.env.APPLE_SIGNIN_PRIVATE_KEY
  );
}

function generateClientSecret() {
  return jwt.sign({}, process.env.APPLE_SIGNIN_PRIVATE_KEY.replace(/\\n/g, "\n"), {
    algorithm: "ES256",
    keyid: process.env.APPLE_SIGNIN_KEY_ID,
    issuer: process.env.APPLE_TEAM_ID,
    audience: APPLE_ISSUER,
    subject: process.env.APPLE_BUNDLE_ID,
    expiresIn: "10m",
  });
}

async function postForm(path, params) {
  const response = await fetch(`${APPLE_ISSUER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const text = await response.text().catch(() => "");
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {}
  return { ok: response.ok, status: response.status, json, text };
}

// Trades the one-time authorization code from the app for a refresh token.
// Returns "" when revocation is not configured or Apple refuses; sign-in itself
// must never fail because of this.
async function exchangeAuthorizationCode(authorizationCode) {
  if (!authorizationCode || !revokeConfigured()) return "";
  try {
    const result = await postForm("/auth/token", {
      client_id: process.env.APPLE_BUNDLE_ID,
      client_secret: generateClientSecret(),
      code: authorizationCode,
      grant_type: "authorization_code",
    });
    if (!result.ok) {
      console.warn("[apple:auth] code exchange failed:", result.status, result.text);
      return "";
    }
    return String(result.json.refresh_token || "");
  } catch (e) {
    console.warn("[apple:auth] code exchange error:", e.message);
    return "";
  }
}

// Returns true when the grant was revoked (or there was nothing to revoke).
async function revokeAppleToken(refreshToken) {
  if (!refreshToken) return true;
  if (!revokeConfigured()) {
    console.warn("[apple:auth] revoke skipped: APPLE_TEAM_ID / APPLE_SIGNIN_* not set");
    return false;
  }
  try {
    const result = await postForm("/auth/revoke", {
      client_id: process.env.APPLE_BUNDLE_ID,
      client_secret: generateClientSecret(),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    if (!result.ok) {
      console.warn("[apple:auth] revoke failed:", result.status, result.text);
    }
    return result.ok;
  } catch (e) {
    console.warn("[apple:auth] revoke error:", e.message);
    return false;
  }
}

module.exports = {
  appleAuthService,
  verifyAppleIdentityToken,
  exchangeAuthorizationCode,
  revokeAppleToken,
};
