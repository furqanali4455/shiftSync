import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["Admin", "Manager", "Staff"], default: "Staff" },
  skills: [String],
  locations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Location" }],
  timezone: { type: String, default: "UTC" },
});

UserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
