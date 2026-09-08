import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  reference: { type: String, required: true, unique: true },
  providerReference: { type: String, unique: true, sparse: true },
  sourceAccount: { type: String, required: true },
  recipientAccount: { type: String, required: true },
  recipientName: { type: String, required: true },
  recipientBankCode: { type: String, required: true },
  transferType: { type: String, enum: ['intra-bank', 'inter-bank'], required: true },
  amountKobo: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  narration: { type: String, default: '', maxlength: 100 },
  status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
}, { timestamps: true });

export const Transaction = mongoose.model('Transaction', transactionSchema);
