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
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedUsers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    requiredHeadcount: { type: Number, default: 1, min: 1, max: 20 },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    requiredSkill: { type: String, required: true },
    status: { type: String, enum: ["Draft", "Published"], default: "Draft" },
    laborOverrideReason: { type: String, default: null },
    schemaVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ShiftSchema.pre("validate", function syncAssignees(next) {
  let ids = (this.assignedUsers || []).filter(Boolean).map((id) => id.toString());
  if (ids.length === 0 && this.user) {
    ids = [this.user.toString()];
  }
  const seen = new Set();
  this.assignedUsers = ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((id) => new mongoose.Types.ObjectId(id));
  this.user = this.assignedUsers[0] || null;
  const cap = Math.min(Math.max(this.requiredHeadcount || 1, 1), 20);
  this.requiredHeadcount = cap;
  if (this.assignedUsers.length > cap) {
    this.invalidate("assignedUsers", `At most ${cap} assignee(s) allowed for this headcount.`);
  }
  next();
});

ShiftSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    if ((!ret.assignedUsers || ret.assignedUsers.length === 0) && ret.user) {
      ret.assignedUsers = [ret.user];
    }
    return ret;
  },
});

export default mongoose.models.Shift || mongoose.model("Shift", ShiftSchema);
