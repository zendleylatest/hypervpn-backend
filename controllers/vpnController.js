const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const User = require("../models/usersModel");
const VpnSession = require("../models/vpnSessionModel");
const { subscriptionForUser, vpnQuotaForUser } = require("../utils/vpnQuota");
const { verifyIapPurchase } = require("../services/iapVerificationService");

const OVPN_DIR = path.resolve(__dirname, "..", "ovpn");
const STORE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STORE_REFRESH_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000;

const VPN_SERVERS = [
  {
    id: "optimal",
    name: "Optimal Location",
    country: "Auto",
    city: "Fastest server",
    region: "Recommended",
    countryCode: "AUTO",
    flag: "bolt",
    latencyMs: 18,
    loadPercent: 24,
    streamingOptimized: false,
    premium: false,
  },
  {
    id: "ukvpn",
    name: "United Kingdom, London",
    country: "United Kingdom",
    city: "London",
    region: "Europe",
    countryCode: "GB",
    flag: "GB",
    latencyMs: 58,
    loadPercent: 28,
    streamingOptimized: true,
    premium: false,
    ovpnFile: "ukvpn.ovpn",
  },
  {
    id: "singapurvpn",
    name: "Singapore",
    country: "Singapore",
    city: "Singapore",
    region: "Asia Pacific",
    countryCode: "SG",
    flag: "SG",
    latencyMs: 82,
    loadPercent: 32,
    streamingOptimized: true,
    premium: false,
    ovpnFile: "singapurvpn.ovpn",
  },
  {
    id: "usavpn",
    name: "USA, New York",
    country: "USA",
    city: "New York",
    region: "North America",
    countryCode: "US",
    flag: "US",
    latencyMs: 35,
    loadPercent: 27,
    streamingOptimized: true,
    premium: false,
    ovpnFile: "usavpn.ovpn",
  },
  {
    id: "canada-montreal",
    name: "Canada, Montreal",
    country: "Canada",
    city: "Montreal",
    region: "North America",
    countryCode: "CA",
    flag: "CA",
    latencyMs: 64,
    loadPercent: 42,
    streamingOptimized: false,
    premium: false,
  },
  {
    id: "canada-toronto",
    name: "Canada, Toronto",
    country: "Canada",
    city: "Toronto",
    region: "North America",
    countryCode: "CA",
    flag: "CA",
    latencyMs: 52,
    loadPercent: 31,
    streamingOptimized: false,
    premium: false,
  },
  {
    id: "mexico-mexico-city",
    name: "Mexico, Mexico City",
    country: "Mexico",
    city: "Mexico City",
    region: "North America",
    countryCode: "MX",
    flag: "MX",
    latencyMs: 86,
    loadPercent: 44,
    streamingOptimized: false,
    premium: false,
  },
  {
    id: "usa-atlanta",
    name: "USA, Atlanta",
    country: "USA",
    city: "Atlanta",
    region: "North America",
    countryCode: "US",
    flag: "US",
    latencyMs: 48,
    loadPercent: 36,
    streamingOptimized: false,
    premium: false,
  },
  {
    id: "usa-chicago",
    name: "USA, Chicago",
    country: "USA",
    city: "Chicago",
    region: "North America",
    countryCode: "US",
    flag: "US",
    latencyMs: 44,
    loadPercent: 29,
    streamingOptimized: true,
    premium: false,
  },
  {
    id: "usa-new-york",
    name: "USA, New York",
    country: "USA",
    city: "New York",
    region: "North America",
    countryCode: "US",
    flag: "US",
    latencyMs: 35,
    loadPercent: 27,
    streamingOptimized: true,
    premium: false,
  },
  {
    id: "usa-honolulu",
    name: "USA, Honolulu",
    country: "USA",
    city: "Honolulu",
    region: "North America",
    countryCode: "US",
    flag: "US",
    latencyMs: 118,
    loadPercent: 39,
    streamingOptimized: false,
    premium: false,
  },
  {
    id: "usa-las-vegas",
    name: "USA, Las Vegas",
    country: "USA",
    city: "Las Vegas",
    region: "North America",
    countryCode: "US",
    flag: "US",
    latencyMs: 71,
    loadPercent: 33,
    streamingOptimized: false,
    premium: false,
  },
  {
  id: "europe",
  name: "Europe",
  country: "Europe",
  city: "Europe",
  region: "Europe",
  countryCode: "EU",
  flag: "EU",
  latencyMs: 60,
  loadPercent: 30,
  streamingOptimized: true,
  premium: false,
  ovpnFile: "europe.ovpn",
},
];

const PLANS = [
  {
    id: "monthly",
    title: "1 month",
    price: 129,
    currency: "Rs",
    period: "month",
    trialDays: 0,
    bestDeal: false,
  },
  {
    id: "six_months",
    title: "6 months",
    price: 104.83,
    currency: "Rs",
    period: "month",
    billedText: "Rs 629 billed every 6 months",
    trialDays: 0,
    bestDeal: false,
  },
  {
    id: "yearly",
    title: "12 months",
    price: 79.08,
    currency: "Rs",
    period: "month",
    billedText: "Rs 949 billed annually",
    trialDays: 7,
    bestDeal: true,
  },
];

function getServerById(serverId) {
  const normalized = String(serverId || "").trim().toLowerCase();
  if (!normalized || normalized === "optimal") {
    return getRandomAvailableServer();
  }
  return VPN_SERVERS.find((server) => server.id === normalized);
}

function getProfilePath(server) {
  if (!server?.ovpnFile) return null;
  const profilePath = path.resolve(OVPN_DIR, server.ovpnFile);
  if (!profilePath.startsWith(OVPN_DIR + path.sep)) return null;
  if (!fs.existsSync(profilePath)) return null;
  return profilePath;
}

function getAvailableProfileServers() {
  return VPN_SERVERS.filter((server) => server.id !== "optimal" && getProfilePath(server));
}

function getRandomAvailableServer() {
  const available = getAvailableProfileServers();
  if (available.length === 0) return VPN_SERVERS.find((server) => server.id === "ukvpn");
  return available[Math.floor(Math.random() * available.length)];
}

function getPublicServer(server) {
  const profileAvailable = Boolean(getProfilePath(server));
  return {
    id: server.id,
    name: server.name,
    country: server.country,
    city: server.city,
    region: server.region,
    countryCode: server.countryCode,
    flag: server.flag,
    latencyMs: server.latencyMs,
    loadPercent: server.loadPercent,
    streamingOptimized: server.streamingOptimized,
    premium: server.premium,
    profileAvailable,
    ovpnProfileId: profileAvailable ? server.id : null,
    profileUrl: profileAvailable
      ? `/api/vpn/servers/${server.id}/profile`
      : null,
  };
}

function getVirtualIp(server) {
  const seed = crypto
    .createHash("sha256")
    .update(server.id + Date.now().toString())
    .digest();
  return `10.${8 + (seed[0] % 8)}.${seed[1]}.${Math.max(2, seed[2])}`;
}

function quotaLimitResponse(quota) {
  return {
    success: false,
    code: "VPN_QUOTA_LIMIT_REACHED",
    message: "Upgrade to Pro to continue using VPN.",
    upgradeRequired: true,
    quota,
  };
}

function normalizeIapStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "unsupported_platform") return "unsupported";
  if (normalized === "cancelled") return "canceled";
  if (
    ["inactive", "active", "canceled", "expired", "verify_failed", "unsupported"].includes(
      normalized
    )
  ) {
    return normalized;
  }
  return "inactive";
}

function providerForIap(platform) {
  if (platform === "android") return "google";
  if (platform === "ios") return "apple";
  return "none";
}

function entitlementPayload(user) {
  const quota = vpnQuotaForUser(user);
  const subscription = subscriptionForUser(user);
  const isPro = user?.isPro === true || subscription.plan === "pro";
  return {
    isPro,
    isGuest: user?.isGuest === true,
    isUnlimited: false,
    quota,
    subscription: {
      plan: subscription.plan,
      status: subscription.status,
      provider: subscription.provider,
      productId: subscription.productId || null,
      platform: subscription.platform || "none",
      source: subscription.source || subscription.provider || "none",
      expiresAt: subscription.expiresAt || null,
      lastVerifiedAt: subscription.lastVerifiedAt || null,
      updatedAt: subscription.updatedAt || null,
    },
  };
}

async function clearPremiumEntitlement(user, status = "inactive", source = "none") {
  const now = new Date();
  const fallbackPlan = user.isGuest === true ? "guest" : "free";
  user.isPro = false;
  user.subscription = {
    ...(user.subscription?.toObject?.() || user.subscription || {}),
    plan: fallbackPlan,
    status: normalizeIapStatus(status),
    provider: "none",
    productId: "",
    purchaseToken: "",
    platform: "none",
    source,
    originalTransactionId: "",
    manualGrant: false,
    expiresAt: null,
    lastVerifiedAt: now,
    updatedAt: now,
  };
  await user.save();
  return user;
}

function shouldRefreshStoreSubscription(user, force = false) {
  const sub = subscriptionForUser(user);
  if (sub.manualGrant) return false;
  if (sub.platform !== "android" && sub.platform !== "ios") return false;
  if (!sub.productId || !sub.purchaseToken) return false;
  if (force) return true;

  const lastVerifiedMs = sub.lastVerifiedAt ? new Date(sub.lastVerifiedAt).getTime() : 0;
  if (!lastVerifiedMs || Date.now() - lastVerifiedMs > STORE_REFRESH_INTERVAL_MS) return true;

  const expiresMs = sub.expiresAt ? new Date(sub.expiresAt).getTime() : 0;
  return Boolean(expiresMs && expiresMs - Date.now() < STORE_REFRESH_EXPIRY_WINDOW_MS);
}

async function applyIapVerification(user, verification, fallback = {}) {
  const now = new Date();
  if (!verification?.ok && verification?.retryable === true) {
    // The store could not be reached or is misconfigured. That is not proof
    // the subscription ended, so keep whatever the user has right now.
    return user;
  }
  if (!verification?.ok) {
    await clearPremiumEntitlement(
      user,
      verification?.status || "verify_failed",
      verification?.source || "google_play"
    );
    return user;
  }

  const platform = verification.platform || fallback.platform || "android";
  const isIos = platform === "ios";
  user.isPro = true;
  user.subscription = {
    ...(user.subscription?.toObject?.() || user.subscription || {}),
    plan: "pro",
    status: "active",
    provider: providerForIap(platform),
    // On iOS the store tells us the real product and the original transaction
    // id (renewals get new ids, the original id stays the same for the life of
    // the subscription and is what App Store notifications refer to).
    productId:
      (isIos && verification.payload?.productId) ||
      fallback.productId ||
      user.subscription?.productId ||
      "",
    purchaseToken: fallback.purchaseToken || user.subscription?.purchaseToken || "",
    platform,
    source: verification.source || "google_play",
    originalTransactionId:
      (isIos && verification.payload?.originalTransactionId) ||
      fallback.transactionId ||
      user.subscription?.originalTransactionId ||
      "",
    manualGrant: false,
    expiresAt: verification.expiresAt ? new Date(verification.expiresAt) : null,
    lastVerifiedAt: now,
    updatedAt: now,
  };
  await user.save();
  return user;
}

async function refreshStoreSubscription(user, { force = false } = {}) {
  if (!shouldRefreshStoreSubscription(user, force)) return null;
  const sub = subscriptionForUser(user);
  // For iOS look the subscription up by its original transaction id, which
  // stays valid for as long as the subscription exists.
  const purchaseToken =
    sub.platform === "ios" && sub.originalTransactionId
      ? sub.originalTransactionId
      : sub.purchaseToken;
  const verification = await verifyIapPurchase({
    platform: sub.platform,
    productId: sub.productId,
    purchaseToken,
  });
  await applyIapVerification(user, verification, {
    platform: sub.platform,
    productId: sub.productId,
    purchaseToken: sub.purchaseToken,
    transactionId: sub.originalTransactionId,
  });
  return verification;
}

async function disconnectUserSessions(userId, reason = "limit_reached") {
  if (!userId) return;
  await VpnSession.updateMany(
    { userId, status: "connected" },
    { status: reason, disconnectedAt: new Date() }
  );
}

function publicSessionPayload(session) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    serverId: session.serverId,
    serverName: session.serverName,
    protocol: session.protocol,
    status: session.status,
    virtualIp: session.virtualIp,
    connectedAt: session.connectedAt,
    disconnectedAt: session.disconnectedAt,
    usageBytes: Number(session.usageBytes) || 0,
  };
}

async function listServers(req, res) {
  const availableServers = getAvailableProfileServers();
  const servers = [
    VPN_SERVERS.find((server) => server.id === "optimal"),
    ...availableServers,
  ].filter(Boolean);
  const regions = [...new Set(servers.map((server) => server.region))];
  console.log("[vpn:servers:list]", {
    availableCount: availableServers.length,
    returnedIds: servers.map((server) => server.id),
    ovpnDir: OVPN_DIR,
  });
  return res.json({
    success: true,
    selectedServerId: availableServers[0]?.id || "optimal",
    regions,
    servers: servers.map(getPublicServer),
  });
}

async function getOptimalServer(req, res) {
  const server = getServerById("optimal");
  console.log("[vpn:servers:optimal]", {
    selectedId: server?.id || null,
    selectedName: server?.name || null,
  });
  return res.json({
    success: true,
    server: getPublicServer(server),
  });
}

async function getVpnConfig(req, res) {
  return res.json({
    success: true,
    appName: "Secure VPN",
    defaultServerId: "ukvpn",
    protocols: ["wireguard", "openvpn"],
    connectionTimeoutSeconds: 8,
    reconnectEnabled: true,
    support: {
      faqChat: "POST /api/faq/chat",
      contact: "Use the in-app Contact Us dialog.",
    },
  });
}

async function getPlans(req, res) {
  return res.json({
    success: true,
    plans: PLANS,
    features: [
      "Unlimited VPN",
      "Hide your IP address",
      "Secure public Wi-Fi",
      "Auto Connect",
      "DNS leak protection",
      "Location selector",
      "Split Tunneling",
      "Ad-free experience",
    ],
  });
}

async function connect(req, res) {
  try {
    const authUser = req.authUser;
    if (!authUser?._id) {
      return res.status(401).json({
        success: false,
        message: "Sign in or continue as guest before connecting VPN.",
      });
    }
    const user = await User.findById(authUser._id);
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found." });
    }
    const quota = vpnQuotaForUser(user);
    if (quota.limitReached) {
      await disconnectUserSessions(user._id);
      return res.status(402).json(quotaLimitResponse(quota));
    }
    console.log("[vpn:connect:start]", {
      requestedServerId: req.body?.serverId || null,
      deviceId: req.body?.deviceId || null,
      protocol: req.body?.protocol || null,
      platform: req.body?.platform || null,
      userId: user._id.toString(),
      quota,
    });
    const server = getServerById(req.body?.serverId);
    if (!server) {
      console.warn("[vpn:connect:not-found]", {
        requestedServerId: req.body?.serverId || null,
      });
      return res.status(404).json({
        success: false,
        message: "VPN server not found.",
      });
    }
    const profilePath = getProfilePath(server);
    if (!profilePath) {
      console.warn("[vpn:connect:no-profile]", {
        serverId: server.id,
        ovpnFile: server.ovpnFile || null,
      });
      return res.status(404).json({
        success: false,
        message: "OpenVPN profile not available for this server.",
      });
    }

    const deviceId = String(req.body?.deviceId || "").trim();
    if (deviceId) {
      await VpnSession.updateMany(
        { deviceId, status: "connected" },
        { status: "disconnected", disconnectedAt: new Date() }
      );
    }
    await VpnSession.updateMany(
      { userId: user._id, status: "connected" },
      { status: "disconnected", disconnectedAt: new Date() }
    );

    const session = await VpnSession.create({
      deviceId,
      userId: user._id,
      sessionId: crypto.randomUUID(),
      serverId: server.id,
      serverName: server.name,
      protocol:
        req.body?.protocol === "openvpn" ? "openvpn" : "wireguard",
      status: "connected",
      virtualIp: getVirtualIp(server),
      connectedAt: new Date(),
      metadata: {
        appVersion: req.body?.appVersion || "",
        platform: req.body?.platform || "",
      },
    });

    console.log("[vpn:connect:success]", {
      sessionId: session.sessionId,
      serverId: session.serverId,
      serverName: session.serverName,
      deviceId,
      virtualIp: session.virtualIp,
      profile: server.ovpnFile,
    });
    return res.status(201).json({
      success: true,
      status: "connected",
      server: getPublicServer(server),
      quota,
      session: publicSessionPayload(session),
    });
  } catch (error) {
    console.error("[vpn:connect] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create VPN session.",
    });
  }
}

async function disconnect(req, res) {
  try {
    const userId = req.authUser?._id;
    const sessionId = String(req.body?.sessionId || "").trim();
    const deviceId = String(req.body?.deviceId || "").trim();
    console.log("[vpn:disconnect:start]", {
      sessionId: sessionId || null,
      deviceId: deviceId || null,
    });
    const filter = sessionId
      ? { sessionId, ...(userId ? { userId } : {}) }
      : { deviceId, status: "connected", ...(userId ? { userId } : {}) };

    if (!sessionId && !deviceId) {
      return res.status(400).json({
        success: false,
        message: "Provide sessionId or deviceId.",
      });
    }

    const session = await VpnSession.findOneAndUpdate(
      filter,
      { status: "disconnected", disconnectedAt: new Date() },
      { new: true, sort: { updatedAt: -1 } }
    ).lean();

    console.log("[vpn:disconnect:done]", {
      found: Boolean(session),
      sessionId: session?.sessionId || sessionId || null,
      serverId: session?.serverId || null,
      status: session?.status || "disconnected",
    });
    return res.json({
      success: true,
      status: "disconnected",
      session: session
        ? publicSessionPayload(session)
        : null,
    });
  } catch (error) {
    console.error("[vpn:disconnect] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to disconnect VPN session.",
    });
  }
}

async function getSession(req, res) {
  try {
    const userId = req.authUser?._id;
    const sessionId = String(req.params.sessionId || "").trim();
    console.log("[vpn:session:get]", { sessionId });
    const session = await VpnSession.findOne({
      sessionId,
      ...(userId ? { userId } : {}),
    }).lean();
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "VPN session not found.",
      });
    }

    const user = userId ? await User.findById(userId) : null;
    const quota = vpnQuotaForUser(user);
    if (session.status === "connected" && quota.limitReached) {
      await VpnSession.updateOne(
        { _id: session._id },
        { status: "limit_reached", disconnectedAt: new Date() }
      );
      session.status = "limit_reached";
      session.disconnectedAt = new Date();
    }
    return res.json({
      success: true,
      quota,
      upgradeRequired: quota.limitReached,
      session: publicSessionPayload(session),
    });
  } catch (error) {
    console.error("[vpn:getSession] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load VPN session.",
    });
  }
}

async function reportUsage(req, res) {
  try {
    const userId = req.authUser?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const sessionId = String(req.params.sessionId || "").trim();
    const deltaBytes = Math.max(0, Math.floor(Number(req.body?.deltaBytes) || 0));
    if (!sessionId) {
      return res.status(400).json({ success: false, message: "Session ID required." });
    }
    if (deltaBytes <= 0) {
      const user = await User.findById(userId);
      return res.json({
        success: true,
        quota: vpnQuotaForUser(user),
        session: await VpnSession.findOne({ sessionId, userId }).lean().then(publicSessionPayload),
      });
    }

    const session = await VpnSession.findOne({ sessionId, userId });
    if (!session) {
      return res.status(404).json({ success: false, message: "VPN session not found." });
    }
    if (session.status !== "connected") {
      const user = await User.findById(userId);
      return res.json({
        success: true,
        quota: vpnQuotaForUser(user),
        upgradeRequired: session.status === "limit_reached",
        session: publicSessionPayload(session),
      });
    }

    session.usageBytes = Math.max(0, Number(session.usageBytes) || 0) + deltaBytes;
    await session.save();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    user.vpnUsageBytes = Math.max(0, Number(user.vpnUsageBytes) || 0) + deltaBytes;
    await user.save();
    const quota = vpnQuotaForUser(user);

    if (quota.limitReached) {
      session.status = "limit_reached";
      session.disconnectedAt = new Date();
      await session.save();
      await disconnectUserSessions(userId);
      return res.status(402).json({
        ...quotaLimitResponse(quota),
        session: publicSessionPayload(session),
      });
    }

    return res.json({
      success: true,
      quota,
      session: publicSessionPayload(session),
    });
  } catch (error) {
    console.error("[vpn:usage] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to record VPN usage.",
    });
  }
}

async function getEntitlement(req, res) {
  try {
    const userId = req.authUser?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    await refreshStoreSubscription(user);
    return res.json({
      success: true,
      entitlement: entitlementPayload(user),
    });
  } catch (error) {
    console.error("[vpn:iap:entitlement] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load VPN entitlement.",
    });
  }
}

async function verifyIap(req, res) {
  try {
    const userId = req.authUser?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const platform = String(req.body?.platform || "").trim().toLowerCase();
    const productId = String(req.body?.productId || "").trim();
    const purchaseToken = String(req.body?.purchaseToken || "").trim();
    const packageName = String(req.body?.packageName || "").trim();
    const transactionId = String(req.body?.transactionId || "").trim();

    if (!platform || !productId || !purchaseToken) {
      return res.status(400).json({
        success: false,
        code: "IAP_MISSING_FIELDS",
        message: "platform, productId, and purchaseToken are required.",
        entitlement: entitlementPayload(user),
      });
    }

    const verification = await verifyIapPurchase({
      platform,
      productId,
      purchaseToken,
      packageName,
    });
    await applyIapVerification(user, verification, {
      platform,
      productId,
      purchaseToken,
      transactionId,
    });

    const entitlement = entitlementPayload(user);
    if (!verification.ok) {
      return res.status(400).json({
        success: false,
        code: "IAP_VERIFY_FAILED",
        message: verification.reason || "Could not verify purchase.",
        verification,
        entitlement,
      });
    }

    return res.json({
      success: true,
      message: "Purchase verified.",
      verification,
      entitlement,
    });
  } catch (error) {
    console.error("[vpn:iap:verify] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify purchase.",
    });
  }
}

async function clearPremiumAfterRestore(req, res) {
  try {
    const userId = req.authUser?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    await clearPremiumEntitlement(user, "inactive", "restore_no_active_purchase");
    return res.json({
      success: true,
      entitlement: entitlementPayload(user),
    });
  } catch (error) {
    console.error("[vpn:iap:restore-clear] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to clear restored entitlement.",
    });
  }
}

async function getServerProfile(req, res) {
  const server = getServerById(req.params.serverId);
  console.log("[vpn:profile:request]", {
    requestedServerId: req.params.serverId,
    resolvedServerId: server?.id || null,
  });
  if (!server) {
    return res.status(404).json({
      success: false,
      message: "VPN server not found.",
    });
  }

  const profilePath = getProfilePath(server);
  if (!profilePath) {
    console.warn("[vpn:profile:not-available]", {
      serverId: server.id,
      ovpnFile: server.ovpnFile || null,
    });
    return res.status(404).json({
      success: false,
      message: "OpenVPN profile not available for this server.",
    });
  }

  res.setHeader("Content-Type", "application/x-openvpn-profile");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${server.ovpnFile}"`
  );
  console.log("[vpn:profile:send]", {
    serverId: server.id,
    file: server.ovpnFile,
  });
  return res.sendFile(profilePath);
}

module.exports = {
  listServers,
  getOptimalServer,
  getVpnConfig,
  getPlans,
  getEntitlement,
  verifyIap,
  clearPremiumAfterRestore,
  refreshStoreSubscription,
  getServerProfile,
  connect,
  disconnect,
  getSession,
  reportUsage,
};
