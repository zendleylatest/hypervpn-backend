const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
process.env.APPLE_IAP_PRIVATE_KEY = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .replace(/\n/g, "\\n");
process.env.APPLE_IAP_KEY_ID = "KEYID12345";
process.env.APPLE_IAP_ISSUER_ID = "issuer-uuid";
process.env.APPLE_BUNDLE_ID = "com.speckpro.securevpn.pro";
delete process.env.APPLE_IAP_SANDBOX;

const { verifyAppleTransaction } = require("../services/appleIapService");
const { verifyIapPurchase } = require("../services/iapVerificationService");

const sign = (payload) => jwt.sign(payload, "test-secret"); // Apple JWS stand-in

function entry({
  status = 1,
  productId = "monthly_subscription_securevpn",
  original = "1000000000000001",
  expires = Date.now() + 86400000,
  bundleId = "com.speckpro.securevpn.pro",
  autoRenewStatus = 1,
  offer = {},
  revocationDate,
  gracePeriodExpiresDate,
} = {}) {
  return {
    status,
    originalTransactionId: original,
    signedTransactionInfo: sign({
      originalTransactionId: original,
      transactionId: "2000000000000009",
      productId,
      bundleId,
      expiresDate: expires,
      revocationDate,
      ...offer,
    }),
    signedRenewalInfo: sign({ autoRenewStatus, gracePeriodExpiresDate }),
  };
}

const body = (...entries) => ({ data: [{ lastTransactions: entries }] });

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    const r = handler(url, calls.length);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json,
      text: async () => JSON.stringify(r.json ?? {}),
    };
  };
  return calls;
}

test("active subscription in production", async () => {
  const calls = mockFetch(() => ({ status: 200, json: body(entry()) }));
  const r = await verifyAppleTransaction({ transactionId: "2000000000000009" });
  assert.equal(r.isActive, true);
  assert.equal(r.originalTransactionId, "1000000000000001");
  assert.equal(r.productId, "monthly_subscription_securevpn");
  assert.equal(r.autoRenewing, true);
  assert.equal(r.environment, "Production");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.storekit\.itunes\.apple\.com\//);
  assert.match(calls[0].init.headers.Authorization, /^Bearer /);
});

test("falls back to sandbox when production does not know the transaction", async () => {
  const calls = mockFetch((url) =>
    url.includes("sandbox")
      ? { status: 200, json: body(entry()) }
      : { status: 404, json: { errorCode: 4040010 } }
  );
  const r = await verifyAppleTransaction({ transactionId: "2000000000000009" });
  assert.equal(r.isActive, true);
  assert.equal(r.environment, "Sandbox");
  assert.equal(calls.length, 2);
});

test("expired subscription is not active", async () => {
  mockFetch(() => ({ status: 200, json: body(entry({ status: 2, expires: Date.now() - 1000 })) }));
  const r = await verifyAppleTransaction({ transactionId: "x" });
  assert.equal(r.isActive, false);
});

test("billing grace period keeps access", async () => {
  mockFetch(() => ({
    status: 200,
    json: body(entry({ status: 4, expires: Date.now() - 1000, gracePeriodExpiresDate: Date.now() + 5 * 86400000 })),
  }));
  const r = await verifyAppleTransaction({ transactionId: "x" });
  assert.equal(r.isActive, true);
  assert.ok(r.expiresAt.getTime() > Date.now());
});

test("billing retry (status 3) and revoked are not active", async () => {
  mockFetch(() => ({ status: 200, json: body(entry({ status: 3 })) }));
  assert.equal((await verifyAppleTransaction({ transactionId: "x" })).isActive, false);
  mockFetch(() => ({ status: 200, json: body(entry({ status: 5 })) }));
  assert.equal((await verifyAppleTransaction({ transactionId: "x" })).isActive, false);
  mockFetch(() => ({ status: 200, json: body(entry({ status: 1, revocationDate: Date.now() })) }));
  assert.equal((await verifyAppleTransaction({ transactionId: "x" })).isActive, false);
});

test("free trial is flagged", async () => {
  mockFetch(() => ({
    status: 200,
    json: body(entry({ offer: { offerType: 1, offerDiscountType: "FREE_TRIAL" } })),
  }));
  assert.equal((await verifyAppleTransaction({ transactionId: "x" })).isTrial, true);
});

test("auto-renew off is reported", async () => {
  mockFetch(() => ({ status: 200, json: body(entry({ autoRenewStatus: 0 })) }));
  assert.equal((await verifyAppleTransaction({ transactionId: "x" })).autoRenewing, false);
});

test("prefers the active chain over an expired one in the same group", async () => {
  mockFetch(() => ({
    status: 200,
    json: body(
      entry({ status: 2, original: "111", productId: "yearly_subscription_securevpn", expires: Date.now() + 999999999 }),
      entry({ status: 1, original: "222", productId: "monthly_subscription_securevpn" })
    ),
  }));
  const r = await verifyAppleTransaction({ transactionId: "x" });
  assert.equal(r.originalTransactionId, "222");
  assert.equal(r.isActive, true);
});

test("a purchase from another app is rejected and not retryable", async () => {
  mockFetch(() => ({ status: 200, json: body(entry({ bundleId: "com.someone.else" })) }));
  await assert.rejects(verifyAppleTransaction({ transactionId: "x" }), (e) => {
    assert.equal(e.retryable, false);
    return true;
  });
});

test("unknown transaction everywhere is definitive", async () => {
  mockFetch(() => ({ status: 404, json: {} }));
  const r = await verifyIapPurchase({ platform: "ios", productId: "p", purchaseToken: "nope" });
  assert.equal(r.ok, false);
  assert.equal(r.retryable, false);
  assert.equal(r.status, "invalid");
});

test("Apple outage is retryable so access is not revoked", async () => {
  mockFetch(() => ({ status: 503, json: {} }));
  const r = await verifyIapPurchase({ platform: "ios", productId: "p", purchaseToken: "t" });
  assert.equal(r.ok, false);
  assert.equal(r.retryable, true);
  assert.equal(r.status, "verify_failed");
});

test("verifyIapPurchase ios returns the shape the controller stores", async () => {
  mockFetch(() => ({ status: 200, json: body(entry()) }));
  const r = await verifyIapPurchase({ platform: "ios", productId: "monthly_subscription_securevpn", purchaseToken: "2000000000000009" });
  assert.equal(r.ok, true);
  assert.equal(r.platform, "ios");
  assert.equal(r.source, "app_store");
  assert.equal(r.payload.originalTransactionId, "1000000000000001");
  assert.equal(r.payload.productId, "monthly_subscription_securevpn");
  assert.ok(Date.parse(r.expiresAt) > Date.now());
});
