const mongoose = require("mongoose");

async function MongoDBConnect(url) {
  const dbName = process.env.MONGODB_DB_NAME || "hyper_vpn";
  try {
    await mongoose.connect(url, { dbName });
    console.log(`MongoDB connected (database: ${dbName}).`);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

module.exports = MongoDBConnect;
