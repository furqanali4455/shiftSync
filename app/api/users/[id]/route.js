import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Shift from "@/models/Shift";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { loadActor, actorCanManageUser } from "@/lib/actor";
import { getAssigneeIdsFromShiftDoc } from "@/lib/shiftPayload";
import { notifyMany } from "@/lib/notify";

const STAFF_SELF_KEYS = new Set([
  "recurringAvailability",
  "availabilityExceptions",
  "desiredHoursPerWeek",
  "notificationPreferences",
  "timezone",
]);

export async function DELETE(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) {
      return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
    }

    const actor = await loadActor(request);
    const { id } = await params;
    await connectDB();

    const target = await User.findById(id);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (actor.role === "Manager" && !actorCanManageUser(actor, target)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const shifts = await Shift.find({
      $or: [{ user: id }, { assignedUsers: id }],
    });
    for (const sh of shifts) {
      const next = getAssigneeIdsFromShiftDoc(sh.toObject()).filter((x) => x !== id.toString());
      sh.assignedUsers = next;
      sh.user = next[0] || null;
      await sh.save();
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "User deleted successfully" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const staffSelf = actor.role === "Staff" && actor._id.toString() === id;
    if (!staffSelf) {
      const roleCheck = requireRole(request, "Admin", "Manager");
      if (roleCheck) {
        return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });
      }
    }
    let data = await request.json();
    await connectDB();

    const target = await User.findById(id);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (actor.role === "Staff") {
      if (actor._id.toString() !== id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const filtered = {};
      for (const k of Object.keys(data)) {
        if (STAFF_SELF_KEYS.has(k)) filtered[k] = data[k];
      }
      data = filtered;
    } else if (actor.role === "Manager") {
      if (!actorCanManageUser(actor, target)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (data.role === "Admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (data.password) {
      if (data.password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
      }
      data.password = await bcrypt.hash(data.password, 12);
    } else {
      delete data.password;
    }

    if (data.email) {
      data.email = data.email.toLowerCase();
    }

    const prevAvail = JSON.stringify(target.recurringAvailability || []);
    const user = await User.findByIdAndUpdate(id, data, { new: true, runValidators: true }).select(
      "-password",
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (JSON.stringify(user.recurringAvailability || []) !== prevAvail) {
      const managers = await User.find({
        $or: [{ role: "Admin" }, { role: "Manager" }],
      })
        .select("_id")
        .lean();
      await notifyMany(
        managers.map((m) => m._id.toString()),
        {
          type: "availability_changed",
          title: "Availability updated",
          body: `${user.name} updated their availability.`,
          meta: { userId: user._id.toString() },
        },
      );
    }

    return NextResponse.json(user);
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
