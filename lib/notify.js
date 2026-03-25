import Notification from "@/models/Notification";
import User from "@/models/User";

export async function createNotification(userId, { type, title, body = "", meta = {} }) {
  if (!userId) return null;
  const u = await User.findById(userId).select("notificationPreferences").lean();
  if (u?.notificationPreferences?.inApp === false) return null;
  return Notification.create({
    user: userId,
    type,
    title,
    body,
    meta,
  });
}

export async function notifyMany(userIds, payload) {
  const out = [];
  for (const id of [...new Set(userIds.map(String))]) {
    const n = await createNotification(id, payload);
    if (n) out.push(n);
  }
  return out;
}
