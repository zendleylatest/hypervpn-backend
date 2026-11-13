const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

// Apple's identity-token key pair (RS256) and our Sign in with Apple key (ES256).
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const rsaOther = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsaPublicPem = rsa.publicKey.export({ type: "spki", format: "pem" });

// Replace jwks-rsa so no network is used: only kid "good-kid" is known.
const jwksPath = require.resolve("jwks-rsa");
require.cache[jwksPath] = {
  id: jwksPath,
  filename: jwksPath,
  loaded: true,
  exports: () => ({
    getSigningKey: async (kid) => {
      if (kid !== "good-kid") throw new Error("unknown kid");
      return { getPublicKey: () => rsaPublicPem };
    },
  }),
};

process.env.APPLE_BUNDLE_ID = "com.speckpro.securevpn.pro";
process.env.APPLE_TEAM_ID = "5Q368JT859";
process.env.APPLE_SIGNIN_KEY_ID = "SIGNKEY123";
process.env.APPLE_SIGNIN_PRIVATE_KEY = ec.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .replace(/\n/g, "\\n");

const {
  appleAuthService,
  exchangeAuthorizationCode,
  revokeAppleToken,
} = require("../services/appleAuthService");

function identityToken(claims = {}, { key = rsa.privateKey, kid = "good-kid" } = {}) {
  return jwt.sign(
    {
      sub: "001234.apple.user",
      email: "person@example.com",
      email_verified: "true",
      ...claims,
    },
    key,
    {
      algorithm: "RS256",
      keyid: kid,
      issuer: "https://appleid.apple.com",
      audience: "com.speckpro.securevpn.pro",
      expiresIn: "10m",
      ...(claims.__opts || {}),
    }
  );
}

function fakeUserModel(initial = []) {
  const docs = [];
  const wrap = (data) => {
    const doc = { ...data, save: async () => doc };
    docs.push(doc);
    return doc;
  };
  initial.forEach(wrap);
  return {
    docs,
    findOne: async (q) =>
      docs.find((d) => Object.entries(q).every(([k, v]) => d[k] === v)) || null,
    create: async (data) => wrap(data),
  };
}

test("creates a user from the verified email in the token", async () => {
  const User = fakeUserModel();
  const user = await appleAuthService(
    { identityToken: identityToken(), fullName: "Sam Lee" },
    User
  );
  assert.equal(user.email, "person@example.com");
  assert.equal(user.appleId, "001234.apple.user");
  assert.equal(user.name, "Sam Lee");
  assert.equal(user.emailVerified, true);
});

test("a returning Apple user is found by Apple id", async () => {
  const User = fakeUserModel([{ appleId: "001234.apple.user", email: "old@example.com", name: "Old" }]);
  const user = await appleAuthService({ identityToken: identityToken() }, User);
  assert.equal(user.email, "old@example.com");
  assert.equal(User.docs.length, 1);
});

test("links an existing account that has the same verified email", async () => {
  const User = fakeUserModel([{ email: "person@example.com", name: "Existing" }]);
  const user = await appleAuthService({ identityToken: identityToken() }, User);
  assert.equal(User.docs.length, 1);
  assert.equal(user.appleId, "001234.apple.user");
  assert.equal(user.name, "Existing");
});

test("does not link by an unverified email", async () => {
  const User = fakeUserModel([{ email: "person@example.com", name: "Existing" }]);
  const user = await appleAuthService(
    { identityToken: identityToken({ email_verified: "false" }) },
    User
  );
  assert.equal(User.docs.length, 2);
  assert.notEqual(user.email, "person@example.com");
  assert.match(user.email, /^apple_[0-9a-f]{24}@users\.apple\.invalid$/);
});

test("an email sent by the client can never link another account", async () => {
  const User = fakeUserModel([{ email: "victim@example.com", name: "Victim" }]);
  const token = identityToken({ email: undefined, email_verified: undefined });
  const user = await appleAuthService(
    // `email` is not an accepted input; it must be ignored.
    { identityToken: token, email: "victim@example.com" },
    User
  );
  assert.notEqual(user.email, "victim@example.com");
  assert.equal(User.docs.find((d) => d.name === "Victim").appleId, undefined);
});

test("the same email with a different Apple id is refused", async () => {
  const User = fakeUserModel([{ email: "person@example.com", appleId: "someone.else" }]);
  await assert.rejects(appleAuthService({ identityToken: identityToken() }, User), (e) => {
    assert.equal(e.status, 409);
    return true;
  });
});

test("banned and deactivated accounts cannot sign in", async () => {
  const banned = fakeUserModel([{ appleId: "001234.apple.user", isBanned: true, bannedReason: "abuse" }]);
  await assert.rejects(appleAuthService({ identityToken: identityToken() }, banned), (e) => {
    assert.equal(e.status, 403);
    assert.equal(e.bannedReason, "abuse");
    return true;
  });
  const off = fakeUserModel([{ appleId: "001234.apple.user", active: false }]);
  await assert.rejects(appleAuthService({ identityToken: identityToken() }, off), (e) => e.status === 403);
});

test("bad tokens are rejected", async () => {
  const User = fakeUserModel();
  const rejects = (token) =>
    assert.rejects(appleAuthService({ identityToken: token }, User), (e) => e.status === 401);

  await rejects("not-a-jwt");
  await rejects(identityToken({}, { key: rsaOther.privateKey })); // wrong signature
  await rejects(identityToken({}, { kid: "unknown-kid" }));
  await rejects(
    jwt.sign({ sub: "x" }, rsa.privateKey, {
      algorithm: "RS256", keyid: "good-kid", issuer: "https://appleid.apple.com",
      audience: "com.someone.else", expiresIn: "10m",
    })
  );
  await rejects(
    jwt.sign({ sub: "x" }, rsa.privateKey, {
      algorithm: "RS256", keyid: "good-kid", issuer: "https://evil.example",
      audience: "com.speckpro.securevpn.pro", expiresIn: "10m",
    })
  );
  await rejects(
    jwt.sign({ sub: "x", exp: Math.floor(Date.now() / 1000) - 60 }, rsa.privateKey, {
      algorithm: "RS256", keyid: "good-kid", issuer: "https://appleid.apple.com",
      audience: "com.speckpro.securevpn.pro",
    })
  );
  assert.equal(User.docs.length, 0);
});

function mockFetch(response) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.status < 300,
      status: response.status,
      text: async () => JSON.stringify(response.json ?? {}),
    };
  };
  return calls;
}

test("authorization code is exchanged with a valid client secret", async () => {
  const calls = mockFetch({ status: 200, json: { refresh_token: "r-token" } });
  const token = await exchangeAuthorizationCode("one-time-code");
  assert.equal(token, "r-token");
  assert.equal(calls[0].url, "https://appleid.apple.com/auth/token");
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code"), "one-time-code");
  assert.equal(form.get("client_id"), "com.speckpro.securevpn.pro");
  const claims = jwt.verify(form.get("client_secret"), ec.publicKey, {
    algorithms: ["ES256"],
    audience: "https://appleid.apple.com",
  });
  assert.equal(claims.iss, "5Q368JT859");
  assert.equal(claims.sub, "com.speckpro.securevpn.pro");
  const header = jwt.decode(form.get("client_secret"), { complete: true }).header;
  assert.equal(header.kid, "SIGNKEY123");
});

test("a failed exchange never throws and gives no token", async () => {
  mockFetch({ status: 400, json: { error: "invalid_grant" } });
  assert.equal(await exchangeAuthorizationCode("bad"), "");
  global.fetch = async () => { throw new Error("offline"); };
  assert.equal(await exchangeAuthorizationCode("x"), "");
  assert.equal(await exchangeAuthorizationCode(""), "");
});

test("revoke sends the refresh token to Apple", async () => {
  const calls = mockFetch({ status: 200, json: {} });
  assert.equal(await revokeAppleToken("r-token"), true);
  assert.equal(calls[0].url, "https://appleid.apple.com/auth/revoke");
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("token"), "r-token");
  assert.equal(form.get("token_type_hint"), "refresh_token");
});

test("revoke with nothing stored is a no-op, and a failure is reported", async () => {
  const calls = mockFetch({ status: 200, json: {} });
  assert.equal(await revokeAppleToken(""), true);
  assert.equal(calls.length, 0);
  mockFetch({ status: 400, json: { error: "invalid_request" } });
  assert.equal(await revokeAppleToken("r-token"), false);
});

test("revoke is skipped when the sign-in key is not configured", async () => {
  const saved = process.env.APPLE_SIGNIN_PRIVATE_KEY;
  delete process.env.APPLE_SIGNIN_PRIVATE_KEY;
  const calls = mockFetch({ status: 200, json: {} });
  assert.equal(await revokeAppleToken("r-token"), false);
  assert.equal(await exchangeAuthorizationCode("code"), "");
  assert.equal(calls.length, 0);
  process.env.APPLE_SIGNIN_PRIVATE_KEY = saved;
});
