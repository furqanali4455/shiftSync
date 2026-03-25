import mongoose from "mongoose";

const SwapRequestSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["swap", "drop"], required: true },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", required: true, index: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      enum: [
        "pending_target",
        "open_pickup",
        "pending_manager",
        "approved",
        "rejected",
        "cancelled",
        "expired",
      ],
      default: "pending_target",
    },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SwapRequestSchema.index({ requester: 1, status: 1 });
SwapRequestSchema.index({ shift: 1, status: 1 });

export default mongoose.models.SwapRequest ||
  mongoose.model("SwapRequest", SwapRequestSchema);
