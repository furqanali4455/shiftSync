import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import { loadActor, actorCanAccessLocation, managerLocationObjectIds } from "@/lib/actor";

export async function GET(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const now = new Date();

    if (actor.role === "Staff") {
      const rows = await Shift.find({
        startTime: { $lte: now },
        endTime: { $gte: now },
        $or: [{ user: actor._id }, { assignedUsers: actor._id }],
      })
        .populate("location", "name timezone")
        .populate("user", "name")
        .populate("assignedUsers", "name")
        .sort({ startTime: 1 })
        .limit(100)
        .lean();
      return NextResponse.json(rows);
    }

    const q = {
      startTime: { $lte: now },
      endTime: { $gte: now },
      $or: [{ user: { $ne: null } }, { "assignedUsers.0": { $exists: true } }],
    };

    if (actor.role === "Manager") {
      const lids = managerLocationObjectIds(actor);
      if (!lids?.length) {
        return NextResponse.json([]);
      }
      q.location = { $in: lids };
    }

    const rows = await Shift.find(q)
      .populate("location", "name timezone")
      .populate("user", "name")
      .populate("assignedUsers", "name")
      .sort({ startTime: 1 })
      .limit(200)
      .lean();

    if (actor.role === "Admin") {
      return NextResponse.json(rows);
    }

    const out = rows.filter((sh) =>
      actorCanAccessLocation(actor, sh.location?._id || sh.location),
    );
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
