import connectDB from "@/lib/db";
import User from "@/models/User";

export async function loadActor(request) {
  const id = request.headers.get("x-user-id");
  const role = request.headers.get("x-user-role");
  if (!id || !role) return null;
  await connectDB();
  const user = await User.findById(id)
    .select("locations role name email")
    .populate("locations")
    .lean();
  if (!user) return null;
  return { ...user, role: user.role };
}

export function managerLocationObjectIds(actor) {
  if (!actor || actor.role !== "Manager") return null;
  return (actor.locations || []).map((l) => l._id || l);
}

export function actorCanAccessLocation(actor, locationId) {
  if (!actor || !locationId) return false;
  if (actor.role === "Admin") return true;
  const lid = locationId.toString();
  return (actor.locations || []).some((l) => (l._id || l).toString() === lid);
}

export function actorCanManageUser(actor, targetUser) {
  if (!actor || !targetUser) return false;
  if (actor.role === "Admin") return true;
  if (actor.role !== "Manager") return false;
  const mLocs = managerLocationObjectIds(actor);
  if (!mLocs || mLocs.length === 0) return false;
  const theirs = (targetUser.locations || []).map((l) => (l._id || l).toString());
  return mLocs.some((ml) => theirs.includes(ml.toString()));
}
