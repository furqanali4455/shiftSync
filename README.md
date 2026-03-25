# ShiftSync — Multi-Location Staff Scheduling Platform

A full-stack scheduling platform built with **Next.js 16**, **MongoDB/Mongoose**, and **Tailwind CSS v4**. Supports role-based access, shift conflict detection, cross-timezone scheduling, and real-time validation.

## Features

- **Shift Management** — Create, update, and delete shifts with real-time conflict detection
- **Conflict Detection** — Automatic skill matching, location certification, overlap prevention, and 10-hour rest gap enforcement
- **Multi-Timezone** — Shifts are stored in UTC and displayed in each location's configured timezone
- **Role-Based Access** — Admin, Manager, and Staff roles with server-enforced permissions
- **JWT Authentication** — Secure httpOnly cookie-based auth with bcrypt password hashing
- **Dark Mode** — Full dark/light theme toggle across all pages
- **Employee Management** — Add/edit employees with skills, roles, and location assignments
- **Location Management** — Configure locations with addresses and timezones
- **Analytics Dashboard** — Charts showing hours by day, top performers, and shift statistics
- **Labor & overtime (MVP)** — Weekly hour warnings (35h+), daily limits (8h warn / 12h block), consecutive-day rules (6th warn / 7th block + manager override), projected OT cost, what-if preview before save, shift rows highlighted when they push someone into overtime
- **Manager location scoping** — Managers only see users, shifts, and labor data for their assigned locations; location delete is admin-only
- **Availability & fairness** — Recurring weekly slots and exceptions on users; conflict checks include availability; dashboard fairness panel (premium-hour spread vs desired hours)
- **Multi-assignee shifts** — `requiredHeadcount` and `assignedUsers` (primary employee in UI + API parity)
- **Schedule cutoff & concurrency** — Edits blocked within `SHIFT_EDIT_CUTOFF_HOURS` of start (admin bypass); optimistic locking via `expectedSchemaVersion` on updates
- **Swaps & drops** — Staff-initiated swap/drop flows with manager approval, pending limits, and expiry on open drops
- **Notifications & SSE** — In-app notifications; `EventSource` to `/api/events` for live refresh (in-memory broadcast; single-instance demo assumption)
- **Audit & export** — Audit log API; CSV export for admins

### Labor compliance assumptions

- **Calendar basis:** Daily totals and “consecutive days worked” use **UTC calendar dates** (split each shift across UTC midnights). Shift times are still authored and shown in each **location’s** timezone on the UI; the labor engine uses UTC for consistent rules across zones.
- **Work week:** Weekly hours and OT projection use the **ISO week (Mon–Sun, UTC boundaries)**.
- **Consecutive days:** Any calendar day with **more than a trace of assigned time** counts as a worked day (same weight for short vs long shifts).
- **Costs:** Optional `LABOR_BASE_RATE` (default **$20/h**); hours beyond **40h** in the week are costed at **1.5×** for projection only.
- **Overrides:** Hard blocks (**>12h in one UTC day**, **7+ consecutive UTC workdays**) require `laborComplianceOverride: { reason }` (min **8** characters) on create/update; the reason is stored on the shift as `laborOverrideReason`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database | MongoDB via Mongoose |
| Auth | JWT (jose) + bcrypt |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Animations | Framer Motion |
| Icons | Lucide React |
| Dates | date-fns + date-fns-tz |

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB)

### Installation

```bash
git clone <repo-url>
cd shiftsync
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — Secret key for JWT token signing (use a strong random string)

Optional:
- `LABOR_BASE_RATE` — Hourly rate for OT projection (default 20)
- `SHIFT_EDIT_CUTOFF_HOURS` — Hours before shift start when manager edits are blocked (default 48; admins can bypass in API)

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Seeding Demo Data

After logging in, click **Seed Data** on the dashboard to populate the database with **4 locations** (Eastern ×2, Central, Pacific), five users, and six shifts (including multi-headcount and draft rows).

### Demo Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@shiftsync.com | admin123! |
| Manager | alice@shiftsync.com | password123 |
| Staff | bob@shiftsync.com | password123 |
| Staff | carol@shiftsync.com | password123 |
| Staff | david@shiftsync.com | password123 |

> The **Admin** can manage all users, change roles, create/edit shifts, and manage locations. Managers can do the same except manage other admins. Staff can view published schedules (and their own drafts), update their own availability/preferences, and use swaps. Staff **PUT** on `/api/users/[id]` is limited to self-service fields only.

## API Routes

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/auth/login` | POST | Public | Authenticate user |
| `/api/auth/register` | POST | Public | Create new account |
| `/api/auth/logout` | POST | Auth | Clear session |
| `/api/users` | GET, POST | Auth / Manager+ | List or create users (staff: self only) |
| `/api/users/[id]` | PUT, DELETE | Manager+ / Staff (self PUT) | Update or delete user |
| `/api/shifts` | GET, POST | Auth / Manager+ | List or create shifts; 400 + `suggestions` on conflict; 422 labor block |
| `/api/shifts/[id]` | PUT, DELETE | Manager+ | Update/delete; cutoff + `expectedSchemaVersion` (409 `CONCURRENT_EDIT`) |
| `/api/shifts/[id]/history` | GET | Manager+ | Audit entries for one shift |
| `/api/shifts/labor-preview` | POST | Manager+ | What-if labor check for a proposed assignment |
| `/api/shifts/on-duty` | GET | Auth | Current shifts overlapping “now” (scoped by role/location) |
| `/api/labor/summary` | GET | Manager+ | Current ISO week: projected hours, OT, cost, risk shift ids |
| `/api/locations` | GET, POST | Auth / Manager+ | List or create locations |
| `/api/locations/[id]` | PUT, DELETE | Manager+ / Admin (DELETE) | Update location; delete admin-only |
| `/api/seed` | POST | Dev only | Seed demo data |
| `/api/notifications` | GET, PATCH | Auth | List notifications; mark read |
| `/api/events` | GET | Auth | SSE stream (`text/event-stream`; in-memory hub) |
| `/api/swap-requests` | GET, POST | Auth / Staff (POST) | List requests; staff creates swap/drop |
| `/api/swap-requests/[id]` | POST | Auth | Actions: `accept_swap`, `claim_drop`, `cancel`, `approve`, `reject` |
| `/api/schedule/publish-week` | POST | Manager+ | Publish drafts in a week window; notify assignees |
| `/api/analytics/fairness` | GET | Manager+ | Premium hours & heuristic fairness score |
| `/api/audit-logs` | GET | Manager+ | Audit list; `?format=csv` **admin-only** export |

## Project Structure

```
shiftsync/
├── app/
│   ├── api/           # API route handlers
│   ├── login/         # Login page
│   ├── signup/        # Registration page
│   ├── manage/        # Employee & location management
│   ├── swaps/         # Swaps & coverage requests
│   ├── page.js        # Dashboard
│   ├── layout.js      # Root layout
│   └── globals.css    # Global styles + Tailwind config
├── lib/
│   ├── auth.js        # JWT token utilities
│   ├── conflicts.js   # Shift conflict detection logic
│   └── db.js          # MongoDB connection
├── models/
│   ├── User.js        # User schema
│   ├── Shift.js       # Shift schema
│   └── Location.js    # Location schema
├── middleware.js       # Auth middleware (route protection)
└── __tests__/          # Test files
```

## Testing

```bash
npm test
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run test suite |
