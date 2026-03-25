import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Notification from "@/models/Notification";
import { loadActor } from "@/lib/actor";

export async function GET(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "1";
    const q = { user: actor._id };
    if (unreadOnly) q.read = false;
    const items = await Notification.find(q).sort({ createdAt: -1 }).limit(100).lean();
    const unread = await Notification.countDocuments({ user: actor._id, read: false });
    return NextResponse.json({ items, unreadCount: unread });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const actor = await loadActor(request);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    await connectDB();
    if (body.markAllRead) {
      await Notification.updateMany({ user: actor._id, read: false }, { $set: { read: true } });
      return NextResponse.json({ ok: true });
    }
    if (body.ids?.length) {
      await Notification.updateMany(
        { _id: { $in: body.ids }, user: actor._id },
        { $set: { read: true } },
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
