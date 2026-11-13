const mongoose = require("mongoose");
const User = require("../models/usersModel");
const VpnSession = require("../models/vpnSessionModel");
const PushDeviceToken = require("../models/pushDeviceTokenModel");
const ChatUsage = require("../models/chatUsageModel");
const { ensureFirebaseAdmin } = require("../utils/firebaseAdminInit");
const { generationLimitForUser } = require("../utils/generationLimits");
const {
  storedAccountFieldsForUser,
  subscriptionForUser,
  subscriptionUpdateForManualGrant,
  vpnQuotaForUser,
} = require("../utils/vpnQuota");

const VPN_ADMIN_APP_NAME = process.env.VPN_ADMIN_APP_NAME || "secure_vpn";
const BYTES_PER_MB = 1024 * 1024;

function vpnQuotaLimitMB(userOrQuota) {
  const quota = userOrQuota?.limitBytes !== undefined
    ? userOrQuota
    : vpnQuotaForUser(userOrQuota);
  return Number((Number(quota.limitBytes || 0) / BYTES_PER_MB).toFixed(2));
}

function matchesVpnAdminAppFilter(req) {
  const requested = String(req.query?.app_name || "").trim();
  return !requested || requested === VPN_ADMIN_APP_NAME;
}

function vpnAdminUserRow(u) {
  const vpnQuota = vpnQuotaForUser(u);
  const usageLimit = vpnQuotaLimitMB(vpnQuota);
  const status = u.isBanned ? "blocked" : "active";
  return {
    _id: u._id,
    id: u._id,
    name: u.name || "",
    email: u.email || "",
    status,
    active: u.active !== false,
    isBanned: !!u.isBanned,
    bannedAt: u.bannedAt || null,
    bannedReason: u.bannedReason || "",
    usageLimit,
    usageLimitLabel: vpnQuota.limitLabel,
    accountType: vpnQuota.accountType,
    app_name: VPN_ADMIN_APP_NAME,
    totalUsageMB: Number((vpnQuota.usedBytes / BYTES_PER_MB).toFixed(2)),
    usageBytes: vpnQuota.usedBytes,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function getUsers(req, res) {
  try {
    if (!matchesVpnAdminAppFilter(req)) {
      return res.json({
        success: true,
        users: [],
        data: [],
        count: 0,
      });
    }

    const users = await User.find({})
      .select("-password -otp -resetOTP")
      .sort({ createdAt: -1 })
      .lean();

    const rows = users.map((u) => {
      const generationLimit = generationLimitForUser(u);
      const subscription = subscriptionForUser(u);
      const vpnQuota = vpnQuotaForUser(u);
      const usageLimit = vpnQuotaLimitMB(vpnQuota);
      return {
      id: u._id,
      _id: u._id,
      name: u.name || "",
      email: u.email || "",
      status: u.isBanned ? "blocked" : "active",
      usageLimit,
      usageLimitLabel: vpnQuota.limitLabel,
      accountType: vpnQuota.accountType,
      app_name: VPN_ADMIN_APP_NAME,
      profession: u.profession || "",
      image: u.image || "",
      emailVerified: !!u.emailVerified,
      active: u.active !== false,
      isGuest: u.isGuest === true,
      isPro: u.isPro === true,
      subscription,
      limit: generationLimit.limit,
      generationLimit,
      vpnQuota,
      vpnUsageBytes: vpnQuota.usedBytes,
      vpnLimitBytes: vpnQuota.limitBytes,
      vpnLimitLabel: vpnQuota.limitLabel,
      vpnRemainingBytes: vpnQuota.remainingBytes,
      vpnRemainingLabel: vpnQuota.remainingLabel,
      isBanned: !!u.isBanned,
      bannedAt: u.bannedAt || null,
      bannedReason: u.bannedReason || "",
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      openAiUsage: {
        promptTokens: Number(u.openAiUsage?.promptTokens) || 0,
        completionTokens: Number(u.openAiUsage?.completionTokens) || 0,
        totalTokens: Number(u.openAiUsage?.totalTokens) || 0,
        requestCount: Number(u.openAiUsage?.requestCount) || 0,
        lastUsedAt: u.openAiUsage?.lastUsedAt || null,
      },
    };
    });

    if (users.length) {
      await User.bulkWrite(
        users.map((u) => ({
          updateOne: {
            filter: { _id: u._id },
            update: {
              $set: storedAccountFieldsForUser(u),
              $unset: { creationsPublic: "", deviceTokens: "" },
            },
          },
        })),
        { ordered: false }
      );
    }

    return res.json({
      success: true,
      count: rows.length,
      users: rows,
      data: rows,
    });
  } catch (error) {
    console.error("[admin:getUsers] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    const allowedFields = ["name", "profession", "email", "emailVerified", "isPro"];
    const payload = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        payload[key] = req.body[key];
      }
    }

    if (payload.email && typeof payload.email === "string") {
      payload.email = payload.email.trim().toLowerCase();
    }
    if (payload.isPro !== undefined) {
      payload.isPro =
        payload.isPro === true ||
        payload.isPro === "true" ||
        payload.isPro === 1 ||
        payload.isPro === "1";
      const existingUser = await User.findById(id).select("isGuest").lean();
      Object.assign(
        payload,
        subscriptionUpdateForManualGrant(payload.isPro, req.adminId, existingUser)
      );
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    const user = await User.findByIdAndUpdate(id, payload, { new: true }).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      message: "User updated successfully",
      user: {
        ...user.toObject(),
        subscription: subscriptionForUser(user),
        vpnQuota: vpnQuotaForUser(user),
      },
    });
  } catch (error) {
    console.error("[admin:updateUser] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
}

async function setUserBanState(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    const banValue = req.body?.isBanned;
    const isBanned =
      banValue === true ||
      banValue === "true" ||
      banValue === 1 ||
      banValue === "1";
    const update = {
      isBanned,
      bannedAt: isBanned ? new Date() : null,
      bannedReason: isBanned ? String(req.body?.bannedReason || "").trim() : "",
    };

    const user = await User.findByIdAndUpdate(id, update, { new: true }).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (isBanned) {
      await VpnSession.updateMany(
        { userId: user._id, status: "connected" },
        { status: "disconnected", disconnectedAt: new Date() }
      );
    }

    return res.json({
      success: true,
      message: isBanned ? "User banned successfully" : "User unbanned successfully",
      user: {
        id: user._id,
        email: user.email,
        isBanned: user.isBanned,
        bannedAt: user.bannedAt,
        bannedReason: user.bannedReason,
      },
    });
  } catch (error) {
    console.error("[admin:setUserBanState] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user ban state",
      error: error.message,
    });
  }
}

async function updateUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const { status } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }
    if (!["active", "blocked"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid status (active or blocked)",
      });
    }

    const isBanned = status === "blocked";
    const user = await User.findByIdAndUpdate(
      userId,
      {
        isBanned,
        bannedAt: isBanned ? new Date() : null,
        bannedReason: isBanned
          ? String(req.body?.bannedReason || "Blocked from VPN admin").trim()
          : "",
      },
      { new: true }
    ).select("-password -otp -resetOTP");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (isBanned) {
      await VpnSession.updateMany(
        { userId: user._id, status: "connected" },
        { status: "disconnected", disconnectedAt: new Date() }
      );
    }

    return res.json({
      success: true,
      message: `User ${isBanned ? "blocked" : "unblocked"} successfully`,
      data: vpnAdminUserRow(user),
      user: vpnAdminUserRow(user),
    });
  } catch (error) {
    console.error("[admin:updateUserStatus] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
      error: error.message,
    });
  }
}

async function updateUserUsageLimit(req, res) {
  try {
    const userId = req.params.userId || req.params.id;
    const usageLimit = Number(req.body?.usageLimit);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }
    if (!Number.isFinite(usageLimit) || usageLimit < 0) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid usage limit (must be >= 0)",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { usageLimit },
      { new: true }
    ).select("-password -otp -resetOTP");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const row = vpnAdminUserRow(user);
    return res.json({
      success: true,
      message: "User usage limit updated successfully",
      data: {
        ...row,
        usageLimit,
        currentUsage: row.totalUsageMB,
        remainingLimit: Math.max(0, usageLimit - row.totalUsageMB),
      },
    });
  } catch (error) {
    console.error("[admin:updateUserUsageLimit] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user usage limit",
      error: error.message,
    });
  }
}

async function getUserUsageLimit(req, res) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }
    const user = await User.findById(userId)
      .select("name email isGuest isPro subscription usageLimit vpnUsageBytes isBanned createdAt updatedAt")
      .lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const row = vpnAdminUserRow(user);
    const usageLimit = row.usageLimit;
    return res.json({
      success: true,
      data: {
        ...row,
        usageLimit,
        currentUsage: row.totalUsageMB,
        remainingLimit: Math.max(0, usageLimit - row.totalUsageMB),
        usagePercentage:
          usageLimit > 0
            ? Number(Math.min((row.totalUsageMB / usageLimit) * 100, 100).toFixed(2))
            : 0,
      },
    });
  } catch (error) {
    console.error("[admin:getUserUsageLimit] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user usage limit",
      error: error.message,
    });
  }
}

async function toggleUserActive(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }

    const activeValue = req.body?.active;
    const active =
      activeValue === true ||
      activeValue === "true" ||
      activeValue === 1 ||
      activeValue === "1";

    const user = await User.findByIdAndUpdate(id, { active }, { new: true })
      .select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      message: active
        ? "User activated successfully"
        : "User deactivated successfully",
      user: {
        id: user._id,
        email: user.email,
        active: user.active,
      },
    });
  } catch (error) {
    console.error("[admin:toggleUserActive] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user active state",
      error: error.message,
    });
  }
}

async function getUsageOverview(req, res) {
  try {
    const [userAgg, usageAgg] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            users: { $sum: 1 },
            bannedUsers: {
              $sum: {
                $cond: [{ $eq: ["$isBanned", true] }, 1, 0],
              },
            },
          },
        },
      ]),
      ChatUsage.aggregate([
        {
          $group: {
            _id: null,
            totalPromptTokens: {
              $sum: { $ifNull: ["$usage.promptTokens", 0] },
            },
            totalCompletionTokens: {
              $sum: {
                $ifNull: ["$usage.completionTokens", 0],
              },
            },
            totalTokens: {
              $sum: { $ifNull: ["$usage.totalTokens", 0] },
            },
            totalRequests: { $sum: 1 },
          },
        },
      ]),
    ]);

    const topUsers = await User.find({})
      .select("name email isGuest isPro subscription vpnUsageBytes isBanned openAiUsage")
      .sort({ "openAiUsage.totalTokens": -1 })
      .limit(20)
      .lean();

    const summary = {
      users: userAgg[0]?.users || 0,
      bannedUsers: userAgg[0]?.bannedUsers || 0,
      totalPromptTokens:
        usageAgg[0]?.totalPromptTokens || 0,
      totalCompletionTokens:
        usageAgg[0]?.totalCompletionTokens || 0,
      totalTokens: usageAgg[0]?.totalTokens || 0,
      totalRequests: usageAgg[0]?.totalRequests || 0,
    };

    return res.json({
      success: true,
      summary,
      topUsers: topUsers.map((u) => {
        const generationLimit = generationLimitForUser(u);
        const vpnQuota = vpnQuotaForUser(u);
        const subscription = subscriptionForUser(u);
        return {
        id: u._id,
        name: u.name || "",
        email: u.email || "",
        isGuest: u.isGuest === true,
        isPro: u.isPro === true,
        subscription,
        limit: generationLimit.limit,
        generationLimit,
        vpnQuota,
        isBanned: !!u.isBanned,
        openAiUsage: {
          promptTokens: Number(u.openAiUsage?.promptTokens) || 0,
          completionTokens: Number(u.openAiUsage?.completionTokens) || 0,
          totalTokens: Number(u.openAiUsage?.totalTokens) || 0,
          requestCount: Number(u.openAiUsage?.requestCount) || 0,
          lastUsedAt: u.openAiUsage?.lastUsedAt || null,
        },
      };
      }),
    });
  } catch (error) {
    console.error("[admin:getUsageOverview] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch usage overview",
      error: error.message,
    });
  }
}

async function getAllUsersVPNUsage(req, res) {
  try {
    if (!matchesVpnAdminAppFilter(req)) {
      return res.json({ success: true, count: 0, data: [] });
    }

    const users = await User.find({})
      .select("name email isGuest isPro subscription isBanned usageLimit vpnUsageBytes createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();
    const sessionAgg = await VpnSession.aggregate([
      {
        $group: {
          _id: "$userId",
          sessionUsageBytes: { $sum: { $ifNull: ["$usageBytes", 0] } },
          usageCount: { $sum: 1 },
          lastUsage: { $max: "$updatedAt" },
        },
      },
    ]);
    const sessionByUser = new Map(
      sessionAgg
        .filter((row) => row._id)
        .map((row) => [row._id.toString(), row])
    );

    const data = users.map((u) => {
      const session = sessionByUser.get(u._id.toString());
      const vpnQuota = vpnQuotaForUser(u);
      const usageLimit = vpnQuotaLimitMB(vpnQuota);
      const totalBytes = Math.max(
        Number(u.vpnUsageBytes) || 0,
        Number(session?.sessionUsageBytes) || 0
      );
      return {
        userId: u._id,
        userName: u.name || "",
        userEmail: u.email || "",
        userStatus: u.isBanned ? "blocked" : "active",
        usageLimit,
        usageLimitLabel: vpnQuota.limitLabel,
        accountType: vpnQuota.accountType,
        app_name: VPN_ADMIN_APP_NAME,
        totalUsageMB: Number((totalBytes / BYTES_PER_MB).toFixed(2)),
        usageBytes: totalBytes,
        usageCount: Number(session?.usageCount) || 0,
        lastUsage: session?.lastUsage || null,
      };
    });

    data.sort((a, b) => b.totalUsageMB - a.totalUsageMB);
    return res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("[admin:getAllUsersVPNUsage] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch VPN usage",
      error: error.message,
    });
  }
}

async function getSpecificUserUsage(req, res) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user id",
      });
    }
    const user = await User.findById(userId)
      .select("name email isGuest isPro subscription isBanned usageLimit vpnUsageBytes createdAt updatedAt")
      .lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const records = await VpnSession.find({ userId })
      .select("sessionId serverId serverName status usageBytes connectedAt disconnectedAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    const sessionUsageBytes = records.reduce(
      (sum, record) => sum + (Number(record.usageBytes) || 0),
      0
    );
    const totalBytes = Math.max(Number(user.vpnUsageBytes) || 0, sessionUsageBytes);
    const vpnQuota = vpnQuotaForUser(user);
    const usageLimit = vpnQuotaLimitMB(vpnQuota);
    const totalUsageMB = Number((totalBytes / BYTES_PER_MB).toFixed(2));

    return res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name || "",
          email: user.email || "",
          status: user.isBanned ? "blocked" : "active",
          usageLimit,
          usageLimitLabel: vpnQuota.limitLabel,
          accountType: vpnQuota.accountType,
          app_name: VPN_ADMIN_APP_NAME,
        },
        totalUsageMB,
        usageLimit,
        remainingLimit: Math.max(0, usageLimit - totalUsageMB),
        usagePercentage:
          usageLimit > 0
            ? Number(Math.min((totalUsageMB / usageLimit) * 100, 100).toFixed(2))
            : 0,
        usageCount: records.length,
        records: records.map((record) => ({
          id: record._id,
          sessionId: record.sessionId,
          serverId: record.serverId,
          serverName: record.serverName,
          status: record.status,
          usageMB: Number(((Number(record.usageBytes) || 0) / BYTES_PER_MB).toFixed(2)),
          usageBytes: Number(record.usageBytes) || 0,
          date: record.updatedAt || record.disconnectedAt || record.connectedAt,
          connectedAt: record.connectedAt,
          disconnectedAt: record.disconnectedAt,
        })),
      },
    });
  } catch (error) {
    console.error("[admin:getSpecificUserUsage] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user VPN usage",
      error: error.message,
    });
  }
}

async function broadcastNotification(req, res) {
  try {
    const firebaseAdmin = ensureFirebaseAdmin();
    if (!firebaseAdmin) {
      return res.status(503).json({
        success: false,
        message: "Push notifications not configured. Missing Firebase setup.",
      });
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const data = req.body?.data && typeof req.body.data === "object" ? req.body.data : {};

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: "title and body are required",
      });
    }

    const uniqueTokens = new Set();
    const standaloneRows = await PushDeviceToken.find({ isActive: true }).select("token").lean();
    for (const row of standaloneRows) {
      if (row?.token) {
        uniqueTokens.add(row.token);
      }
    }

    const tokens = Array.from(uniqueTokens);
    if (!tokens.length) {
      return res.json({
        success: true,
        message: "No registered device tokens found",
        totalTokens: 0,
        successCount: 0,
        failureCount: 0,
      });
    }

    const chunkSize = 500;
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const response = await firebaseAdmin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: Object.entries(data).reduce((acc, [k, v]) => {
          acc[String(k)] = String(v);
          return acc;
        }, {}),
      });

      successCount += response.successCount || 0;
      failureCount += response.failureCount || 0;
    }

    return res.json({
      success: true,
      message: "Broadcast notification sent",
      totalTokens: tokens.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    console.error("[admin:broadcastNotification] error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send broadcast notification",
      error: error.message,
    });
  }
}

module.exports = {
  getUsers,
  updateUser,
  setUserBanState,
  updateUserStatus,
  updateUserUsageLimit,
  getUserUsageLimit,
  toggleUserActive,
  getUsageOverview,
  getAllUsersVPNUsage,
  getSpecificUserUsage,
  broadcastNotification,
};
