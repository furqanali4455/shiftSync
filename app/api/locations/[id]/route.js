import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Location from "@/models/Location";
import Shift from "@/models/Shift";
import { requireRole } from "@/lib/auth";

export async function DELETE(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

    const { id } = await params;
    await connectDB();
    const shiftCount = await Shift.countDocuments({ location: id });
    if (shiftCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${shiftCount} shift(s) are assigned to this location. Remove them first.` },
        { status: 400 },
      );
    }
    const deleted = await Location.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    return NextResponse.json({ message: "Location deleted successfully" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

    const { id } = await params;
    const data = await request.json();
    await connectDB();
    const location = await Location.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    return NextResponse.json(location);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
