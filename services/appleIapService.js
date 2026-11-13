const jwt = require("jsonwebtoken");

// App Store Server API: https://developer.apple.com/documentation/appstoreserverapi
const PRODUCTION_URL = "https://api.storekit.itunes.apple.com";
const SANDBOX_URL = "https://api.storekit-sandbox.itunes.apple.com";

// Subscription status values returned by Apple.
const STATUS_ACTIVE = 1;
const STATUS_BILLING_GRACE_PERIOD = 4;

function appleError(message, { retryable, httpStatus } = {}) {
  const err = new Error(message);
  err.retryable = retryable !== false;
  if (httpStatus) err.httpStatus = httpStatus;
  return err;
}

// Short-lived ES256 token that authorizes our server to call the Apple API.
function generateAppleJWT() {
  const privateKey = process.env.APPLE_IAP_PRIVATE_KEY;
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (!privateKey || !keyId || !issuerId || !bundleId) {
    // A configuration problem is never proof that a subscription is inactive.
    throw appleError(
      "Apple IAP is not configured (APPLE_IAP_PRIVATE_KEY, APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_BUNDLE_ID)",
      { retryable: true }
    );
  }
  return jwt.sign({ bid: bundleId }, privateKey.replace(/\\n/g, "\n"), {
    algorithm: "ES256",
    keyid: keyId,
    issuer: issuerId,
    audience: "appstoreconnect-v1",
    expiresIn: "20m",
  });
}

// Looks the transaction up in production first, then in sandbox. TestFlight and
// App Review purchases only exist in sandbox, so a "not found" in production
// has to fall through. Set APPLE_IAP_SANDBOX=true to query sandbox only.
async function fetchSubscriptionStatuses(transactionId) {
  const token = generateAppleJWT();
  const sandboxOnly = String(process.env.APPLE_IAP_SANDBOX || "").trim() === "true";
  const bases = sandboxOnly ? [SANDBOX_URL] : [PRODUCTION_URL, SANDBOX_URL];

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    let response;
    try {
      response = await fetch(
        `${base}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (e) {
      throw appleError(`Apple API request failed: ${e.message}`, { retryable: true });
    }

    if (response.ok) {
      return {
        body: await response.json(),
        environment: base === SANDBOX_URL ? "Sandbox" : "Production",
      };
    }

    const errorBody = await response.text().catch(() => "");
    const isLast = i === bases.length - 1;
    if (response.status === 404 && !isLast) continue;

    // 404 in the last environment means the transaction id is unknown to
    // Apple: definitive. 400 is a malformed id: definitive. Anything else
    // (401/403 key problems, 429, 5xx) is transient or a configuration issue.
    const definitive = response.status === 404 || response.status === 400;
    throw appleError(`Apple API error: ${response.status} ${errorBody}`, {
      retryable: !definitive,
      httpStatus: response.status,
    });
  }
  throw appleError("Apple API lookup failed", { retryable: true });
}

function decodeSigned(value) {
  if (!value) return null;
  // The response comes straight from Apple over TLS, authenticated by our own
  // key, so its contents are trusted. This is NOT used for inbound webhooks.
  return jwt.decode(value);
}

function collectTransactions(body) {
  const entries = [];
  for (const group of body?.data || []) {
    for (const item of group?.lastTransactions || []) {
      const tx = decodeSigned(item.signedTransactionInfo);
      if (!tx) continue;
      entries.push({
        status: item.status,
        tx,
        renewal: decodeSigned(item.signedRenewalInfo),
      });
    }
  }
  return entries;
}

function isEntryActive(entry) {
  if (entry.tx.revocationDate) return false; // refunded or revoked
  return (
    entry.status === STATUS_ACTIVE || entry.status === STATUS_BILLING_GRACE_PERIOD
  );
}

function expiryMs(entry) {
  if (entry.status === STATUS_BILLING_GRACE_PERIOD && entry.renewal?.gracePeriodExpiresDate) {
    return Number(entry.renewal.gracePeriodExpiresDate);
  }
  return Number(entry.tx.expiresDate || 0);
}

// `transactionId` can be any transaction id of the subscription (the app sends
// the id of the purchase it just made, or an original transaction id).
const verifyAppleTransaction = async ({ transactionId }) => {
  if (!transactionId) throw appleError("Missing transaction id", { retryable: false });

  const { body, environment } = await fetchSubscriptionStatuses(transactionId);
  const entries = collectTransactions(body);
  if (!entries.length) {
    throw appleError("No transaction found", { retryable: false });
  }

  // A subscription group can hold several chains (for example after a plan
  // change). Prefer an active one, then the one that expires last.
  entries.sort((a, b) => {
    const activeDiff = Number(isEntryActive(b)) - Number(isEntryActive(a));
    return activeDiff || expiryMs(b) - expiryMs(a);
  });
  const entry = entries[0];

  const expectedBundleId = process.env.APPLE_BUNDLE_ID;
  if (expectedBundleId && entry.tx.bundleId && entry.tx.bundleId !== expectedBundleId) {
    throw appleError("Purchase belongs to another app", { retryable: false });
  }

  const expiresAtMs = expiryMs(entry);
  const isActive = isEntryActive(entry);

  return {
    isActive,
    appleStatus: entry.status,
    // autoRenewStatus: 1 = on, 0 = the user turned it off.
    autoRenewing:
      entry.renewal && entry.renewal.autoRenewStatus !== undefined
        ? entry.renewal.autoRenewStatus === 1
        : null,
    isTrial:
      entry.tx.offerType === 1 && entry.tx.offerDiscountType === "FREE_TRIAL",
    expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
    originalTransactionId: entry.tx.originalTransactionId,
    productId: entry.tx.productId,
    environment,
  };
};

module.exports = { verifyAppleTransaction };
