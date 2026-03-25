import Shift from "@/models/Shift";
import User from "@/models/User";
import { isUserAvailableForShift } from "@/lib/availability";

function userOnShiftFilter(userId) {
  return {
    $or: [{ user: userId }, { assignedUsers: userId }],
  };
}

export async function checkConflicts(
  userId,
  startTime,
  endTime,
  locationId,
  requiredSkill,
  shiftId = null,
) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const user = await User.findById(userId).lean();
  if (!user) {
    return { hasConflict: true, message: "User not found", code: "NOT_FOUND" };
  }

  if (!user.skills.includes(requiredSkill)) {
    return {
      hasConflict: true,
      message: `Staff lacks required skill: ${requiredSkill}`,
      code: "SKILL",
    };
  }

  const isCertified = user.locations.some(
    (loc) => loc.toString() === locationId.toString(),
  );
  if (!isCertified) {
    return {
      hasConflict: true,
      message: "Staff is not certified for this location",
      code: "LOCATION",
    };
  }

  const avail = isUserAvailableForShift(user, start, end);
  if (!avail.ok) {
    return {
      hasConflict: true,
      message: avail.message,
      code: "AVAILABILITY",
    };
  }

  const overlapQuery = {
    ...userOnShiftFilter(userId),
    startTime: { $lt: end },
    endTime: { $gt: start },
  };
  if (shiftId) overlapQuery._id = { $ne: shiftId };
  const overlap = await Shift.findOne(overlapQuery);
  if (overlap) {
    return {
      hasConflict: true,
      message: "Staff is already scheduled for another shift during this time.",
      code: "OVERLAP",
    };
  }

  const tenHoursInMs = 10 * 60 * 60 * 1000;
  const nearbyQuery = {
    ...userOnShiftFilter(userId),
    $or: [
      {
        endTime: {
          $gte: new Date(start.getTime() - tenHoursInMs),
          $lte: start,
        },
      },
      {
        startTime: { $gte: end, $lte: new Date(end.getTime() + tenHoursInMs) },
      },
    ],
  };
  if (shiftId) nearbyQuery._id = { $ne: shiftId };
  const nearbyShift = await Shift.findOne(nearbyQuery);
  if (nearbyShift) {
    return {
      hasConflict: true,
      message: "Violation: Less than 10 hours of rest between shifts.",
      code: "REST_GAP",
    };
  }

  return { hasConflict: false };
}
