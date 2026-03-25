import AuditLog from "@/models/AuditLog";

export async function writeAudit({
  actorId,
  action,
  entityType,
  entityId,
  locationId = null,
  before = null,
  after = null,
}) {
  return AuditLog.create({
    actor: actorId,
    action,
    entityType,
    entityId,
    location: locationId,
    before,
    after,
  });
}
