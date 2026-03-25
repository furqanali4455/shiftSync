export function getShiftEditCutoffHours() {
  const n = parseInt(process.env.SHIFT_EDIT_CUTOFF_HOURS || "48", 10);
  return Number.isFinite(n) && n >= 0 ? n : 48;
}

export function isShiftLockedByCutoff(shiftStartUtc, { role, bypassScheduleCutoff }) {
  const h = getShiftEditCutoffHours();
  if (h === 0) return false;
  const msLeft = new Date(shiftStartUtc).getTime() - Date.now();
  if (msLeft > h * 3600000) return false;
  if (role === "Admin" && bypassScheduleCutoff) return false;
  return true;
}
