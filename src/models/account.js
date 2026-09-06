import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
  accountNumber: { type: String, required: true, unique: true },
  accountName: { type: String, required: true },
  // Store money as whole kobo to avoid decimal rounding errors. 100 kobo = 1 naira.
  balanceKobo: { type: Number, default: 1500000, min: 0, validate: Number.isSafeInteger },
  currency: { type: String, default: 'NGN', enum: ['NGN'] },
  // These accounts are local simulations, not accounts registered with NibssByPhoenix.
  mode: { type: String, default: 'local-test', enum: ['local-test'] },
}, { timestamps: true });

export const Account = mongoose.model('Account', accountSchema);
