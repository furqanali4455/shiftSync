import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Shift from "@/models/Shift";
import Location from "@/models/Location";
import User from "@/models/User";
import bcrypt from "bcryptjs";

function setTime(baseDate, hours, minutes, addDays = 0) {
  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  if (addDays) d.setDate(d.getDate() + addDays);
  return d;
}

export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Seed endpoint is disabled in production." }, { status: 403 });
    }

    await connectDB();

    await Shift.deleteMany({});
    await Location.deleteMany({});
    await User.deleteMany({});

    const loc1 = await Location.create({ name: "Downtown Office", timezone: "America/New_York", address: "123 Main St, New York, NY" });
    const loc2 = await Location.create({ name: "Uptown Cafe", timezone: "America/Chicago", address: "456 High St, Chicago, IL" });
    const loc3 = await Location.create({ name: "Westside Lounge", timezone: "America/Los_Angeles", address: "789 Sunset Blvd, Los Angeles, CA" });

    const hashedAdmin = await bcrypt.hash("admin123!", 12);
    const hashedStaff = await bcrypt.hash("password123", 12);

    const admin = await User.create({
      name: "Sarah Admin",
      email: "admin@shiftsync.com",
      password: hashedAdmin,
      role: "Admin",
      skills: ["Management", "Service"],
      locations: [loc1._id, loc2._id, loc3._id],
    });

    const manager = await User.create({
      name: "Alice Manager",
      email: "alice@shiftsync.com",
      password: hashedStaff,
      role: "Manager",
      skills: ["Management", "Bartending"],
      locations: [loc1._id, loc2._id],
    });

    const bob = await User.create({
      name: "Bob Wilson",
      email: "bob@shiftsync.com",
      password: hashedStaff,
      role: "Staff",
      skills: ["Service", "Bartending"],
      locations: [loc1._id],
    });

    const carol = await User.create({
      name: "Carol Davis",
      email: "carol@shiftsync.com",
      password: hashedStaff,
      role: "Staff",
      skills: ["Cooking", "Service"],
      locations: [loc2._id, loc3._id],
    });

    const david = await User.create({
      name: "David Chen",
      email: "david@shiftsync.com",
      password: hashedStaff,
      role: "Staff",
      skills: ["Security", "Reception"],
      locations: [loc1._id, loc3._id],
    });

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);

    const day3 = new Date(today);
    day3.setDate(today.getDate() + 3);

    await Shift.insertMany([
      { title: "Morning Opening", date: tomorrow, location: loc1._id, user: bob._id, startTime: setTime(tomorrow, 8, 0), endTime: setTime(tomorrow, 16, 0), requiredSkill: "Service", status: "Published" },
      { title: "Kitchen Shift", date: dayAfter, location: loc2._id, user: carol._id, startTime: setTime(dayAfter, 10, 0), endTime: setTime(dayAfter, 18, 0), requiredSkill: "Cooking", status: "Published" },
      { title: "Night Security", date: dayAfter, location: loc3._id, user: david._id, startTime: setTime(dayAfter, 22, 0), endTime: setTime(day3, 6, 0), requiredSkill: "Security", status: "Published" },
      { title: "Lunch Service", date: day3, location: loc2._id, user: carol._id, startTime: setTime(day3, 11, 0), endTime: setTime(day3, 15, 0), requiredSkill: "Service", status: "Draft" },
      { title: "Management Oversight", date: tomorrow, location: loc1._id, user: manager._id, startTime: setTime(tomorrow, 9, 0), endTime: setTime(tomorrow, 17, 0), requiredSkill: "Management", status: "Published" },
      { title: "Evening Bar", date: day3, location: loc1._id, user: bob._id, startTime: setTime(day3, 18, 0), endTime: setTime(day3, 23, 30), requiredSkill: "Bartending", status: "Published" },
    ]);

    return NextResponse.json({ message: "Database seeded with demo data (6 shifts, 5 users, 3 locations)" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
