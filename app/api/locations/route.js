import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Location from "@/models/Location";
import { requireRole } from "@/lib/auth";
import { loadActor, managerLocationObjectIds } from "@/lib/actor";

export async function GET(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const q = {};
    if (actor.role === "Manager") {
      const lids = managerLocationObjectIds(actor);
      if (!lids?.length) {
        return NextResponse.json([]);
      }
      q._id = { $in: lids };
    }
    const locations = await Location.find(q).limit(200);
    return NextResponse.json(locations);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const data = await request.json();

    if (!data.name || !data.timezone) {
      return NextResponse.json({ error: "Name and timezone are required." }, { status: 400 });
    }

    await connectDB();
    const location = new Location(data);
    await location.save();
    return NextResponse.json(location, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
