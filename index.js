require("dotenv").config();

const express = require("express");
const cors = require("cors");
const MongoDBConnect = require("./connection/connection");
const ensureBody = require("./middlewares/parseRequest");
const userAuthRouter = require("./routes/userAuthRoutes");
const adminRouter = require("./routes/adminRoutes");
const adminAuthRouter = require("./routes/adminAuthRoutes");
const notificationRouter = require("./routes/notificationRoutes");
const appPromoRouter = require("./routes/appPromoRoutes");
const adminPromoRouter = require("./routes/adminPromoRoutes");
const faqRouter = require("./routes/faqRoutes");
const knowledgeRouter = require("./routes/knowledgeRoutes");
const vpnRouter = require("./routes/vpnRoutes");
const appleNotificationRouter = require("./routes/appleNotificationRoutes");
const vpnAdminBridgeRouter = require("./routes/vpnAdminBridgeRoutes");
const { ensureFirebaseAdmin } = require("./utils/firebaseAdminInit");

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("Missing MONGODB_URI. Create a .env file (see .env.example).");
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT) || 8000;
const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://vpnadminpanel.oxmite.com/",
  "https://hypervpn.oxmite.com",
  "https://hyper-vpn-admin.oxmite.com",
  "https://vpnsbackend.oxmite.com",
  "https://vpnsadmin.oxmite.com",
  "https://adminofallapss.oxmite.com",
  "https://allappsadminreact.oxmite.com",
  "https://wasif-ali47.github.io",
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : defaultAllowedOrigins;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`[cors] blocked origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "X-Service-Key",
    "X-Knowledge-Key",
  ],
  optionsSuccessStatus: 204,
};

app.use("/uploads", express.static("uploads"));
app.use(
  cors(corsOptions)
);
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(ensureBody);

app.use((req, res, next) => {
  if (req.path.startsWith("/api/knowledge")) {
    const startedAt = Date.now();
    const body = req.body && typeof req.body === "object"
      ? req.body
      : {};
    console.log("[knowledge:request]", {
      method: req.method,
      url: req.originalUrl,
      origin: req.headers.origin || "n/a",
      contentType: req.headers["content-type"] || "n/a",
      hasServiceKey: Boolean(req.get("X-Service-Key")),
      hasKnowledgeKey: Boolean(req.get("X-Knowledge-Key")),
      hasAuthorization: Boolean(req.get("Authorization")),
      bodyKeys: Object.keys(body),
      bulkCount: Array.isArray(body.entries)
        ? body.entries.length
        : 0,
      contentLength:
        typeof body.content === "string"
          ? body.content.length
          : 0,
    });
    res.on("finish", () => {
      console.log("[knowledge:response]", {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        authMethod: req.knowledgeAuthMethod || "none",
        durationMs: Date.now() - startedAt,
      });
    });
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.includes("/api/admin/auth/login")) {
    console.log(
      `[admin-login:request] ${req.method} ${req.originalUrl} origin=${req.headers.origin || "n/a"} contentType=${req.headers["content-type"] || "n/a"}`
    );
  }
  next();
});

app.get("/", (req, res) => {
  res.json({
    service: "Secure VPN API",
    endpoints: {
      vpn: {
        config: "GET /api/vpn/config",
        servers: "GET /api/vpn/servers",
        optimalServer: "GET /api/vpn/servers/optimal",
        plans: "GET /api/vpn/plans",
        connect: "POST /api/vpn/connect",
        disconnect: "POST /api/vpn/disconnect",
        session: "GET /api/vpn/sessions/:sessionId",
      },
      notifications: {
        registerToken:
          "POST /api/notifications/register-token (token required; userId optional string or Mongo id; JWT optional)",
        send: "POST /api/notifications/send",
      },
      promos: {
        list: "GET /api/app-promos",
        getOne: "GET /api/app-promos/:id",
      },
      admin: {
        login: "POST /api/admin/auth/login",
        users: "GET /api/admin/users",
        usage: "GET /api/admin/usage",
        banUser: "PATCH /api/admin/users/:id/ban",
        broadcastNotification: "POST /api/admin/notifications/broadcast",
        createPromo: "POST /api/admin/app-promos",
        updatePromo: "PUT/PATCH /api/admin/app-promos/:id",
        deletePromo: "DELETE /api/admin/app-promos/:id",
      },
    },
  });
});

function disabledLegacyProductRoute(req, res) {
  return res.status(410).json({
    success: false,
    message:
      "This legacy product endpoint is disabled in Secure VPN. Use /api/vpn instead.",
  });
}

app.use("/auth", userAuthRouter);
app.use("/api/vpn", vpnRouter);
app.use("/api/apple/notifications", appleNotificationRouter);
app.use("/api/vpn-admin", vpnAdminBridgeRouter);
app.use("/api/prompts", disabledLegacyProductRoute);
app.use("/api/saved-ideas", disabledLegacyProductRoute);
app.use("/api/notifications", notificationRouter);
app.use("/api/app-promos", appPromoRouter);
app.use("/api/faq", faqRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/app-promos", adminPromoRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error, req, res, next) => {
  console.error(`[express-error] ${req.method} ${req.originalUrl}:`, error.message);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ error: "Internal server error" });
});

MongoDBConnect(mongoUri)
  .then(() => {
    console.log(`[cors] allowed origins: ${allowedOrigins.join(", ")}`);
    const firebaseAdmin = ensureFirebaseAdmin();
    console.log(
      `[firebase] Push notifications: ${firebaseAdmin ? "ready" : "not configured (set FIREBASE_SERVICE_ACCOUNT or firebase-service-account.json)"}`
    );
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  })
  .catch(() => process.exit(1));

process.on("uncaughtException", (error) => {
  console.error("[process] uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});
