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

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Seeding Demo Data

After logging in, click **Seed Mock Data** on the dashboard to populate the database with sample locations, employees, and shifts.

### Demo Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@shiftsync.com | admin123! |
| Manager | alice@shiftsync.com | password123 |
| Staff | bob@shiftsync.com | password123 |
| Staff | carol@shiftsync.com | password123 |
| Staff | david@shiftsync.com | password123 |

> The **Admin** can manage all users, change roles, create/edit shifts, and manage locations. Managers can do the same except manage other admins. Staff can view their schedules.

## API Routes

| Route | Methods | Auth | Description |
|-------|---------|------|-------------|
| `/api/auth/login` | POST | Public | Authenticate user |
| `/api/auth/register` | POST | Public | Create new account |
| `/api/auth/logout` | POST | Auth | Clear session |
| `/api/users` | GET, POST | Auth / Manager+ | List or create users |
| `/api/users/[id]` | PUT, DELETE | Manager+ | Update or delete user |
| `/api/shifts` | GET, POST | Auth / Manager+ | List or create shifts |
| `/api/shifts/[id]` | PUT, DELETE | Manager+ | Update or delete shift |
| `/api/locations` | GET, POST | Auth / Manager+ | List or create locations |
| `/api/locations/[id]` | PUT, DELETE | Manager+ | Update or delete location |
| `/api/seed` | POST | Manager+ (dev only) | Seed demo data |

## Project Structure

```
shiftsync/
├── app/
│   ├── api/           # API route handlers
│   ├── login/         # Login page
│   ├── signup/        # Registration page
│   ├── manage/        # Employee & location management
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
