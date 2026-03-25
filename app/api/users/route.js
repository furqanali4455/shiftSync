import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { loadActor, managerLocationObjectIds } from "@/lib/actor";

export async function GET(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page"));
    const limit = Math.min(parseInt(searchParams.get("limit")) || 50, 200);

    const baseFilter = {};
    if (actor.role === "Staff") {
      baseFilter._id = actor._id;
    } else if (actor.role === "Manager") {
      const lids = managerLocationObjectIds(actor);
      if (!lids?.length) {
        return NextResponse.json([]);
      }
      baseFilter.locations = { $in: lids };
    }

    if (page) {
      const skip = (page - 1) * limit;
      const [users, total] = await Promise.all([
        User.find(baseFilter).select("-password").populate("locations").skip(skip).limit(limit),
        User.countDocuments(baseFilter),
      ]);
      return NextResponse.json({ data: users, total, page, limit });
    }

    const users = await User.find(baseFilter).select("-password").populate("locations").limit(limit);
    return NextResponse.json(users);
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

    const actor = await loadActor(request);
    const data = await request.json();
    if (!data.name || !data.email || !data.password) {
      return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
    }

    if (actor.role === "Manager") {
      const mLocs = new Set(managerLocationObjectIds(actor).map((x) => x.toString()));
      for (const loc of data.locations || []) {
        if (!mLocs.has(String(loc))) {
          return NextResponse.json(
            { error: "You can only assign users to your managed locations." },
            { status: 403 },
          );
        }
      }
      if (data.role === "Admin") {
        return NextResponse.json({ error: "Managers cannot create admins." }, { status: 403 });
      }
    }

    await connectDB();

    data.email = data.email.toLowerCase();
    data.password = await bcrypt.hash(data.password, 12);

    const user = new User(data);
    await user.save();
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
