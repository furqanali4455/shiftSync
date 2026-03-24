import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import { checkConflicts } from "@/lib/conflicts";
import { requireRole } from "@/lib/auth";

export async function DELETE(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

    const { id } = await params;
    await connectDB();
    const deleted = await Shift.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    return NextResponse.json({ message: "Shift deleted" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

    const { id } = await params;
    const data = await request.json();
    await connectDB();

    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid start or end time provided." }, { status: 400 });
    }

    if (start >= end) {
      return NextResponse.json({ error: "End time must be after the start time." }, { status: 400 });
    }

    if (data.user) {
      const conflictResult = await checkConflicts(
        data.user,
        data.startTime,
        data.endTime,
        data.location,
        data.requiredSkill,
        id,
      );
      if (conflictResult.hasConflict) {
        return NextResponse.json({ error: conflictResult.message }, { status: 400 });
      }
    }

    const shift = await Shift.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    return NextResponse.json(shift);
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors)
        .map((e) => e.message)
        .join(", ");
      return NextResponse.json({ error: messages }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
