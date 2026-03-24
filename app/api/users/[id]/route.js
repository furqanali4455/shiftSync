import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Shift from "@/models/Shift";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";

export async function DELETE(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

    const { id } = await params;
    await connectDB();
    await Shift.updateMany({ user: id }, { $set: { user: null } });
    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ message: "User deleted successfully" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const roleCheck = requireRole(request, "Admin", "Manager");
    if (roleCheck) return NextResponse.json({ error: roleCheck.error }, { status: roleCheck.status });

    const { id } = await params;
    const data = await request.json();
    await connectDB();

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

    const user = await User.findByIdAndUpdate(id, data, { new: true, runValidators: true }).select("-password");
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch (err) {
    if (err.code === 11000) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
