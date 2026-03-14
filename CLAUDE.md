# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HFH Dashboard — Timesheet tracking and overtime management for the Henry Ford Hospital South Campus Expansion (Destination Grand) project, built for Pipefitters Local 636.

## Commands

- `npm run dev` — Start dev server (Next.js)
- `npm run build` — Production build
- `npm start` — Start production server

No test framework or linter is configured.

## Tech Stack

- **Next.js 14** (App Router) with React 18 — no TypeScript
- **Supabase** for PostgreSQL backend (client-side only, no API routes)
- **Vercel** for deployment (auto-deploys from main)

## Architecture

This is a single-page app. Nearly all logic lives in one file:

- `app/page.js` — The entire dashboard UI (~520 lines, `'use client'`). Contains all components, state, data fetching, and rendering for 5 tabs: Dashboard, Overtime, OT History, Weekly, Seniority.
- `app/layout.js` — Root layout with Google Fonts (DM Sans, JetBrains Mono).
- `app/globals.css` — All styling via CSS custom properties. Dark theme with color tokens (`--accent`, `--green`, `--red`, `--amber`, etc.).
- `lib/supabase.js` — Single Supabase client export using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY` env vars.

## Supabase Tables

The app reads/writes these tables:
- `employees` — name, trade, classification, first_date (seniority), last_date, is_active, specialty, notes
- `daily_hours` — employee_name, work_date, week_ending, straight_time, overtime_1_5x, double_time_2x, total_hours
- `ot_events` — event_name, event_date, hours_offered, spots_needed, status, excluded_reason
- `ot_responses` — event_id, employee_name, call_order, response, classification, specialty, ot_balance, seniority_date

## Domain Concepts

- **Trade codes**: `01-G Foreman`, `02-Foreman`, `06-Mechanic`, `93-Appr School`, `PF` (Journeyman), `PFA` (Apprentice)
- **OT callout list**: Journeymen sorted by lowest OT balance, then earliest seniority date. Workers on "6/10s" schedules or manually excluded are skipped.
- **Seniority flag**: 5+ consecutive work days absent triggers review per Local 636 bylaws.
- **Specialties**: Trimble, Welder, Bang It — shown as colored badges.
- `FULLY_ASSIGNED` constant lists employees always assigned OT (not on the callout rotation).

## Environment

Requires `.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=<url>
NEXT_PUBLIC_SUPABASE_KEY=<anon key>
```
