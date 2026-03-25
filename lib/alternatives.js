import User from "@/models/User";
import { checkConflicts } from "@/lib/conflicts";

export async function findAlternativeAssignees(
  locationId,
  requiredSkill,
  startTime,
  endTime,
  { excludeUserIds = [], shiftId = null, limit = 6 } = {},
) {
  const exclude = new Set(excludeUserIds.map(String));
  const candidates = await User.find({
    role: "Staff",
    skills: requiredSkill,
    locations: locationId,
  })
    .select("name skills locations recurringAvailability timezone availabilityExceptions")
    .limit(80)
    .lean();

  const suggestions = [];
  for (const u of candidates) {
    if (exclude.has(u._id.toString())) continue;
    const r = await checkConflicts(
      u._id,
      startTime,
      endTime,
      locationId,
      requiredSkill,
      shiftId,
    );
    if (!r.hasConflict) {
      suggestions.push({ id: u._id.toString(), name: u.name });
    }
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}
