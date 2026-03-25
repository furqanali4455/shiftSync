import mongoose from "mongoose";

const RecurringSlotSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startMinute: { type: Number, min: 0, max: 1440, required: true },
    endMinute: { type: Number, min: 0, max: 1440, required: true },
  },
  { _id: false },
);

const AvailabilityExceptionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    unavailableAllDay: { type: Boolean, default: false },
    startMinute: { type: Number, min: 0, max: 1440, default: null },
    endMinute: { type: Number, min: 0, max: 1440, default: null },
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["Admin", "Manager", "Staff"], default: "Staff" },
  skills: [String],
  locations: [{ type: mongoose.Schema.Types.ObjectId, ref: "Location" }],
  timezone: { type: String, default: "America/New_York" },
  desiredHoursPerWeek: { type: Number, default: null, min: 0, max: 80 },
  recurringAvailability: { type: [RecurringSlotSchema], default: [] },
  availabilityExceptions: { type: [AvailabilityExceptionSchema], default: [] },
  notificationPreferences: {
    inApp: { type: Boolean, default: true },
    emailSimulation: { type: Boolean, default: false },
  },
});

UserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
