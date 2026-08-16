# EM Roster Manager — Logic & Architecture

This document explains **how the Roster Manager works**: the core data model, business rules, the OT calculation engine, storage layer, and every API endpoint.

---

## 1. Overview & Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite + Tailwind CSS 4 + TypeScript |
| Backend | Express (single `server.ts`) |
| Data storage | Supabase (Postgres) with automatic **local JSON file fallback** |
| Utilities | Papaparse (CSV), xlsx (Excel), Recharts (charts), Lucide (icons), @floating-ui/react (popover positioning) |
| Auth | Firebase Google Sign-In (`@google/genai`, `firebase`) |

The app is a **single Express server** that:
1. Serves the React SPA (Vite middleware in dev, static `dist/` in prod).
2. Exposes a REST API under `/api/*`.
3. Persists data through a `store` abstraction layer.

---

## 2. Architecture

```
Browser (React SPA)
    │  fetch /api/*
    ▼
server.ts (Express — all API routes)
    │
    ▼
server/store.ts (data access layer)
    │
    ├── Supabase client (if env keys configured & tables exist)
    ├── Firebase (stubbed / disabled)
    └── Local JSON files in /data  (always kept as fallback/mirror)
```

**Storage strategy (important):**
- If valid `SUPABASE_URL` + `SUPABASE_KEY` are present **and** the tables exist, reads/writes go to Supabase.
- On any Supabase error (especially missing tables, code `42P01`/`PGRST205`), it **automatically falls back to local JSON files** (`data/*.json`).
- Supabase operations are always **mirrored to local JSON** as a backup.

---

## 3. Core Data Model (`src/types/roster.ts`)

### RosterEntry — one row per calendar day
| Field | Meaning |
|-------|---------|
| `id` | Usually `roster-<date>` |
| `date` | `YYYY-MM-DD` |
| `day` | Weekday name (e.g. "Monday") |
| `originalStatusId` | **Official office roster status. NEVER overwritten** once set. |
| `changedStatusId` | New status if a change was made, else `null` |
| `currentStatusId` | **Effective** status = the one that actually applies |
| `action` | Reason/action text (e.g. "Work on Roster 10.15 - 7.30") |
| `notes` | Free-text remark |
| `ot` | Boolean — whether OT applies |
| `clockIn` / `clockOut` | `HH:MM` actual times |
| `otMorningHours` / `otNightHours` | Manual OT hour splits |
| `googleCalendarSyncStatus` | `Synced` / `Syncing` / `Sync Failed` / `Not Synced` |
| `googleCalendarEventId` | GCal event reference |
| `createdAt` / `updatedAt` / `lastChangedBy` | Audit trail |

### RosterStatusConfig — configurable status definitions
`NWD`, `RTD`, `OT`, `DOS`, `DOF`, `HOL`, `Training`, `WFH`, `LEAVE`, `Short Leave`, `Leave(Half)`, `ML`.

Each status has: display name, description, colors, `isWorkDay`, and calendar event config (`startTime`/`endTime`/title prefix). Statuses are editable in Settings.

### RosterChangeHistory — audit log
Every status change writes a record with previous/new status, previous/new action, reason, user, timestamp, and GCal event info.

---

## 4. Roster Cycle Logic (16th → 15th)

- A "cycle month" `YYYY-MM` maps to dates **`YYYY-MM-16` → `YYYY-MM-15`** of the next month.
  - Example: `2026-08` → `2026-08-16` … `2026-09-15`.
- `getRosterCycleForDate(date)` (`src/utils/date.ts`) decides which cycle a date belongs to:
  - Day ≤ 15 → previous month's cycle.
  - Day ≥ 16 → current month's cycle.
- `getRosterCycleRange(monthYearStr)` (`src/utils/date.ts`) returns the cycle span `YYYY-MM-16` → next month `-15`.
- The server applies the **same 16th→15th boundaries** everywhere a `monthYear` range is built:
  - `getCycleDateRange()` in `server.ts` is used by `GET /api/roster`, `GET /api/summary`, and the clear handler — never calendar `01`→`31`.
  - `POST /api/clock/sync` derives its range from the loaded cycle's entries (the UI only ever passes cycle dates).
- `store.getLeaveBalance()` is the one exception: leave entitlements reset on **Jan 1**, so it deliberately counts the calendar year (`YYYY-01-01` → `YYYY-12-31`).
- The app always opens on the cycle containing **today**, and offers ±6 months of cycle options.
- All date math is done on **local dates** (`parseLocalDate`) to avoid UTC shift bugs.

---

## 5. Core Business Logic (server.ts)

### 5.1 Original vs Current status (THE key rule)
The system distinguishes the **official office roster** (`originalStatusId`) from the **actual/effective status** (`currentStatusId`).

- When creating a roster entry, `originalStatusId` is set from the office file and is **never overwritten** afterward.
- A user change only updates `currentStatusId` and sets `changedStatusId`.
- `changedOnly` filter / "Show Changed Only" highlights days where `originalStatusId !== currentStatusId`.

### 5.2 Change Roster Workflow (`PUT /api/roster/:id/change`)
1. Reads the existing entry.
2. Preserves `originalStatusId`.
3. If `newStatusId !== originalStatusId` → sets `changedStatusId = newStatusId`; otherwise resets it to `null` (back to original).
4. Writes an **audit history record** with before/after values.
5. Optionally marks the GCal event as Synced (or creates an event id).
6. Recalculates & persists OT.

### 5.3 Bulk Change (`POST /api/roster/bulk-change`)
Same rules as 5.2 but applied to a list of `ids`, writing **one history record per affected entry**.

### 5.4 Create Entry (`POST /api/roster`)
- If the date already exists → merge: keep `originalStatusId`, update changed/current/action/notes/clock times/OT fields. (This is how manual edits don't clobber the official roster.)
- If new → create with `currentStatusId = changedStatusId || originalStatusId`.

### 5.5 Clock Times (`PUT /api/roster/:id/clock-times` & batch)
- Updates `clockIn`, `clockOut`, `notes`.
- Writes a clock event to Supabase `clock_events` (async, non-blocking).
- Recomputes OT for the affected entries.

### 5.6 Import (Excel/CSV) (`POST /api/import`)
1. **Validation**: date must be `YYYY-MM-DD`; status codes must exist in configured statuses. Invalid rows are collected with error messages.
2. **Gap auto-fill**: for the span min→max date in the file, any **missing date is automatically inserted as `HOL`** (Normal Holiday).
3. Status normalization: `DOF(...)` → `DOF`, `DOS(...)` → `DOS`.
4. **Merge logic (critical rule)**:
   - If the date already exists and the user previously changed it (`changedStatusId` set), the import updates only `originalStatusId` and **preserves the user's manual change** (`currentStatusId` stays the user's change).
   - If no user change, import sets original → current.
   - If the date doesn't exist → create a new entry.
5. Records an `ImportHistoryRecord` with created/updated/skipped counts, date range, file hash, and status (`Successful` / `Partial` / `Failed`).
6. Duplicate files can be detected via file hash (`POST /api/import/check-duplicate`).

### 5.7 Weekly Template Generator (`POST /api/templates/generate`)
- Generates roster entries for a date range based on a day-of-week → status map.
- Default: Saturday/Sunday → `DOF`, other days → `RTD`.
- If an entry exists and `overwrite` is true, it resets status; if it doesn't exist, it creates it (with GCal event id).

### 5.8 Clock Sync with 3-Day Rolling Backfill (`POST /api/clock/sync`)
1. Accepts a date range (cycle-aware, from the UI) and optional incoming events.
2. Extends the start date **3 days earlier** (`rollStartDate`) so recent days get re-checked for complete clock-outs.
3. Events are upserted into `clock_events` with **non-null merging** — if an incoming event only has `clock_in`, the existing `clock_out` is preserved (and vice-versa).
4. Merged events are written back into `roster_entries` (`clockIn`/`clockOut`), extracting `HH:MM` in timezone `Asia/Colombo`.
5. Recomputes and persists OT for all affected entries via `syncAndPersistOtForEntries()`.

### 5.9 Summary Analytics (`GET /api/summary`)
Counts over a cycle: total days, working days, off days (`DOF`), holidays (`HOL`), leave days (anything containing `LEAVE`, `Short Leave`, `Leave(Half)`, `ML`), OT days/hours, changed days, synced count, and a per-status breakdown.

### 5.10 Clear / Delete
- `DELETE /api/roster/:id` — removes a single entry.
- `DELETE /api/roster/clear` — removes by cycle (`cycle:YYYY-MM`), calendar month (`cal:YYYY-MM`), full `YYYY-MM`, or everything. History for deleted entries is also pruned; "clear all" resets rosters, import history, and history.

---

## 6. OT Calculation Engine (`src/utils/otCalculator.ts`)

### Settings (editable, default values)
| Setting | Default | Meaning |
|---------|---------|---------|
| `gracePeriodMinutes` | 15 | Ignore early-in/late-out under this |
| `minimumOtThresholdMinutes` | 30 | Below this, payable OT = 0 |
| `roundingRule` | `down` | Rounding direction |
| `roundingBlockMinutes` | 15 | Round to blocks of 15 |
| `wfhEligibleForOt` | false | WFH excluded from OT |
| `trainingEligibleForOt` | false | Training excluded from OT |

### Shift windows (scheduled start/end)
- `NWD`, `Training`, `WFH` → 08:15–17:30
- `RTD` → 10:15–19:30
- `DOS(...)` → parsed start (default 10:15) → 19:30
- Otherwise the **action text** is parsed for a `HH:MM - HH:MM` range; if end < start it's treated as overnight (+12h).

### How `calculateDayOt` works
1. Classify the day:
   - `DOS*` → `DOS_DAY` (settlement, not paid OT)
   - `DOF*` → `LEAVE_DAY`
   - `LEAVE`/`Short Leave`/`Leave(Half)`/`ML` → `LEAVE_DAY`
   - `OT` → `FULL_OT_DAY` (all worked time is OT)
   - `HOL`/blank → `UNSCHEDULED`
   - else → `STANDARD_SHIFT`
2. **Full OT day**: `rawOt = clockOut − clockIn` (or from `otMorningHours`+`otNightHours`).
3. **Standard shift**: `rawOt = earlyIn + lateOut` where
   - `earlyIn = max(0, schedStart − clockIn)`
   - `lateOut = max(0, clockOut − schedEnd)`
   - Deduct grace on each side, then **round** down/nearest/up to the block size.
   - If rounded net < threshold → payable = 0.
4. Flags are collected (e.g. attendance on leave/DOF days, unscheduled work on holidays, excluded WFH/Training, DOS compensation note).

### DOS/DOF Day-Off Settlement Ledger (`buildDosDofLedger`)
- `DOS` = "Day Off Settlement" — a day worked that earns a future day off.
- `DOF(date)` = "Day Off" referencing the DOS date it settles.
- The ledger matches DOF → DOS by date reference:
  - Match found → `SETTLED`.
  - DOF with no matching DOS → `ORPHANED_DOF` (warning).
  - DOS not yet claimed → `PENDING` (owed).
- `owedBalance = dosCount − dofCount` where `dofCount` counts **only settlement DOFs** (`DOF(...)` with a DOS reference). Plain `GENERAL_DOF` (a standard day off with no reference) is **excluded** — it is not part of the settlement ledger, so it must not reduce the balance (otherwise a fresh cycle with just rest days would show a negative "Days Owed").
- The ledger is surfaced in the UI by `src/components/DosDofLedger.tsx` on the Dashboard view.

### Compliance Audit (`runComplianceAudit`)
Runs PASS/WARNING/FAIL checks: grace period config, min OT threshold, rounding block, DOS exclusion from paid OT, orphaned DOF checks, attendance on leave/DOF days (FAIL), unlabeled worked holidays (WARNING).

---

## 7. Leave Balance (`GET /api/leave-balance`)

- Leave types: `Annual Leave`, `Casual Leave`, `Lieu Leave`, `Medical Leave`, `Short Leave`.
- Utilized = `opening_utilized` (leave consumed before app tracking began) + count of roster days whose code maps to a leave type in the calendar year (`LEAVE`→Annual, `Medical LEAVE`→Medical, `Leave(Half)`→Short, `DOF`→Lieu).
- Balance = `entitlement − utilized`. Short Leave is auto-seeded at 24.0 if missing.
- `opening_utilized` defaults to 0 and is stored on `leave_entitlements` (see `supabase_migration_leave_opening_utilized.sql` + `supabase_seed_leave_opening_utilized.sql`).

### Leave Apply Flow (client)
- Days eligible for leave: `NWD`, `RTD`, `WFH` (plus `Training` with a confirmation warning). Already-leave codes (`LEAVE*`, `Medical LEAVE`, `Casual Leave`, `Short Leave`, `Leave(Half)`, `ML`, `DOF`) offer "Revert to Original" instead. `OT`/`DOS`/`HOL`/blank are blocked.
- `src/utils/leave.ts` holds the leave catalogue (`LEAVE_OPTIONS`), the roster-code → leave-type map (`LEAVE_CODE_TO_TYPE`), and `validateLeaveApplication()`:
  - `ML` (Maternity) → always allowed, no cap.
  - No entitlement row → blocked ("Contact HR").
  - Zero balance → blocked for Annual/Casual/Short; **Medical Leave warns but allows** (leaves it to HR to resolve).
  - `Leave(Half)` draws from the **Short Leave pool**.
- `src/components/LeavePickerModal.tsx` renders the picker via `createPortal(jsx, document.body)` (never inside the roster table, so it is never clipped by `overflow`), shows per-option balances and an "After applying: X days remaining" preview, and disables **Confirm** when a zero-balance option is selected (except Medical/ML). Confirm button is `#E60023`, pill-shaped.
- Applying/reverting leave calls the existing `PUT /api/roster/:id/change` endpoint (audited), then the client reloads roster + leave balance so the Leave Balance card stays in sync.

---

## 8. Storage Layer (`server/store.ts`)

| Method | Backing |
|--------|---------|
| `getRosters` / `saveRosters` | Supabase `roster_entries` (+ mirror JSON). Roster entries are **hydrated** with clock times from `clock_events` if missing. |
| `getHistory` / `saveHistory` / `addHistoryRecord` | Supabase `roster_history` |
| `getStatuses` / `saveStatuses` | Supabase `roster_statuses` (auto-seeds defaults when empty) |
| `getSettings` / `saveSettings` | Supabase `app_settings` (single `id='default'` row) |
| `getImportHistory` / `addImportHistoryRecord` | Supabase `import_history` |
| `getOrCreateEmployee` | Supabase `employees` (upsert by `employee_no`, default `900466`) |
| `syncRosterDays` | Supabase `roster_days` — denormalized per-day codes with parsed start time and DOF reference date |
| `saveClockEvents` / `getClockEvents` | Supabase `clock_events` with **non-null merge** on `employee_id+event_date` |
| `saveOtCalculations` / `getOtCalculations` | Supabase `ot_calculations` (upsert on `employee_id+calc_date`) |
| `getLeaveEntitlements` / `getLeaveBalance` | Supabase `leave_entitlements` + roster days |

On Vercel, writes go to `/tmp/data`; locally to `data/`.

---

## 9. API Endpoint Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/supabase-status` | Supabase connectivity + table check |
| GET | `/api/supabase-sql` | Returns `supabase_setup.sql` content |
| GET | `/api/roster` | List entries (filter: monthYear, dates, statuses, changedOnly, otOnly, syncStatus, search) |
| GET | `/api/roster/:id` | Single entry |
| POST | `/api/roster` | Create / upsert entry |
| PUT | `/api/roster/:id/change` | Change status (audited) |
| PUT | `/api/roster/:id/clock-times` | Update clock times + remark |
| POST | `/api/roster/clock-times/batch` | Batch clock times |
| POST | `/api/roster/bulk-change` | Bulk status change (audited) |
| DELETE | `/api/roster/:id` | Delete entry |
| DELETE | `/api/roster/clear` (also `/all/clear`) | Delete by cycle/month/all |
| GET | `/api/summary` | Month-cycle analytics |
| GET | `/api/history` | Audit history (filter by entry/date) |
| GET/PUT | `/api/statuses` | Read/update status configs |
| GET/PUT | `/api/settings` | Read/update app settings |
| GET | `/api/calendar/calendars` | Mock list of user calendars |
| POST | `/api/calendar/sync/:id` | Mark single entry synced |
| POST | `/api/calendar/sync-all` | Bulk mark synced |
| POST | `/api/ot/save` | Compute + persist OT for entries |
| GET | `/api/ot/calculations` | Read persisted OT calcs |
| POST | `/api/clock/sync` | Clock sync w/ 3-day rolling backfill |
| GET | `/api/clock/events` | Read clock events |
| GET | `/api/leave-balance` | Leave balance for a year |
| GET | `/api/auth/google/url` | Build Google OAuth URL |
| GET | `/auth/callback` | OAuth callback (marks connected) |
| GET | `/api/import/history` | Import history |
| POST | `/api/import/check-duplicate` | File-hash duplicate check |
| POST | `/api/import` | Import rows |
| POST | `/api/templates/generate` | Generate template rosters |

---

## 10. Frontend Flow (`src/App.tsx`)

- **Auth gate**: Firebase `onAuthStateChanged`. Unauthenticated users see `LoginScreen`. On auth, settings are fetched and the app loads data.
- **Load cycle**: on user/month change → `Promise.all` fetches entries, statuses, settings, and summary for the active **cycle** (`getRosters({ monthYear })` + `getSummary(monthYear)`). Leave balance is fetched separately and held centrally in `leaveRows` so the balance card and the leave picker always agree.
- **Views**: Table / Calendar / Dashboard (Analytics). Table supports search, status filter, "changed only", and bulk selection.
- **Dashboard** shows, in order: Leave Balance card (`LeaveBalanceCard`), the **Day-Off Settlement Ledger** (`DosDofLedger`, fed by `buildDosDofLedger` from the already-loaded entries — no extra API call), and Roster Analytics charts (status distribution, original-vs-current, modifications, OT breakdown).
- **Leave picker flow**: clicking a working day opens `RosterChangeModal`; it offers **Apply Leave** (NWD/RTD/WFH/Training), **Revert to Original** (already-leave codes), or a blocked notice. "Apply Leave" opens `LeavePickerModal` (portal-based) which validates balance client-side before calling `PUT /api/roster/:id/change`. After save the roster and leave balance are reloaded; reverting credits the balance back via the same audited endpoint.
- **Modals**: Add roster, Change roster, **Leave picker**, Audit history, Delete confirm, Import wizard, Export, Settings, Bulk edit, Template generator, OT calculator, Print view.
- **Google Calendar**: sync-all syncs the visible cycle entries to GCal via the OAuth token (`syncRosterEntriesToGoogleCalendar`), then persists event ids through the API. Single sync creates/updates one event. Deleting an entry can optionally delete its GCal event.
- **OT Calculator modal**: runs `calculateDayOt` client-side, lets the user adjust settings, and can persist via `/api/ot/save`. The "Sync Clock & OT" button calls `POST /api/clock/sync` (cycle range) then `/api/ot/save`.

---

## 11. Key Business Rules (cheat sheet)

1. **`originalStatusId` is sacred** — never overwritten once the office roster is imported.
2. **`currentStatusId` = effective status**; a change is tracked in `changedStatusId` + audit history.
3. Import updates the office roster but **preserves user's manual changes**.
4. Import fills missing dates in the file's span with **HOL**.
5. Clock events **merge non-null** values; sync backfills the last 3 days.
6. OT: grace 15m → round to 15m blocks → min threshold 30m → else 0. WFH/Training excluded by default.
7. DOS earns a day off; DOS is excluded from paid OT; DOF settles DOS; unmatched DOF = warning, unclaimed DOS = owed.
8. A cycle runs **16th of a month → 15th of the next**; every `monthYear`-based range in the server uses cycle boundaries (except leave balance, which is calendar-year).
9. Supabase is the primary store; local JSON is the automatic fallback/mirror.
10. Leave applies only to `NWD`/`RTD`/`WFH` (Training = confirm); already-leave days revert instead; `OT`/`DOS`/`HOL` are blocked.
11. Leave is validated against balance before saving; zero-balance blocks Confirm (except Medical = warn-and-allow and Maternity = no cap); `Leave(Half)` uses the Short Leave pool.
12. OT results are persisted to `ot_calculations` after every clock change / status change / sync; failures surface as `[OT SAVE ERROR]` in server logs without blocking the request.
13. `GENERAL_DOF` (plain day off) is **not** a settlement entry — it is excluded from the DOS/DOF ledger balance to avoid a negative "Days Owed".
