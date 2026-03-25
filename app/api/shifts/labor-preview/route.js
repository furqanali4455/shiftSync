import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { evaluateLaborForAssignment } from "@/lib/laborCompliance";

export async function POST(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const body = await request.json();
    const { userId, startTime, endTime, shiftId } = body || {};

    if (!userId || !startTime || !endTime) {
      return NextResponse.json(
        { error: "userId, startTime, and endTime are required." },
        { status: 400 },
      );
    }

    await connectDB();
    const result = await evaluateLaborForAssignment(userId, startTime, endTime, {
      excludeShiftId: shiftId || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
