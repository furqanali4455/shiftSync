import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Location from "@/models/Location";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const locations = await Location.find().limit(200);
    return NextResponse.json(locations);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

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
