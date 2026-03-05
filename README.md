# HFH South Campus — Pipefitters 636 Dashboard

Timesheet tracking and overtime management for the Henry Ford Hospital South Campus Expansion (Destination Grand) project.

## Stack
- **Next.js 14** — React framework
- **Supabase** — PostgreSQL database + REST API
- **Vercel** — Hosting & deployment

## Setup

### 1. Clone and install
```bash
git clone <your-repo-url>
cd hfh-dashboard
npm install
```

### 2. Environment variables
Create `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_KEY=your_supabase_key
```

### 3. Run locally
```bash
npm run dev
```

### 4. Deploy
Push to GitHub — Vercel auto-deploys from main branch.

## Features
- **Dashboard** — Employee hours summary with search, filter, sort
- **Overtime Tracker** — Bid OT vs Assigned OT, callout list generator
- **Weekly View** — Week-by-week crew and hours summary
- **Seniority Tracker** — 5-day consecutive absence monitoring per Local 636 bylaws
