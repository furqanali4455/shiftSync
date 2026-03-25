import SwapRequest from "@/models/SwapRequest";
import { notifyMany } from "@/lib/notify";

export async function cancelPendingSwapsForShift(shiftId, title) {
  const list = await SwapRequest.find({
    shift: shiftId,
    status: { $in: ["pending_target", "open_pickup", "pending_manager"] },
  }).lean();

  if (list.length === 0) return;

  await SwapRequest.updateMany(
    {
      shift: shiftId,
      status: { $in: ["pending_target", "open_pickup", "pending_manager"] },
    },
    { $set: { status: "cancelled" } },
  );

  const notifyIds = new Set();
  for (const r of list) {
    notifyIds.add(r.requester.toString());
    if (r.targetUser) notifyIds.add(r.targetUser.toString());
    if (r.claimedBy) notifyIds.add(r.claimedBy.toString());
  }
  await notifyMany([...notifyIds], {
    type: "swap_cancelled",
    title: "Swap / coverage request cancelled",
    body: `The shift "${title || "shift"}" was edited and pending requests were cleared.`,
    meta: { shiftId: shiftId.toString() },
  });
}
