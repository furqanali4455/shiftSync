/**
 * Side-effect: register every Mongoose model before any populate().
 * Next.js production splits API routes into separate bundles; a route may import
 * Shift/User without ever loading Location, which breaks populate("location").
 */
import "@/models/Location";
import "@/models/User";
import "@/models/Shift";
import "@/models/Notification";
import "@/models/AuditLog";
import "@/models/SwapRequest";
