import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import AuditLog from "@/models/AuditLog";
import { requireRole } from "@/lib/auth";
import { loadActor, actorCanAccessLocation } from "@/lib/actor";

export async function GET(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const { id } = await params;
    await connectDB();
    const shift = await Shift.findById(id).lean();
    if (!shift) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!actorCanAccessLocation(actor, shift.location)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const logs = await AuditLog.find({ entityType: "Shift", entityId: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("actor", "name email role")
      .lean();

    return NextResponse.json(logs);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
