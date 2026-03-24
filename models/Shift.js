import mongoose from "mongoose";

const ShiftSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    date: { type: Date, required: true },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    requiredSkill: { type: String, required: true },
    status: { type: String, enum: ["Draft", "Published"], default: "Draft" },
  },
  { timestamps: true },
);

export default mongoose.models.Shift || mongoose.model("Shift", ShiftSchema);
