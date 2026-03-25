export function parseShiftWriteBody(body) {
  const {
    laborComplianceOverride,
    expectedSchemaVersion,
    bypassScheduleCutoff,
    ...rest
  } = body || {};
  return {
    rest,
    laborOverride: laborComplianceOverride,
    expectedSchemaVersion:
      expectedSchemaVersion !== undefined && expectedSchemaVersion !== null
        ? Number(expectedSchemaVersion)
        : null,
    bypassScheduleCutoff: Boolean(bypassScheduleCutoff),
  };
}

export function normalizeShiftAssignees(data) {
  const out = { ...data };
  let ids = [];
  if (Array.isArray(out.assignedUsers) && out.assignedUsers.length > 0) {
    ids = [...new Set(out.assignedUsers.map((x) => String(x)))];
  } else if (out.user) {
    ids = [String(out.user)];
  }
  out.assignedUsers = ids;
  out.user = ids[0] || null;
  const cap = Math.min(Math.max(parseInt(out.requiredHeadcount, 10) || 1, 1), 20);
  out.requiredHeadcount = cap;
  if (ids.length > cap) {
    throw new Error(`Too many assignees (${ids.length}) for headcount ${cap}.`);
  }
  return out;
}

export function getAssigneeIdsFromShiftDoc(shift) {
  const raw = shift.assignedUsers?.length ? shift.assignedUsers : [];
  const fromArr = raw.map((x) => (x && x._id ? x._id : x).toString());
  if (fromArr.length) return fromArr;
  if (shift.user) return [(shift.user._id || shift.user).toString()];
  return [];
}
