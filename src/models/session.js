import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  // MongoDB removes expired records eventually; authentication also checks expiry immediately.
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

export const Session = mongoose.model('Session', sessionSchema);
