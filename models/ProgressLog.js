import mongoose from 'mongoose';

const progressLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  weight: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  notes: String
}, {
  timestamps: true
});

// Index for efficient queries
progressLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('ProgressLog', progressLogSchema);
