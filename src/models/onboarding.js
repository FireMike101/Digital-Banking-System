import mongoose from "mongoose";

const onboardingSchema = new mongoose.Schema(
  {
    // One onboarding record per customer prevents two requests creating identities at once.
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      unique: true,
    },
    type: { type: String, enum: ["BVN", "NIN"], required: true },
    testId: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "created", "verified"],
      default: "pending",
    },
  },
  { timestamps: true },
);

export const Onboarding = mongoose.model("Onboarding", onboardingSchema);
