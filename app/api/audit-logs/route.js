import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import AuditLog from "@/models/AuditLog";
import { requireRole } from "@/lib/auth";
import { loadActor, actorCanAccessLocation } from "@/lib/actor";

export async function GET(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") ? new Date(searchParams.get("from")) : null;
    const to = searchParams.get("to") ? new Date(searchParams.get("to")) : null;
    const locationId = searchParams.get("locationId");
    const format = searchParams.get("format");

    await connectDB();

    const q = {};
    if (from && !Number.isNaN(from.getTime())) q.createdAt = { $gte: from };
    if (to && !Number.isNaN(to.getTime())) {
      q.createdAt = { ...q.createdAt, $lte: to };
    }
    if (locationId) {
      q.location = locationId;
      if (actor.role === "Manager" && !actorCanAccessLocation(actor, locationId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (actor.role === "Manager") {
      const lids = (actor.locations || []).map((l) => l._id || l);
      q.location = { $in: lids };
    }

    const rows = await AuditLog.find(q)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("actor", "name email role")
      .populate("location", "name")
      .lean();

    if (format === "csv" && actor.role === "Admin") {
      const header = "createdAt,actor,action,entityType,entityId,locationId\n";
      const lines = rows.map((r) => {
        const ts = r.createdAt?.toISOString() || "";
        const actorEmail = r.actor?.email || r.actor;
        const loc = r.location?._id || r.location || "";
        return `${ts},${actorEmail},${r.action},${r.entityType},${r.entityId},${loc}`;
      });
      return new Response(header + lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="audit-export.csv"',
        },
      });
    }

    if (format === "csv" && actor.role !== "Admin") {
      return NextResponse.json({ error: "CSV export is admin-only." }, { status: 403 });
    }

    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
