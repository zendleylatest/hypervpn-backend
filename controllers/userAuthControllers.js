const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");
const { setUser } = require("../services/userAuthService");
const {
  appleAuthService,
  exchangeAuthorizationCode,
  revokeAppleToken,
} = require("../services/appleAuthService");
const { sendOTPEmail, sendEmail } = require("../services/emailService");
const User = require("../models/usersModel");
const PromptGeneration = require("../models/promptGenerationModel");
const SavedIdea = require("../models/savedIdeaModel");
const { generationLimitForUser } = require("../utils/generationLimits");
const { subscriptionForUser, vpnQuotaForUser } = require("../utils/vpnQuota");
const {
  NETWORK_ERROR,
  SIGNED_UP,
  SIGN_UP_FAILED,
  USER_NOT_FOUND,
  WRONG_PASSWORD,
  LOGGED_IN,
  ALL_FILEDS_REQUIRED,
  NAME_REQUIRED,
  EMAIL_REQUIRED,
  PASSWORD_REQUIRED,
  OTP_SEND_FAILED,
  INVALID_OTP,
  EMAIL_NOT_VERIFIED,
  USER_ID_OTP_REQUIRED,
} = require("../messages/message");

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function deleteLocalProfileImage(imagePath) {
  const value = String(imagePath || "").trim();
  if (!value || value.startsWith("http://") || value.startsWith("https://")) {
    return;
  }

  const normalized = value.replace(/\\/g, "/");
  if (!normalized.startsWith("/uploads/profile/")) {
    return;
  }

  const filename = path.basename(normalized);
  if (!filename) return;

  const profileDir = path.resolve(process.cwd(), "uploads", "profile");
  const absolutePath = path.resolve(profileDir, filename);
  if (!absolutePath.startsWith(profileDir + path.sep)) {
    return;
  }

  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log("[profile:image-delete]", { file: filename });
    }
  } catch (err) {
    console.error("[profile:image-delete] failed:", err?.message || err);
  }
}

function makeAuthPayload(user, message = LOGGED_IN) {
  const token = setUser(user);
  const generationLimit = generationLimitForUser(user);
  const vpnQuota = vpnQuotaForUser(user);
  const subscription = subscriptionForUser(user);
  return {
    success: message,
    token,
    userId: user._id,
    id: user._id,
    username: user.name || (user.isGuest ? "Guest" : ""),
    useremail: user.email || "",
    isGuest: user.isGuest === true,
    isPro: user.isPro === true,
    subscription,
    limit: generationLimit.limit,
    generationLimit,
    vpnQuota,
    user: {
      id: user._id.toString(),
      email: user.email || "",
      name: user.name || "",
      isGuest: user.isGuest === true,
      isPro: user.isPro === true,
      subscription,
      limit: generationLimit.limit,
      generationLimit,
      vpnQuota,
      emailVerified: user.emailVerified === true,
    },
  };
}

function guestEmailForDevice(deviceId) {
  const raw = String(deviceId || Date.now()).trim();
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || Date.now().toString();
  return `guest_${safe}@securevpn.guest`;
}
const isValidOTP = (otp) => typeof otp === "string" && /^\d{6}$/.test(otp);

function authDebug(event, payload = {}) {
  console.log(
    `[auth:${event}]`,
    JSON.stringify({
      at: new Date().toISOString(),
      ...payload,
    })
  );
}

async function handleUserSignUp(req, res) {
  const body = req.body;
  if (!body) return res.status(400).json({ message: ALL_FILEDS_REQUIRED });
  if (!body.name) return res.status(400).json({ message: NAME_REQUIRED });
  if (!body.email) return res.status(400).json({ message: EMAIL_REQUIRED });
  if (!body.password) return res.status(400).json({ message: PASSWORD_REQUIRED });

  try {
    const hashed = await bcrypt.hash(body.password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const normalizedEmail = String(body.email || "").trim().toLowerCase();

    authDebug("signup:start", {
      email: normalizedEmail,
      name: body.name,
      otp,
    });

    const result = await User.create({
      name: body.name,
      email: normalizedEmail || body.email,
      profession: body.profession ?? undefined,
      password: hashed,
      image: req.file ? `/uploads/${req.file.filename}` : null,
      otp,
      emailVerified: false,
      isGuest: false,
      subscription: {
        plan: "free",
        status: "inactive",
        provider: "none",
        manualGrant: false,
      },
    });
    authDebug("signup:user-created", {
      userId: result._id,
      email: result.email,
      otp,
    });

    try {
      await sendOTPEmail(result.email.trim(), otp);
      authDebug("signup:otp-sent", {
        userId: result._id,
        email: result.email,
        otp,
      });
    } catch (mailErr) {
      console.error("OTP email error:", mailErr);
      authDebug("signup:otp-send-failed", {
        userId: result._id,
        email: result.email,
        otp,
        error: mailErr?.message || String(mailErr),
      });
      await User.findByIdAndDelete(result._id);
      return res.status(500).json({ error: OTP_SEND_FAILED });
    }

    res.status(201).json({
      message: "User created. OTP sent to email.",
      userId: result._id,
      success: SIGNED_UP,
    });
  } catch (err) {
    console.error("DB create error:", err);
    res.status(500).json({ error: SIGN_UP_FAILED });
  }
}

async function handleVerifyOTP(req, res) {
  try {
    const { userId, otp } = req.body;
    authDebug("otp-verify:start", {
      userId,
      providedOtp: otp == null ? null : String(otp).trim(),
    });
    if (
      userId == null ||
      otp === undefined ||
      otp === null ||
      String(otp).trim() === ""
    ) {
      return res.status(400).json({ error: USER_ID_OTP_REQUIRED });
    }

    const user = await User.findById(userId);
    if (!user) {
      authDebug("otp-verify:user-not-found", {
        userId,
        providedOtp: String(otp).trim(),
      });
      return res.status(400).json({ error: USER_NOT_FOUND });
    }

    if (user.otp !== String(otp).trim()) {
      authDebug("otp-verify:invalid", {
        userId: user._id,
        email: user.email,
        providedOtp: String(otp).trim(),
        expectedOtp: user.otp,
        isGuest: user.isGuest === true,
      });
      return res.status(400).json({ error: INVALID_OTP });
    }

    authDebug("otp-verify:success", {
      userId: user._id,
      email: user.email,
      otp: String(otp).trim(),
      wasGuest: user.isGuest === true,
    });
    const wasGuest = user.isGuest === true;
    user.emailVerified = true;
    user.otp = null;
    await user.save();

    user.isGuest = false;
    if (user.isPro !== true && user.subscription?.manualGrant !== true) {
      user.subscription = {
        ...(user.subscription?.toObject?.() || user.subscription || {}),
        plan: "free",
        status: "inactive",
        provider: "none",
        manualGrant: false,
        updatedAt: new Date(),
      };
    }
    await user.save();
    if (wasGuest && user.email) {
      PromptGeneration.updateMany(
        { userId: user._id },
        { $set: { generatedBy: user.email } }
      ).catch((err) => {
        console.error("[guest-upgrade] failed to update prompt email:", err);
      });
    }

    res.json(makeAuthPayload(user, "Email verified successfully."));
  } catch (err) {
    console.error("verify OTP error:", err);
    res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleUserLogin(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: USER_NOT_FOUND });
    if (user.active === false) {
      return res.status(403).json({
        error: "Your account is deactivated. Please contact support.",
      });
    }
    if (user.isBanned) {
      return res.status(403).json({
        error: "Your account is banned. Please contact support.",
        bannedReason: user.bannedReason || "",
      });
    }

    if (user.emailVerified === false) {
      return res.status(400).json({ error: EMAIL_NOT_VERIFIED });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: WRONG_PASSWORD });
    res.json(makeAuthPayload(user));
  } catch (err) {
    res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleGoogleLogin(req, res) {
  try {
    if (!googleClient || !process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "Google sign-in is not configured" });
    }
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: "Google ID token required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: "Invalid Google token" });
    }

    const { sub, email, name, email_verified, picture } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: name || "Google User",
        email,
        googleId: sub,
        emailVerified: email_verified !== false,
        image: picture || undefined,
      });
      authDebug("google:user-created", {
        userId: user._id,
        email: user.email,
        googleId: sub,
        emailVerified: user.emailVerified,
      });
    } else {
      authDebug("google:user-found", {
        userId: user._id,
        email: user.email,
        googleId: user.googleId || sub,
        emailVerified: user.emailVerified,
      });
      let updated = false;
      if (!user.googleId) {
        user.googleId = sub;
        updated = true;
      }
      if (!user.image && picture) {
        user.image = picture;
        updated = true;
      }
      if (!user.emailVerified && email_verified) {
        user.emailVerified = true;
        updated = true;
      }
      if (updated) await user.save();
    }

    if (user.active === false) {
      return res.status(403).json({
        error: "Your account is deactivated. Please contact support.",
      });
    }
    if (user.isBanned) {
      return res.status(403).json({
        error: "Your account is banned. Please contact support.",
        bannedReason: user.bannedReason || "",
      });
    }

    res.json(makeAuthPayload(user));
  } catch (err) {
    console.error("Google login error:", err.message);
    res.status(500).json({ error: "Google authentication failed" });
  }
}


// POST /auth/apple  { identityToken, authorizationCode?, fullName? }
async function handleAppleLogin(req, res) {
  try {
    if (!process.env.APPLE_BUNDLE_ID) {
      return res.status(500).json({ error: "Apple sign-in is not configured" });
    }
    const { identityToken, authorizationCode, fullName } = req.body || {};
    if (!identityToken || typeof identityToken !== "string") {
      return res.status(400).json({ error: "Apple identity token required" });
    }

    const user = await appleAuthService({ identityToken, fullName }, User);

    // Needed later to revoke the grant when the account is deleted.
    const refreshToken = await exchangeAuthorizationCode(authorizationCode);
    if (refreshToken) {
      user.appleRefreshToken = refreshToken;
      await user.save();
    }

    res.json(makeAuthPayload(user));
  } catch (err) {
    const status = err.status || 500;
    console.error("Apple login error:", err.message);
    res.status(status).json({
      error: status === 500 ? "Apple authentication failed" : err.message,
      ...(err.bannedReason ? { bannedReason: err.bannedReason } : {}),
    });
  }
}

async function handleGuestLogin(req, res) {
  try {
    const deviceId = req.body?.deviceId ? String(req.body.deviceId) : "";
    const email = guestEmailForDevice(req.body?.deviceId);
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: "Guest",
        email,
        isGuest: true,
        guestDeviceId: deviceId || undefined,
        emailVerified: false,
        active: true,
        subscription: {
          plan: "guest",
          status: "inactive",
          provider: "none",
          manualGrant: false,
        },
      });
      authDebug("guest:created", {
        userId: user._id,
        email: user.email,
        deviceId,
        isGuest: user.isGuest === true,
      });
    } else {
      authDebug("guest:reused", {
        userId: user._id,
        email: user.email,
        deviceId,
        isGuest: user.isGuest === true,
      });
    }
    if (user.active === false) {
      return res.status(403).json({ error: "Your account is deactivated. Please contact support." });
    }
    if (user.isBanned) {
      return res.status(403).json({
        error: "Your account is banned. Please contact support.",
        bannedReason: user.bannedReason || "",
      });
    }
    res.json(makeAuthPayload(user, "Guest session created"));
  } catch (err) {
    console.error("guest login error:", err);
    res.status(500).json({ error: "Guest login failed" });
  }
}

async function handleUpgradeGuest(req, res) {
  try {
    const authUser = req.authUser;
    if (!authUser?._id) return res.status(401).json({ error: "Unauthorized" });

    const { name, email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!name) return res.status(400).json({ error: NAME_REQUIRED });
    if (!normalizedEmail) return res.status(400).json({ error: EMAIL_REQUIRED });
    if (!isValidEmail(normalizedEmail)) return res.status(400).json({ error: "Invalid email format" });
    if (!password) return res.status(400).json({ error: PASSWORD_REQUIRED });
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const user = await User.findById(authUser._id);
    if (!user) return res.status(404).json({ error: USER_NOT_FOUND });
    if (user.active === false) {
      return res.status(403).json({ error: "Your account is deactivated. Please contact support." });
    }
    if (user.isBanned) {
      return res.status(403).json({
        error: "Your account is banned. Please contact support.",
        bannedReason: user.bannedReason || "",
      });
    }
    const currentEmail = String(user.email || "").toLowerCase();
    const isGuestAccount = user.isGuest === true || /^guest_[^@]+@(?:hypervpn|bizideasai)\.guest$/i.test(currentEmail);
    const isPendingUpgrade = user.emailVerified === false && !isGuestAccount;
    if (!isGuestAccount && !isPendingUpgrade) {
      return res.status(400).json({ error: "This account is already registered." });
    }

    const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
    if (existing) return res.status(409).json({ error: "User already exists" });

    const previous = {
      name: user.name,
      email: user.email,
      password: user.password,
      emailVerified: user.emailVerified,
      otp: user.otp,
      isGuest: user.isGuest,
    };
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    authDebug("guest-upgrade:start", {
      userId: user._id,
      oldEmail: user.email,
      newEmail: normalizedEmail,
      name: String(name).trim(),
      otp,
      isGuest: user.isGuest === true,
    });
    user.name = String(name).trim();
    user.email = normalizedEmail;
    user.password = await bcrypt.hash(password, 10);
    user.emailVerified = false;
    user.otp = otp;
    user.isGuest = true;
    await user.save();
    authDebug("guest-upgrade:user-updated", {
      userId: user._id,
      email: user.email,
      otp,
      isGuest: user.isGuest === true,
    });

    try {
      await sendOTPEmail(normalizedEmail, otp);
      authDebug("guest-upgrade:otp-sent", {
        userId: user._id,
        email: normalizedEmail,
        otp,
      });
    } catch (mailErr) {
      console.error("upgrade guest OTP email error:", mailErr);
      authDebug("guest-upgrade:otp-send-failed", {
        userId: user._id,
        email: normalizedEmail,
        otp,
        error: mailErr?.message || String(mailErr),
      });
      user.name = previous.name;
      user.email = previous.email;
      user.password = previous.password;
      user.emailVerified = previous.emailVerified;
      user.otp = previous.otp;
      user.isGuest = previous.isGuest;
      await user.save();
      return res.status(500).json({ error: OTP_SEND_FAILED });
    }

    res.json({
      message: "OTP sent to email. Verify to finish account setup.",
      userId: user._id,
      isGuest: true,
    });
  } catch (err) {
    console.error("upgrade guest error:", err);
    res.status(500).json({ error: NETWORK_ERROR });
  }
}
async function handleGetProfile(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const user = await User.findById(id).select(
      "-otp -resetOTP -password -emailVerified"
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    const o = user.toObject();
    o.fullName = o.name;
    o.subscription = subscriptionForUser(user);
    const generationLimit = generationLimitForUser(user);
    const used = await PromptGeneration.countDocuments({ userId: user._id });
    o.limit = generationLimit.limit;
    o.generationLimit = {
      ...generationLimit,
      used: generationLimit.limit == null ? null : used,
      remaining:
        generationLimit.limit == null
          ? null
          : Math.max(generationLimit.limit - used, 0),
    };
    o.vpnQuota = vpnQuotaForUser(user);
    res.json(o);
  } catch (err) {
    console.error("getProfile error:", err);
    res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleUpdateProfile(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.file && user.isGuest === true) {
      deleteLocalProfileImage(`/uploads/profile/${req.file.filename}`);
      return res.status(403).json({
        message:
          "Guest accounts cannot upload profile images. Create an account first.",
        code: "GUEST_PROFILE_IMAGE_NOT_ALLOWED",
      });
    }

    if (req.body.newPassword && !req.body.oldPassword) {
      return res.status(400).json({ message: "Old password required" });
    }

    if (req.body.oldPassword && req.body.newPassword) {
      const ok = await bcrypt.compare(req.body.oldPassword, user.password || "");
      if (!ok) {
        return res.status(400).json({ message: "Old password is incorrect" });
      }
    }

    const updates = {};
    const displayName = req.body.fullName ?? req.body.name;
    if (displayName) updates.name = displayName;
    if (req.body.newPassword) {
      updates.password = await bcrypt.hash(req.body.newPassword, 10);
    }
    const previousImage = user.image;
    if (req.file) {
      updates.image = `/uploads/profile/${req.file.filename}`;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No data to update" });
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedUser) {
      if (req.file) deleteLocalProfileImage(`/uploads/profile/${req.file.filename}`);
      return res.status(404).json({ message: "User not found" });
    }

    if (req.file && previousImage && previousImage !== updates.image) {
      deleteLocalProfileImage(previousImage);
    }
    res.json("Your Information Updated");
  } catch (err) {
    if (req.file) {
      deleteLocalProfileImage(`/uploads/profile/${req.file.filename}`);
    }
    console.error("updateProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function handleDeleteAccount(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (req.authUser?._id?.toString() !== id) {
      return res.status(403).json({ message: "You can only delete your own account." });
    }

    const user = await User.findById(id).select("+appleRefreshToken");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Apple requires the Sign in with Apple grant to be revoked on deletion.
    // A failure is logged but must not stop the user from deleting the account.
    if (user.appleId) {
      await revokeAppleToken(user.appleRefreshToken);
    }

    await Promise.all([
      PromptGeneration.deleteMany({ userId: user._id }),
      SavedIdea.deleteMany({ userId: user._id }),
    ]);

    const oldImage = user.image;
    await User.deleteOne({ _id: user._id });
    deleteLocalProfileImage(oldImage);

    return res.json({ message: "Account deleted successfully." });
  } catch (err) {
    console.error("deleteAccount error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

async function handleForgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOTP = otp;
    await user.save();
    authDebug("forgot-password:otp-created", {
      userId: user._id,
      email: user.email,
      otp,
    });

    await sendEmail(email, "Reset Password OTP", `Your OTP is ${otp}`);
    authDebug("forgot-password:otp-sent", {
      userId: user._id,
      email: user.email,
      otp,
    });
    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("forgotPassword error:", err);
    res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleResetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (!isValidOTP(String(otp).trim())) {
      return res.status(400).json({ error: "Invalid OTP format" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email, resetOTP: String(otp).trim() });
    if (!user) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOTP = null;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("resetPassword error:", err);
    res.status(500).json({ error: NETWORK_ERROR });
  }
}

module.exports = {
  handleUserSignUp,
  handleUserLogin,
  handleGuestLogin,
  handleUpgradeGuest,
  handleVerifyOTP,
  handleGoogleLogin,
  handleAppleLogin,
  handleGetProfile,
  handleUpdateProfile,
  handleDeleteAccount,
  handleForgotPassword,
  handleResetPassword,
};
