import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import Location from "@/models/Location";
import User from "@/models/User";
import { checkConflicts } from "@/lib/conflicts";
import { requireRole } from "@/lib/auth";

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page"));
    const limit = Math.min(parseInt(searchParams.get("limit")) || 50, 200);

    if (page) {
      const skip = (page - 1) * limit;
      const [shifts, total] = await Promise.all([
        Shift.find().populate("user").populate("location").sort({ startTime: 1 }).skip(skip).limit(limit),
        Shift.countDocuments(),
      ]);
      return NextResponse.json({ data: shifts, total, page, limit });
    }

    const shifts = await Shift.find()
      .populate("user")
      .populate("location")
      .sort({ startTime: 1 })
      .limit(limit);
    return NextResponse.json(shifts);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

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
      );
      if (conflictResult.hasConflict) {
        return NextResponse.json({ error: conflictResult.message }, { status: 400 });
      }
    }

    const shift = new Shift(data);
    await shift.save();
    return NextResponse.json(shift, { status: 201 });
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
