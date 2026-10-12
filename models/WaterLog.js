import mongoose from 'mongoose';

const waterLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amountMl: {
    type: Number,
    required: true,
    min: 0
  },
  rawText: String,
  organizedSummary: String,
  parsedDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export default mongoose.model('WaterLog', waterLogSchema);
