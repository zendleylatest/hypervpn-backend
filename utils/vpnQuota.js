const VPN_BYTES_PER_MB = 1024 * 1024;
const VPN_BYTES_PER_GB = 1024 * VPN_BYTES_PER_MB;

const VPN_QUOTA_LIMITS = Object.freeze({
  guest: {
    accountType: "guest",
    limitBytes: 100 * VPN_BYTES_PER_MB,
    limitLabel: "100 MB",
  },
  free: {
    accountType: "free",
    limitBytes: 10 * VPN_BYTES_PER_GB,
    limitLabel: "10 GB",
  },
  pro: {
    accountType: "pro",
    limitBytes: 30 * VPN_BYTES_PER_GB,
    limitLabel: "30 GB",
  },
});

function vpnPlanForUser(user) {
  if (!user) return "anonymous";
  if (user.isPro === true || user.subscription?.plan === "pro") return "pro";
  if (user.isGuest === true) return "guest";
  return "free";
}

function vpnQuotaForUser(user) {
  if (!user) {
    return {
      accountType: "anonymous",
      plan: "anonymous",
      limitBytes: 0,
      limitLabel: "0 MB",
      usedBytes: 0,
      remainingBytes: 0,
      unlimited: false,
      limitReached: true,
    };
  }

  const plan = vpnPlanForUser(user);
  const limits = VPN_QUOTA_LIMITS[plan] || VPN_QUOTA_LIMITS.free;
  const usedBytes = Math.max(0, Number(user.vpnUsageBytes) || 0);
  const remainingBytes = Math.max(limits.limitBytes - usedBytes, 0);

  return {
    accountType: limits.accountType,
    plan: limits.accountType,
    limitBytes: limits.limitBytes,
    limitLabel: limits.limitLabel,
    usedBytes,
    usedLabel: formatBytes(usedBytes),
    remainingBytes,
    remainingLabel: formatBytes(remainingBytes),
    unlimited: false,
    limitReached: usedBytes >= limits.limitBytes,
  };
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= VPN_BYTES_PER_GB) {
    const amount = value / VPN_BYTES_PER_GB;
    return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} GB`;
  }
  const amount = value / VPN_BYTES_PER_MB;
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)} MB`;
}

function subscriptionForUser(user) {
  const existing =
    user?.subscription && typeof user.subscription === "object"
      ? user.subscription.toObject?.() || user.subscription
      : {};
  const isPro = user?.isPro === true || existing.plan === "pro";
  const isGuest = user?.isGuest === true;
  const plan = isPro ? "pro" : isGuest ? "guest" : "free";
  const status = isPro ? existing.status || "active" : existing.status || "inactive";
  const legacyManualGrant = user?.isPro === true && !existing.plan;

  return {
    plan,
    status,
    provider: existing.provider || (existing.manualGrant || legacyManualGrant ? "manual" : "none"),
    productId: existing.productId || "",
    purchaseToken: existing.purchaseToken || "",
    platform: existing.platform || "none",
    source: existing.source || existing.provider || "none",
    originalTransactionId: existing.originalTransactionId || "",
    manualGrant:
      existing.manualGrant === true ||
      existing.provider === "manual" ||
      legacyManualGrant,
    grantedBy: existing.grantedBy || "",
    grantedAt: existing.grantedAt || null,
    expiresAt: existing.expiresAt || null,
    lastVerifiedAt: existing.lastVerifiedAt || null,
    updatedAt: existing.updatedAt || null,
  };
}

function subscriptionUpdateForManualGrant(isPro, adminId = "", user = null) {
  const now = new Date();
  const fallbackPlan = user?.isGuest === true ? "guest" : "free";
  const plan = isPro ? "pro" : fallbackPlan;
  const limits = VPN_QUOTA_LIMITS[plan] || VPN_QUOTA_LIMITS.free;
  return {
    isPro,
    vpnAccountType: plan,
    vpnLimitBytes: limits.limitBytes,
    vpnLimitLabel: limits.limitLabel,
    "subscription.plan": plan,
    "subscription.status": isPro ? "active" : "inactive",
    "subscription.provider": isPro ? "manual" : "none",
    "subscription.purchaseToken": "",
    "subscription.platform": "none",
    "subscription.source": isPro ? "manual" : "none",
    "subscription.manualGrant": isPro,
    "subscription.grantedBy": isPro ? String(adminId || "admin") : "",
    "subscription.grantedAt": isPro ? now : null,
    "subscription.updatedAt": now,
  };
}

function storedAccountFieldsForUser(user) {
  const subscription = subscriptionForUser(user);
  const quota = vpnQuotaForUser({
    isGuest: user?.isGuest === true,
    isPro: user?.isPro === true,
    vpnUsageBytes: user?.vpnUsageBytes,
    subscription,
  });
  return {
    subscription,
    vpnAccountType: quota.accountType,
    vpnLimitBytes: quota.limitBytes,
    vpnLimitLabel: quota.limitLabel,
  };
}

module.exports = {
  VPN_QUOTA_LIMITS,
  formatBytes,
  storedAccountFieldsForUser,
  subscriptionForUser,
  subscriptionUpdateForManualGrant,
  vpnQuotaForUser,
};
