import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  timezone: { type: String, required: true },
  address: String,
});

export default mongoose.models.Location ||
  mongoose.model("Location", LocationSchema);
