import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  // Never select the password hash unless login explicitly asks for it.
  passwordHash: { type: String, required: true, select: false },
  onboardingStatus: { type: String, enum: ['unverified', 'verified'], default: 'unverified' },
}, { timestamps: true });

export const Customer = mongoose.model('Customer', customerSchema);
