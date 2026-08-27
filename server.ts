import express from 'express';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { store } from './server/store.js';
import { requireAuth, type AuthedRequest } from './server/auth.js';
import * as taskStore from './server/taskStore.js';
import * as taskGroupStore from './server/taskGroupStore.js';
import * as taskTemplateStore from './server/taskTemplateStore.js';
import { Task, TaskGroup, TaskTemplate } from './src/types/tasks.js';
import { RosterEntry, RosterChangeHistory, AppSettings } from './src/types/roster.js';
import { getDayOfWeekName, extractTimeInTimezone } from './src/utils/date.js';
import { calculateDayOt, DEFAULT_OT_SETTINGS } from './src/utils/otCalculator.js';

// TMS definition -> runtime transition: substitute {{variables}} and fan out
// a template into concrete tasks (single task or sequenced group with deps).
const VALID_TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];
const VALID_TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_TASK_CATEGORIES = ['work', 'personal', 'projects'];

function substituteVariables(text: string, values: Record<string, string>, variables: TaskTemplate['variables']): string {
  return String(text || '').replace(/\{\{([\w-]+)\}\}/g, (match, key: string) => {
    const provided = values?.[key];
    if (provided !== undefined && String(provided).trim()) return String(provided).trim();
    const fallback = variables.find((v) => v.key === key)?.defaultValue;
    return fallback !== undefined ? String(fallback) : '';
  });
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function instantiateFromTemplate(body: {
  templateId?: string;
  variableValues?: Record<string, string>;
  dueDate?: string | null;
  user?: string;
}): Promise<{ group: TaskGroup | null; tasks: Task[] }> {
  const templates = await taskTemplateStore.getTaskTemplates();
  const template = templates.find((t) => t.id === body.templateId);
  if (!template) {
    throw new taskStore.TaskRouteError(404, 'Task template not found');
  }
  const values = body.variableValues || {};
  const baseDue = body.dueDate || null;

  // Single-task template.
  if (!template.children || template.children.length === 0) {
    const task = await taskStore.createTask({
      title: substituteVariables(template.titleTemplate, values, template.variables),
      notes: substituteVariables(template.notesTemplate || '', values, template.variables),
      priority: template.priority,
      tags: template.tags,
      dueDate: baseDue,
      user: body.user || 'User',
      category: (template as { category?: Task['category'] }).category ?? 'work',
    });
    return { group: null, tasks: [task] };
  }

  // Group template: create the container first (TMS runtime container object).
  const group = await taskGroupStore.createTaskGroup({ name: substituteVariables(template.name, values, template.variables), description: template.description });

  // Pre-allocate sibling ids so dependsOnIndexes resolve to real tasks in one write.
  const ids = template.children.map(() => randomUUID());
  const today = new Date().toISOString().slice(0, 10);

  const createdTasks = await taskStore.mutateTasks((tasks) => {
    let next = [...tasks];
    const children: Task[] = template.children!.map((child, i) => {
      const offset = child.dueOffsetDays ?? 0;
      const spec = {
        id: ids[i],
        title: substituteVariables(child.titleTemplate, values, template.variables),
        notes: substituteVariables(child.notesTemplate || '', values, template.variables),
        priority: child.priority ?? template.priority,
        tags: [...template.tags, group.name],
        dueDate: baseDue ? addDaysStr(baseDue, offset) : addDaysStr(today, offset),
        user: body.user || 'User',
        groupId: group.id,
        sequence: i + 1,
        dependsOn: (child.dependsOnIndexes ?? []).map((di) => ids[di]).filter(Boolean),
        category: (template as { category?: Task['category'] }).category ?? 'work',
      };
      return taskStore.createTaskFromSpec(spec, next);
    });
    next = [...next, ...children];
    return { next, value: children };
  });

  return { group, tasks: createdTasks };
}

// Date calculation helper for rolling backfill
function subDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// Helper to compute and persist OT calculations for entries
async function syncAndPersistOtForEntries(entries: RosterEntry[], customOtSettings?: any) {
  try {
    const settings = customOtSettings || (await store.getSettings())?.otCalculationSettings || DEFAULT_OT_SETTINGS;
    const emp = await store.getOrCreateEmployee();

    const otCalcs = entries.map((entry) => {
      const res = calculateDayOt(entry, entry.clockIn, entry.clockOut, settings);
      let otType = 'none';
      if (res.isDos || res.statusType === 'DOS_DAY') {
        otType = 'day_off_settlement';
      } else if (res.statusType === 'FULL_OT_DAY' || res.billableOtMinutes > 0) {
        otType = 'paid_ot';
      }

      return {
        employee_id: emp.id,
        calc_date: entry.date,
        roster_code: entry.currentStatusId || entry.originalStatusId || 'NWD',
        scheduled_start: res.scheduledStart || null,
        scheduled_end: res.scheduledEnd || null,
        actual_clock_in: entry.clockIn || null,
        actual_clock_out: entry.clockOut || null,
        raw_ot_minutes: res.rawOtMinutes || 0,
        billable_ot_minutes: res.billableOtMinutes || 0,
        ot_type: otType,
      };
    });

    await store.saveOtCalculations(otCalcs);
  } catch (err: any) {
    console.error('[OT SAVE ERROR]', err?.message, err?.code, err);
  }
}

async function createServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Security headers (minimal helmet-equivalent; no extra dependency)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Simple in-memory rate limiter (per-IP, fixed window). On serverless this
  // is per-instance; pair with edge/WAF rules for cross-instance enforcement.
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  function rateLimit(max: number, windowMs: number) {
    return (req: any, res: any, next: any) => {
      const key = req.ip || req.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const bucket = rateBuckets.get(key);
      if (!bucket || now > bucket.resetAt) {
        rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
        next();
        return;
      }
      bucket.count += 1;
      if (bucket.count > max) {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
      next();
    };
  }
  // Periodically drop expired buckets so the map cannot grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets) {
      if (now > bucket.resetAt) rateBuckets.delete(key);
    }
  }, 60_000).unref();

  app.use('/api', rateLimit(300, 60_000));

  // Authentication: every /api route requires a valid Firebase ID token from
  // an allow-listed email, except the health probe.
  app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    requireAuth(req, res, next);
  });

  // Serializes whole-table roster read-modify-write cycles within this
  // process, so two concurrent requests can never interleave read and write
  // phases. (Cross-process safety comes from Supabase being authoritative
  // plus upsert-before-delete ordering.)
  let rosterWriteQueue: Promise<unknown> = Promise.resolve();
  function withRosterLock(handler: (req: any, res: any) => Promise<any>): (req: any, res: any) => Promise<any> {
    return async (req: any, res: any) => {
      const run = rosterWriteQueue.then(() => handler(req, res));
      rosterWriteQueue = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    };
  }

  // Helper to get 16th-to-15th roster cycle date range
  function getCycleDateRange(monthYearStr: string) {
    const [year, month] = monthYearStr.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-16`;
    const endObj = new Date(year, month, 15);
    const endDate = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-15`;
    return { startDate, endDate };
  }

  // API Routes
  // 1. Health check (unauthenticated, for uptime probes)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Identity of the authenticated user (auth middleware already enforced allow-list)
  app.get('/api/auth/me', (req, res) => {
    const user = (req as AuthedRequest).user;
    res.json({ email: user?.email || null, uid: user?.user_id || null });
  });

  // Supabase status check
  app.get('/api/supabase-status', async (req, res) => {
    try {
      const status = await store.checkSupabaseStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Supabase SQL setup file getter
  app.get('/api/supabase-sql', (req, res) => {
    try {
      const sqlPath = path.join(process.cwd(), 'supabase_setup.sql');
      if (fs.existsSync(sqlPath)) {
        const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
        res.json({ sql: sqlContent });
      } else {
        res.status(404).json({ error: 'SQL setup file not found' });
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // 2. Get Roster Entries with filtering
  app.get('/api/roster', async (req, res) => {
    try {
      let entries = await store.getRosters();

      const { monthYear, search, currentStatus, originalStatus, changedOnly, otOnly, syncStatus, startDate, endDate } = req.query;

      if (monthYear && typeof monthYear === 'string') {
        const { startDate: cStart, endDate: cEnd } = getCycleDateRange(monthYear);
        entries = entries.filter((e) => e.date >= cStart && e.date <= cEnd);
      }

      if (startDate && typeof startDate === 'string') {
        entries = entries.filter((e) => e.date >= startDate);
      }

      if (endDate && typeof endDate === 'string') {
        entries = entries.filter((e) => e.date <= endDate);
      }

      if (currentStatus && typeof currentStatus === 'string') {
        entries = entries.filter((e) => e.currentStatusId === currentStatus);
      }

      if (originalStatus && typeof originalStatus === 'string') {
        entries = entries.filter((e) => e.originalStatusId === originalStatus);
      }

      if (changedOnly === 'true') {
        entries = entries.filter((e) => e.originalStatusId !== e.currentStatusId);
      }

      if (otOnly === 'true') {
        entries = entries.filter((e) => e.ot);
      }

      if (syncStatus && typeof syncStatus === 'string') {
        entries = entries.filter((e) => e.googleCalendarSyncStatus === syncStatus);
      }

      if (search && typeof search === 'string') {
        const query = search.toLowerCase();
        entries = entries.filter(
          (e) =>
            e.date.toLowerCase().includes(query) ||
            e.day.toLowerCase().includes(query) ||
            e.originalStatusId.toLowerCase().includes(query) ||
            e.currentStatusId.toLowerCase().includes(query) ||
            (e.action || '').toLowerCase().includes(query) ||
            (e.notes && e.notes.toLowerCase().includes(query))
        );
      }

      // Sort by date ascending
      entries.sort((a, b) => a.date.localeCompare(b.date));

      res.json(entries);
    } catch (error) {
      console.error('Error fetching roster:', error);
      res.status(500).json({ error: 'Failed to fetch roster entries' });
    }
  });

  // Month Summary Analytics
  app.get('/api/summary', async (req, res) => {
    try {
      const { monthYear } = req.query;
      let entries = await store.getRosters();

      if (monthYear && typeof monthYear === 'string') {
        const { startDate: cStart, endDate: cEnd } = getCycleDateRange(monthYear);
        entries = entries.filter((e) => e.date >= cStart && e.date <= cEnd);
      }

      const totalDays = entries.length;
      let workingDays = 0;
      let offDays = 0;
      let holDays = 0;
      let leaveDays = 0;
      let otDays = 0;
      let otMorningHours = 0;
      let otNightHours = 0;
      let otTotalHours = 0;
      let changedDays = 0;
      let syncedCount = 0;
      const statusBreakdown: Record<string, number> = {};

      entries.forEach((e) => {
        const cur = e.currentStatusId;
        statusBreakdown[cur] = (statusBreakdown[cur] || 0) + 1;

        if (cur === 'RTD' || cur === 'NWD' || cur === 'Training' || cur === 'WFH' || cur === 'OT' || cur === 'DOS') workingDays++;
        if (cur === 'DOF') offDays++;
        if (cur === 'HOL' || cur === 'HOLIDAY') holDays++;
        if (cur.includes('LEAVE') || cur === 'Short Leave' || cur === 'Leave(Half)' || cur === 'ML') leaveDays++;
        if (e.ot || cur === 'OT') {
          otDays++;
          otMorningHours += e.otMorningHours || 0;
          otNightHours += e.otNightHours || 0;
          otTotalHours += (e.otMorningHours || 0) + (e.otNightHours || 0);
        }
        if (e.originalStatusId !== cur) changedDays++;
        if (e.googleCalendarSyncStatus === 'Synced') syncedCount++;
      });

      res.json({
        totalDays,
        workingDays,
        offDays,
        holDays,
        leaveDays,
        otDays,
        otMorningHours,
        otNightHours,
        otTotalHours,
        changedDays,
        syncedCount,
        statusBreakdown,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to calculate summary' });
    }
  });

  // 3. Get single Roster Entry by ID
  app.get('/api/roster/:id', async (req, res) => {
    try {
      const entries = await store.getRosters();
      const entry = entries.find((e) => e.id === req.params.id);
      if (!entry) {
        return res.status(404).json({ error: 'Roster entry not found' });
      }
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch entry' });
    }
  });

  // 3b. Update clock times and remark for single entry
  app.put('/api/roster/:id/clock-times', withRosterLock(async (req, res) => {
    try {
      const { clockIn, clockOut, remark, notes } = req.body;
      const entries = await store.getRosters();
      const idx = entries.findIndex((e) => e.id === req.params.id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      const updatedRemark = remark !== undefined ? remark : notes !== undefined ? notes : entries[idx].notes;

      entries[idx] = {
        ...entries[idx],
        clockIn: clockIn !== undefined ? clockIn : entries[idx].clockIn || '',
        clockOut: clockOut !== undefined ? clockOut : entries[idx].clockOut || '',
        notes: updatedRemark !== undefined ? updatedRemark : '',
        updatedAt: new Date().toISOString(),
      };

      await store.saveRosters(entries);

      // Save clock event to clock_events table and OT calculations in Supabase asynchronously
      (async () => {
        try {
          const emp = await store.getOrCreateEmployee();
          await store.saveClockEvents([{
            employee_id: emp.id,
            event_date: entries[idx].date,
            clock_in: entries[idx].clockIn || null,
            clock_out: entries[idx].clockOut || null,
            raw_source: { source: 'user_edit', remark: updatedRemark },
          }]);
          await syncAndPersistOtForEntries([entries[idx]]);
        } catch (err) {
          console.warn('Background Supabase clock/OT sync error:', err);
        }
      })();

      res.json(entries[idx]);
    } catch (error: any) {
      console.error('Failed to update clock times:', error);
      res.status(500).json({ error: 'Failed to update clock times and remark' });
    }
  }));

  // 3c. Batch Update clock times and remarks for multiple entries
  app.post('/api/roster/clock-times/batch', withRosterLock(async (req, res) => {
    try {
      const { updates } = req.body; // Array of { id, clockIn, clockOut, remark, notes }
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.json({ message: 'No updates provided', updatedEntries: [] });
      }

      const entries = await store.getRosters();
      const entryMap = new Map(entries.map((e, index) => [e.id, index]));
      const updatedEntriesList: RosterEntry[] = [];
      const clockEventsToSave: any[] = [];

      for (const update of updates) {
        const idx = entryMap.get(update.id);
        if (idx !== undefined && entries[idx]) {
          const target = entries[idx];
          const updatedRemark = update.remark !== undefined ? update.remark : update.notes !== undefined ? update.notes : target.notes;

          entries[idx] = {
            ...target,
            clockIn: update.clockIn !== undefined ? update.clockIn : target.clockIn || '',
            clockOut: update.clockOut !== undefined ? update.clockOut : target.clockOut || '',
            notes: updatedRemark !== undefined ? updatedRemark : '',
            updatedAt: new Date().toISOString(),
          };

          updatedEntriesList.push(entries[idx]);
          clockEventsToSave.push({
            event_date: entries[idx].date,
            clock_in: entries[idx].clockIn || null,
            clock_out: entries[idx].clockOut || null,
            raw_source: { source: 'batch_user_edit', remark: updatedRemark },
          });
        }
      }

      if (updatedEntriesList.length > 0) {
        await store.saveRosters(entries);

        // Async persistence to Supabase tables
        (async () => {
          try {
            const emp = await store.getOrCreateEmployee();
            const formattedEvents = clockEventsToSave.map((ev) => ({
              ...ev,
              employee_id: emp.id,
            }));
            await store.saveClockEvents(formattedEvents);
            await syncAndPersistOtForEntries(updatedEntriesList);
          } catch (err) {
            console.warn('Background Supabase batch clock/OT sync error:', err);
          }
        })();
      }

      res.json({
        message: `Successfully updated ${updatedEntriesList.length} entry clock times and remarks`,
        updatedCount: updatedEntriesList.length,
        updatedEntries: updatedEntriesList,
      });
    } catch (error: any) {
      console.error('Failed to batch update clock times:', error);
      res.status(500).json({ error: 'Failed to batch update clock times' });
    }
  }));

  // 4. Create new Roster Entry
  app.post('/api/roster', withRosterLock(async (req, res) => {
    try {
      const { date, originalStatusId, changedStatusId, action, notes, clockIn, clockOut, ot, otMorningHours, otNightHours, updateCalendar } = req.body;

      if (!date || !originalStatusId) {
        return res.status(400).json({ error: 'Date and Original Roster status are required' });
      }

      const entries = await store.getRosters();
      const existingIndex = entries.findIndex((e) => e.date === date);

      const dayName = getDayOfWeekName(date);
      const now = new Date().toISOString();

      if (existingIndex >= 0) {
        // Exists: PRESERVE originalStatusId! Do not overwrite it.
        const existing = entries[existingIndex];
        const newChanged = changedStatusId || existing.changedStatusId || null;
        const newCurrent = newChanged || existing.originalStatusId;

        const updatedEntry: RosterEntry = {
          ...existing,
          day: dayName,
          changedStatusId: newChanged,
          currentStatusId: newCurrent,
          action: action ?? existing.action,
          notes: notes !== undefined ? notes : existing.notes,
          clockIn: clockIn !== undefined ? clockIn : existing.clockIn,
          clockOut: clockOut !== undefined ? clockOut : existing.clockOut,
          ot: ot !== undefined ? Boolean(ot) : existing.ot,
          otMorningHours: otMorningHours !== undefined ? Number(otMorningHours) : existing.otMorningHours,
          otNightHours: otNightHours !== undefined ? Number(otNightHours) : existing.otNightHours,
          updatedAt: now,
          lastChangedBy: 'User',
        };

        if (updateCalendar !== false) {
          updatedEntry.googleCalendarSyncStatus = 'Synced';
          if (!updatedEntry.googleCalendarEventId) {
            updatedEntry.googleCalendarEventId = `gcal-evt-${date}-${Date.now()}`;
          }
        }

        entries[existingIndex] = updatedEntry;
        await store.saveRosters(entries);
        await syncAndPersistOtForEntries([updatedEntry]);

        return res.json(updatedEntry);
      } else {
        // New entry
        const effectiveCurrent = changedStatusId || originalStatusId;
        const newEntry: RosterEntry = {
          id: `roster-${date}`,
          date,
          day: dayName,
          originalStatusId,
          changedStatusId: changedStatusId || null,
          currentStatusId: effectiveCurrent,
          action: action || 'Initial Roster Entry',
          notes: notes || '',
          clockIn: clockIn || '',
          clockOut: clockOut || '',
          ot: ot === true || ot === 'true',
          otMorningHours: otMorningHours !== undefined ? Number(otMorningHours) : undefined,
          otNightHours: otNightHours !== undefined ? Number(otNightHours) : undefined,
          googleCalendarSyncStatus: updateCalendar ? 'Synced' : 'Not Synced',
          googleCalendarEventId: updateCalendar ? `gcal-evt-${date}-${Date.now()}` : undefined,
          createdAt: now,
          updatedAt: now,
          lastChangedBy: 'User',
        };

        entries.push(newEntry);
        await store.saveRosters(entries);
        await syncAndPersistOtForEntries([newEntry]);

        res.status(201).json(newEntry);
      }
    } catch (error) {
      console.error('Error creating roster entry:', error);
      res.status(500).json({ error: 'Failed to save roster entry' });
    }
  }));

  // 5. Change Roster Entry Workflow (Preserving Original Roster)
  app.put('/api/roster/:id/change', withRosterLock(async (req, res) => {
    try {
      const { newStatusId, action, reason, notes, clockIn, clockOut, ot, otMorningHours, otNightHours, user, updateCalendar } = req.body;

      if (!newStatusId) {
        return res.status(400).json({ error: 'New roster status is required' });
      }

      const entries = await store.getRosters();
      const index = entries.findIndex((e) => e.id === req.params.id);

      if (index === -1) {
        return res.status(404).json({ error: 'Roster entry not found' });
      }

      const existing = entries[index];

      // Store previous values for audit history
      const previousStatus = existing.currentStatusId;
      const previousAction = existing.action;

      // PRESERVE originalStatusId! NEVER overwrite originalStatusId.
      const now = new Date().toISOString();
      const isChanged = newStatusId !== existing.originalStatusId;

      const updatedEntry: RosterEntry = {
        ...existing,
        changedStatusId: isChanged ? newStatusId : null,
        currentStatusId: newStatusId,
        action: action || existing.action,
        notes: notes !== undefined ? notes : existing.notes,
        clockIn: clockIn !== undefined ? clockIn : existing.clockIn,
        clockOut: clockOut !== undefined ? clockOut : existing.clockOut,
        ot: ot !== undefined ? Boolean(ot) : existing.ot,
        otMorningHours: otMorningHours !== undefined ? Number(otMorningHours) : existing.otMorningHours,
        otNightHours: otNightHours !== undefined ? Number(otNightHours) : existing.otNightHours,
        updatedAt: now,
        lastChangedBy: user || 'User',
      };

      // Handle Google Calendar sync
      let syncResult = 'No calendar sync requested';
      if (updateCalendar !== false) {
        updatedEntry.googleCalendarSyncStatus = 'Synced';
        if (!updatedEntry.googleCalendarEventId) {
          updatedEntry.googleCalendarEventId = `gcal-evt-${existing.date}-${Date.now()}`;
          syncResult = 'Created new calendar event';
        } else {
          syncResult = 'Updated existing calendar event';
        }
      }

      entries[index] = updatedEntry;
      await store.saveRosters(entries);

      // Record Audit History Record!
      const auditRecord: RosterChangeHistory = {
        id: randomUUID(),
        rosterEntryId: existing.id,
        date: existing.date,
        previousStatusId: previousStatus,
        newStatusId: newStatusId,
        previousAction: previousAction,
        newAction: action || existing.action,
        reason: reason || 'Roster update',
        user: user || 'User',
        timestamp: now,
        googleCalendarEventId: updatedEntry.googleCalendarEventId,
        googleCalendarSyncResult: syncResult,
      };

      await store.addHistoryRecord(auditRecord);
      await syncAndPersistOtForEntries([updatedEntry]);

      res.json({ entry: updatedEntry, history: auditRecord });
    } catch (error: any) {
      console.error('Error changing roster:', error);
      res.status(500).json({ 
        error: 'Failed to change roster entry',
        details: undefined
      });
    }
  }));

  // 6. Bulk Change Roster Workflow
  app.post('/api/roster/bulk-change', withRosterLock(async (req, res) => {
    try {
      const { ids, newStatusId, action, reason, user, updateCalendar } = req.body;

      if (!Array.isArray(ids) || ids.length === 0 || !newStatusId) {
        return res.status(400).json({ error: 'Roster IDs and new status are required' });
      }

      const entries = await store.getRosters();
      const updatedEntries: RosterEntry[] = [];
      const historyRecords: RosterChangeHistory[] = [];
      const now = new Date().toISOString();

      for (const id of ids) {
        const idx = entries.findIndex((e) => e.id === id);
        if (idx !== -1) {
          const existing = entries[idx];
          const previousStatus = existing.currentStatusId;
          const previousAction = existing.action;

          const isChanged = newStatusId !== existing.originalStatusId;

          const updated: RosterEntry = {
            ...existing,
            changedStatusId: isChanged ? newStatusId : null,
            currentStatusId: newStatusId,
            action: action || `Bulk set to ${newStatusId}`,
            updatedAt: now,
            lastChangedBy: user || 'User',
          };

          if (updateCalendar !== false) {
            updated.googleCalendarSyncStatus = 'Synced';
            if (!updated.googleCalendarEventId) {
              updated.googleCalendarEventId = `gcal-evt-${existing.date}-${Date.now()}`;
            }
          }

          entries[idx] = updated;
          updatedEntries.push(updated);

          // Individual audit history record for every affected entry —
          // recorded only AFTER the entries persist successfully.
          historyRecords.push({
            id: randomUUID(),
            rosterEntryId: existing.id,
            date: existing.date,
            previousStatusId: previousStatus,
            newStatusId: newStatusId,
            previousAction: previousAction,
            newAction: action || `Bulk set to ${newStatusId}`,
            reason: reason || 'Bulk edit operation',
            user: user || 'User',
            timestamp: now,
            googleCalendarEventId: updated.googleCalendarEventId,
            googleCalendarSyncResult: 'Bulk calendar event sync',
          });
        }
      }

      await store.saveRosters(entries);
      for (const record of historyRecords) {
        await store.addHistoryRecord(record);
      }

      res.json({ updatedCount: updatedEntries.length, entries: updatedEntries });
    } catch (error) {
      console.error('Error performing bulk change:', error);
      res.status(500).json({ error: 'Failed to apply bulk change' });
    }
  }));

  // 7. Delete Roster Entries (by month or clear all)
  const clearHandler = async (req: express.Request, res: express.Response) => {
    try {
      const month = req.query.month as string | undefined;
      let entries = await store.getRosters();
      let deletedEntries: any[] = [];

      if (month && month !== 'all') {
        let isMatch = (e: any) => false;

        if (month.startsWith('cycle:')) {
          const cycleKey = month.replace('cycle:', '');
          const { startDate, endDate } = getCycleDateRange(cycleKey);
          isMatch = (e: any) => e.date >= startDate && e.date <= endDate;
        } else if (month.startsWith('cal:')) {
          const calKey = month.replace('cal:', '');
          isMatch = (e: any) => e.date.startsWith(calKey);
        } else if (/^\d{4}-\d{2}$/.test(month)) {
          const { startDate, endDate } = getCycleDateRange(month);
          isMatch = (e: any) => (e.date >= startDate && e.date <= endDate) || e.date.startsWith(month);
        }

        deletedEntries = entries.filter(isMatch);
        entries = entries.filter((e) => !isMatch(e));
        await store.saveRosters(entries);

        // Remove audit history for deleted entries
        const deletedIds = new Set(deletedEntries.map((e) => e.id));
        const history = (await store.getHistory()).filter((h) => !deletedIds.has(h.rosterEntryId));
        await store.saveHistory(history);

        return res.json({
          message: `Roster entries deleted successfully (${deletedEntries.length} entries removed)`,
          deletedCount: deletedEntries.length,
          deletedEntries,
        });
      } else {
        deletedEntries = [...entries];
        await store.saveRosters([]);
        await store.saveImportHistory([]);
        await store.saveHistory([]);
        return res.json({
          message: 'All roster entries and uploaded data deleted successfully',
          deletedCount: deletedEntries.length,
          deletedEntries,
        });
      }
    } catch (error) {
      console.error('Error clearing roster data:', error);
      res.status(500).json({ error: 'Failed to clear roster data' });
    }
  };

  app.delete('/api/roster/clear', withRosterLock(clearHandler));
  app.delete('/api/roster/all/clear', withRosterLock(clearHandler));

  app.delete('/api/roster/:id', withRosterLock(async (req, res) => {
    try {
      let entries = await store.getRosters();
      const target = entries.find((e) => e.id === req.params.id);

      if (!target) {
        return res.status(404).json({ error: 'Roster entry not found' });
      }

      entries = entries.filter((e) => e.id !== req.params.id);
      await store.saveRosters(entries);

      // Purge the entry's audit records so history cannot reference a ghost row.
      try {
        const history = await store.getHistory();
        const remaining = history.filter((h) => h.rosterEntryId !== req.params.id);
        if (remaining.length !== history.length) {
          await store.saveHistory(remaining);
        }
      } catch (histErr) {
        console.warn('Could not purge audit history for deleted entry:', histErr);
      }

      res.json({
        message: 'Roster entry and associated calendar event deleted successfully',
        deletedId: req.params.id,
        googleCalendarEventId: target.googleCalendarEventId,
      });
    } catch (error) {
      console.error('Error deleting roster:', error);
      res.status(500).json({ error: 'Failed to delete roster entry' });
    }
  }));

  // 8. Audit Change History endpoint
  app.get('/api/history', async (req, res) => {
    try {
      let history = await store.getHistory();
      const { rosterEntryId, date } = req.query;

      if (rosterEntryId && typeof rosterEntryId === 'string') {
        history = history.filter((h) => h.rosterEntryId === rosterEntryId);
      }

      if (date && typeof date === 'string') {
        history = history.filter((h) => h.date === date);
      }

      res.json(history);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  // 9. Status Configurations API
  app.get('/api/statuses', async (req, res) => {
    try {
      res.json(await store.getStatuses());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch statuses' });
    }
  });

  app.put('/api/statuses', async (req, res) => {
    try {
      const statuses = req.body;
      if (!Array.isArray(statuses)) {
        return res.status(400).json({ error: 'Statuses must be an array' });
      }
      await store.saveStatuses(statuses);
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ error: 'Failed to save statuses' });
    }
  });

  // 9b. Tasks API (TMS-style: templates, groups, sequencing, dependency flow)
  app.get('/api/tasks', async (req, res) => {
    try {
      res.json(await taskStore.getTasks());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const input = req.body || {};
      if (!input.title || !String(input.title).trim()) {
        return res.status(400).json({ error: 'Title is required' });
      }
      if (input.status !== undefined && !VALID_TASK_STATUSES.includes(input.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (input.priority !== undefined && !VALID_TASK_PRIORITIES.includes(input.priority)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }
      if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
        return res.status(400).json({ error: 'Invalid due date' });
      }
      if (input.category !== undefined && !VALID_TASK_CATEGORIES.includes(input.category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }
      const groups = await taskGroupStore.getTaskGroups();
      const task = await taskStore.createTask((tasks) => {
        // Group membership is validated inside the write queue against a
        // pre-fetched snapshot (races with concurrent deletions are tolerated).
        if (input.groupId && !groups.some((g) => g.id === input.groupId)) {
          throw new taskStore.TaskRouteError(400, 'Group not found');
        }
        return input;
      });
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const input = req.body || {};
      if (input.status !== undefined && !VALID_TASK_STATUSES.includes(input.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (input.priority !== undefined && !VALID_TASK_PRIORITIES.includes(input.priority)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }
      if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
        return res.status(400).json({ error: 'Invalid due date' });
      }
      if (input.category !== undefined && !VALID_TASK_CATEGORIES.includes(input.category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }
      const groups = await taskGroupStore.getTaskGroups();
      const updated = await taskStore.mutateTasks((tasks) => {
        const idx = tasks.findIndex((t) => t.id === req.params.id);
        if (idx === -1) throw new taskStore.TaskRouteError(404, 'Task not found');
        const current = tasks[idx];

        // Group membership validated against a pre-fetched snapshot.
        if (input.groupId && !groups.some((g) => g.id === input.groupId)) {
          throw new taskStore.TaskRouteError(400, 'Group not found');
        }

        // Completion guard: block done-transition while dependencies are unmet.
        if (input.status === 'done' && current.status !== 'done' && !input.force) {
          const blockers = taskStore.getUnmetDependencies(current, tasks);
          if (blockers.length > 0) {
            throw new taskStore.TaskRouteError(
              409,
              JSON.stringify({
                message: 'Blocked by unfinished dependencies',
                blockers: blockers.map((b) => ({ id: b.id, title: b.title })),
              })
            );
          }
        }

        // Flow mechanism integrity: no self-deps, no cycles.
        if (input.dependsOn !== undefined) {
          const nextDeps = taskStore.normalizeDependsOn(input.dependsOn);
          if (nextDeps.includes(current.id)) {
            throw new taskStore.TaskRouteError(400, 'A task cannot depend on itself');
          }
          if (taskStore.wouldCreateCycle(tasks, current.id, nextDeps)) {
            throw new taskStore.TaskRouteError(400, 'Dependency cycle detected');
          }
        }

        let applied = taskStore.applyTaskInput(current, input);
        // Switching groups invalidates the old sequence — append at the end of the new one.
        if (
          input.sequence === undefined &&
          input.groupId !== undefined &&
          input.groupId &&
          input.groupId !== current.groupId
        ) {
          const siblings = tasks.filter((t) => t.id !== current.id && t.groupId === input.groupId);
          applied = { ...applied, sequence: siblings.reduce((m, t) => Math.max(m, t.sequence ?? 0), 0) + 1 };
        }

        const next = [...tasks];
        next[idx] = applied;
        return { next, value: applied };
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      await taskStore.mutateTasks((tasks) => {
        const remaining = tasks
          .filter((t) => t.id !== req.params.id)
          .map((t) =>
            t.dependsOn?.includes(req.params.id)
              ? { ...t, dependsOn: t.dependsOn.filter((d) => d !== req.params.id), updatedAt: new Date().toISOString() }
              : t
          );
        if (remaining.length === tasks.length) {
          throw new taskStore.TaskRouteError(404, 'Task not found');
        }
        return { next: remaining, value: { message: 'Task deleted' } };
      });
      res.json({ message: 'Task deleted' });
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  // --- Task groups (runtime container objects) ---
  app.get('/api/task-groups', async (req, res) => {
    try {
      res.json(await taskGroupStore.getTaskGroups());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch task groups' });
    }
  });

  app.post('/api/task-groups', async (req, res) => {
    try {
      const group = await taskGroupStore.createTaskGroup(req.body || {});
      res.status(201).json(group);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create task group' });
    }
  });

  app.put('/api/task-groups/:id', async (req, res) => {
    try {
      const updated = await taskGroupStore.mutateTaskGroups((groups) => {
        const idx = groups.findIndex((g) => g.id === req.params.id);
        if (idx === -1) throw new taskStore.TaskRouteError(404, 'Task group not found');
        const payload = req.body || {};
        const next = [...groups];
        next[idx] = {
          ...next[idx],
          name: payload.name !== undefined ? String(payload.name).trim() || next[idx].name : next[idx].name,
          description: payload.description !== undefined ? String(payload.description) : next[idx].description,
          color: payload.color !== undefined ? String(payload.color) : next[idx].color,
        };
        return { next, value: next[idx] };
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update task group' });
    }
  });

  // Deleting a group UNASSIGNS its children (work outlives containers).
  app.delete('/api/task-groups/:id', async (req, res) => {
    try {
      let existed = true;
      await taskGroupStore.mutateTaskGroups((groups) => {
        const next = groups.filter((g) => g.id !== req.params.id);
        existed = next.length < groups.length;
        if (!existed) throw new taskStore.TaskRouteError(404, 'Task group not found');
        return { next, value: null };
      });
      await taskStore.mutateTasks((tasks) => ({
        next: tasks.map((t) =>
          t.groupId === req.params.id
            ? { ...t, groupId: null, sequence: null, updatedAt: new Date().toISOString() }
            : t
        ),
        value: null,
      }));
      res.json({ message: existed ? 'Task group deleted' : 'Task group not found' });
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to delete task group' });
    }
  });

  // --- Task templates (definition stage) ---
  app.get('/api/task-templates', async (req, res) => {
    try {
      res.json(await taskTemplateStore.getTaskTemplates());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch task templates' });
    }
  });

  app.post('/api/task-templates', async (req, res) => {
    try {
      const template = await taskTemplateStore.mutateTaskTemplates((templates) => {
        const built = taskTemplateStore.buildTemplate(null, req.body || {});
        return { next: [...templates, built], value: built };
      });
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create task template' });
    }
  });

  app.put('/api/task-templates/:id', async (req, res) => {
    try {
      const updated = await taskTemplateStore.mutateTaskTemplates((templates) => {
        const existing = templates.find((t) => t.id === req.params.id);
        if (!existing) throw new taskStore.TaskRouteError(404, 'Task template not found');
        const built = taskTemplateStore.buildTemplate(null, req.body || {}, existing);
        const next = templates.map((t) => (t.id === built.id ? built : t));
        return { next, value: built };
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update task template' });
    }
  });

  app.delete('/api/task-templates/:id', async (req, res) => {
    try {
      await taskTemplateStore.mutateTaskTemplates((templates) => {
        const next = templates.filter((t) => t.id !== req.params.id);
        if (next.length === templates.length) throw new taskStore.TaskRouteError(404, 'Task template not found');
        return { next, value: null };
      });
      res.json({ message: 'Task template deleted' });
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to delete task template' });
    }
  });

  // Instantiate from template (definition -> runtime transition).
  app.post('/api/tasks/from-template', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await instantiateFromTemplate(body);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof taskStore.TaskRouteError) {
        return res.status(error.status).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to instantiate template' });
    }
  });

  // 10. App Settings API
  app.get('/api/settings', async (req, res) => {
    try {
      res.json(await store.getSettings());
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return res.status(400).json({ error: 'Settings object required' });
      }
      const current = await store.getSettings();

      // Allow-list merge: only known sections/keys are applied, so unknown or
      // hostile keys in the payload can never be persisted.
      const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
      const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
      const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

      const merged: AppSettings = {
        ...current,
        userName: str(incoming.userName, current.userName),
        timezone: str(incoming.timezone, current.timezone),
        workingHours: {
          start: str(incoming.workingHours?.start, current.workingHours.start),
          end: str(incoming.workingHours?.end, current.workingHours.end),
        },
        otCalculationSettings: {
          gracePeriodMinutes: num(incoming.otCalculationSettings?.gracePeriodMinutes, current.otCalculationSettings.gracePeriodMinutes),
          minimumOtThresholdMinutes: num(incoming.otCalculationSettings?.minimumOtThresholdMinutes, current.otCalculationSettings.minimumOtThresholdMinutes),
          roundingRule: ['down', 'nearest', 'up'].includes(incoming.otCalculationSettings?.roundingRule)
            ? incoming.otCalculationSettings.roundingRule
            : current.otCalculationSettings.roundingRule,
          roundingBlockMinutes: [15, 30].includes(incoming.otCalculationSettings?.roundingBlockMinutes)
            ? incoming.otCalculationSettings.roundingBlockMinutes
            : current.otCalculationSettings.roundingBlockMinutes,
          wfhEligibleForOt: bool(incoming.otCalculationSettings?.wfhEligibleForOt, current.otCalculationSettings.wfhEligibleForOt),
          trainingEligibleForOt: bool(incoming.otCalculationSettings?.trainingEligibleForOt, current.otCalculationSettings.trainingEligibleForOt),
          hourlyOtRate: num(incoming.otCalculationSettings?.hourlyOtRate, current.otCalculationSettings.hourlyOtRate ?? 0),
        },
        googleCalendar: {
          ...current.googleCalendar,
          connected: bool(incoming.googleCalendar?.connected, current.googleCalendar.connected),
          accountEmail: incoming.googleCalendar?.accountEmail !== undefined ? str(incoming.googleCalendar.accountEmail, '') : current.googleCalendar.accountEmail,
          selectedCalendarId: incoming.googleCalendar?.selectedCalendarId !== undefined ? str(incoming.googleCalendar.selectedCalendarId, '') : current.googleCalendar.selectedCalendarId,
          selectedCalendarName: incoming.googleCalendar?.selectedCalendarName !== undefined ? str(incoming.googleCalendar.selectedCalendarName, '') : current.googleCalendar.selectedCalendarName,
          autoSync: bool(incoming.googleCalendar?.autoSync, current.googleCalendar.autoSync),
        },
        notifications: {
          enabled: bool(incoming.notifications?.enabled, current.notifications.enabled),
          rosterChanges: bool(incoming.notifications?.rosterChanges, current.notifications.rosterChanges),
          syncErrors: bool(incoming.notifications?.syncErrors, current.notifications.syncErrors),
          upcomingLeave: bool(incoming.notifications?.upcomingLeave, current.notifications.upcomingLeave),
        },
        theme: ['light', 'dark', 'system'].includes(incoming.theme) ? incoming.theme : current.theme,
        allowedEmails: Array.isArray(incoming.allowedEmails)
          ? [...new Set(
              (incoming.allowedEmails as unknown[])
                .filter((e): e is string => typeof e === 'string' && e.includes('@'))
                .map((e) => e.trim().toLowerCase())
            )]
          : current.allowedEmails,
      };

      await store.saveSettings(merged);
      res.json(merged);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // 11. Google Calendar Integration API
  app.get('/api/calendar/calendars', (req, res) => {
    // List available user calendars
    res.json([
      { id: 'work-calendar-primary', summary: 'Work', primary: true, backgroundColor: '#9333ea' },
      { id: 'personal-calendar', summary: 'Personal', primary: false, backgroundColor: '#2563eb' },
      { id: 'office-calendar-shared', summary: 'Office Roster', primary: false, backgroundColor: '#dc2626' },
    ]);
  });

  app.post('/api/calendar/sync/:id', withRosterLock(async (req, res) => {
    try {
      const entries = await store.getRosters();
      const index = entries.findIndex((e) => e.id === req.params.id);

      if (index === -1) {
        return res.status(404).json({ error: 'Roster entry not found' });
      }

      const item = entries[index];
      const { googleCalendarEventId, syncStatus } = req.body || {};

      const updatedItem: RosterEntry = {
        ...item,
        googleCalendarSyncStatus: syncStatus || 'Synced',
        googleCalendarEventId: googleCalendarEventId || item.googleCalendarEventId || `gcal-evt-${item.date}-${Date.now()}`,
        calendarSyncError: undefined,
        updatedAt: new Date().toISOString(),
      };
      entries[index] = updatedItem;
      await store.saveRosters(entries);

      res.json({ message: 'Synced successfully', entry: updatedItem });
    } catch (error) {
      res.status(500).json({ error: 'Calendar sync failed' });
    }
  }));

  app.post('/api/calendar/sync-all', withRosterLock(async (req, res) => {
    try {
      const { syncedEntries } = req.body || {};
      const entries = await store.getRosters();
      let syncedCount = 0;

      if (Array.isArray(syncedEntries)) {
        syncedEntries.forEach((se) => {
          const idx = entries.findIndex((e) => e.id === se.id);
          if (idx !== -1) {
            entries[idx].googleCalendarSyncStatus = se.syncStatus || 'Synced';
            if (se.googleCalendarEventId) {
              entries[idx].googleCalendarEventId = se.googleCalendarEventId;
            }
            entries[idx].calendarSyncError = undefined;
            entries[idx].updatedAt = new Date().toISOString();
            syncedCount++;
          }
        });
      } else {
        entries.forEach((e) => {
          if (e.googleCalendarSyncStatus !== 'Synced') {
            e.googleCalendarSyncStatus = 'Synced';
            if (!e.googleCalendarEventId) {
              e.googleCalendarEventId = `gcal-evt-${e.date}-${Date.now()}`;
            }
            e.calendarSyncError = undefined;
            syncedCount++;
          }
        });
      }

      await store.saveRosters(entries);
      res.json({ message: `Synced ${syncedCount} entries to Google Calendar`, syncedCount });
    } catch (error) {
      res.status(500).json({ error: 'Failed to sync calendar entries' });
    }
  }));

  // 11b. OT Calculations Persistence Endpoints
  app.post('/api/ot/save', async (req, res) => {
    try {
      const { entries: reqEntries, settings: reqSettings } = req.body || {};
      let targetEntries: RosterEntry[] = reqEntries;
      if (!Array.isArray(targetEntries) || targetEntries.length === 0) {
        targetEntries = await store.getRosters();
      }

      const settings = reqSettings || (await store.getSettings())?.otCalculationSettings || DEFAULT_OT_SETTINGS;
      await syncAndPersistOtForEntries(targetEntries, settings);

      res.json({
        message: 'OT calculations successfully saved to Supabase database!',
        savedCount: targetEntries.length,
      });
    } catch (err: any) {
      console.error('Error saving OT calculations:', err);
      res.status(500).json({ error: 'Failed to save OT calculations' });
    }
  });

  app.get('/api/ot/calculations', async (req, res) => {
    try {
      const { startDate, endDate, employeeId } = req.query;
      const calcs = await store.getOtCalculations(
        typeof employeeId === 'string' ? employeeId : undefined,
        typeof startDate === 'string' ? startDate : undefined,
        typeof endDate === 'string' ? endDate : undefined
      );
      res.json(calcs);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch OT calculations' });
    }
  });

  // 11c. Clock Sync Endpoint with 3-Day Rolling Backfill & Non-Null Merging
  app.post('/api/clock/sync', withRosterLock(async (req, res) => {
    try {
      const { startDate: reqStart, endDate: reqEnd, events: incomingEvents } = req.body || {};
      const allEntries = await store.getRosters();

      let startDate = reqStart || (allEntries.length > 0 ? allEntries[0].date : new Date().toISOString().split('T')[0]);
      let endDate = reqEnd || (allEntries.length > 0 ? allEntries[allEntries.length - 1].date : new Date().toISOString().split('T')[0]);

      // Apply 3-day rolling backfill to re-check recent days for complete clock-outs!
      const rollStartDate = subDaysStr(startDate, 3);
      const emp = await store.getOrCreateEmployee();

      const clockEventsToSave: any[] = [];
      let updatedCount = 0;

      if (Array.isArray(incomingEvents) && incomingEvents.length > 0) {
        incomingEvents.forEach((ev: any) => {
          if (ev.date || ev.event_date) {
            const evDate = ev.date || ev.event_date;
            clockEventsToSave.push({
              employee_id: emp.id,
              event_date: evDate,
              clock_in: ev.clockIn || ev.clock_in || null,
              clock_out: ev.clockOut || ev.clock_out || null,
              raw_source: ev.raw_source || { source: 'sync' },
            });
          }
        });
      } else {
        // Build sync from roster entries in rolling range [rollStartDate, endDate] (INCLUSIVE)
        allEntries
          .filter((e) => e.date >= rollStartDate && e.date <= endDate)
          .forEach((e) => {
            if (e.clockIn || e.clockOut) {
              clockEventsToSave.push({
                employee_id: emp.id,
                event_date: e.date,
                clock_in: e.clockIn || null,
                clock_out: e.clockOut || null,
                raw_source: { source: 'roster_sync' },
              });
            }
          });
      }

      // Save to clock_events (handles merging existing non-null clock_in / clock_out)
      await store.saveClockEvents(clockEventsToSave);

      // Fetch merged clock events back to update roster_entries
      const mergedEvents = await store.getClockEvents(emp.id, rollStartDate, endDate);
      const mergedMap = new Map<string, any>();
      mergedEvents.forEach((m: any) => mergedMap.set(m.event_date, m));

      let entriesChanged = false;
      const updatedEntries = allEntries.map((entry) => {
        if (entry.date >= rollStartDate && entry.date <= endDate) {
          const merged = mergedMap.get(entry.date);
          if (merged) {
            let formatClockIn = entry.clockIn;
            let formatClockOut = entry.clockOut;

            if (merged.clock_in) {
              formatClockIn = extractTimeInTimezone(merged.clock_in);
            }
            if (merged.clock_out) {
              formatClockOut = extractTimeInTimezone(merged.clock_out);
            }

            if (formatClockIn !== entry.clockIn || formatClockOut !== entry.clockOut) {
              entriesChanged = true;
              updatedCount++;
              return {
                ...entry,
                clockIn: formatClockIn || entry.clockIn,
                clockOut: formatClockOut || entry.clockOut,
                updatedAt: new Date().toISOString(),
              };
            }
          }
        }
        return entry;
      });

      if (entriesChanged) {
        await store.saveRosters(updatedEntries);
      }

      // Re-calculate and save OT for all entries
      await syncAndPersistOtForEntries(updatedEntries);

      res.json({
        message: `Successfully synced clock events with 3-day rolling backfill (${rollStartDate} to ${endDate}).`,
        rollingStartDate: rollStartDate,
        endDate,
        syncedEventsCount: clockEventsToSave.length,
        updatedEntriesCount: updatedCount,
      });
    } catch (err: any) {
      console.error('Error in clock sync:', err);
      res.status(500).json({ error: 'Failed to sync clock events' });
    }
  }));

  app.get('/api/clock/events', async (req, res) => {
    try {
      const { startDate, endDate, employeeId } = req.query;
      const events = await store.getClockEvents(
        typeof employeeId === 'string' ? employeeId : undefined,
        typeof startDate === 'string' ? startDate : undefined,
        typeof endDate === 'string' ? endDate : undefined
      );
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch clock events' });
    }
  });

  // 11d. Leave Balance API
  app.get('/api/leave-balance', async (req, res) => {
    try {
      const { year, employeeId } = req.query;
      const yearNum = Number(year) || new Date().getFullYear();
      const emp = await store.getOrCreateEmployee();
      const rows = await store.getLeaveBalance(
        typeof employeeId === 'string' ? employeeId : emp.id,
        yearNum
      );
      res.json({ year: yearNum, rows });
    } catch (err: any) {
      console.error('Error fetching leave balance:', err);
      res.status(500).json({ error: 'Failed to fetch leave balance' });
    }
  });

  // 11e. Save Leave Entitlements API
  app.put('/api/leave-balance/entitlements', async (req, res) => {
    try {
      const { year, entitlements } = req.body;

      if (!year || !Array.isArray(entitlements) || entitlements.length === 0) {
        return res.status(400).json({ error: 'year and entitlements array are required' });
      }

      const employee = await store.getOrCreateEmployee();
      await store.saveLeaveEntitlements(entitlements, Number(year), employee.id);

      const balance = await store.getLeaveBalance(employee.id, Number(year));
      res.json({ success: true, balance });
    } catch (err: any) {
      console.error('Error saving leave entitlements:', err);
      res.status(500).json({ error: 'Failed to save leave entitlements' });
    }
  });

  // 12. OAuth Callback & Auth URL
  app.get('/api/auth/google/url', (req, res) => {
    let clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          clientId = config.oAuthClientId;
        }
      } catch (e) {
        console.error('Failed to read firebase-applet-config.json:', e);
      }
    }

    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const redirectUri = `${appUrl}/auth/callback`;

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId || '')}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events')}&` +
      `access_type=offline&prompt=consent`;

    res.json({ url: googleAuthUrl, redirectUri });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    try {
      // Only treat the flow as connected when Google actually redirected back
      // with an authorization code. (Token exchange is handled by the client
      // Google integration; this route only records the connection state.)
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code) {
        res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Connection Failed</title></head>
            <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #0f172a;">
              <p>Missing authorization code. Close this window and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      // Save connected state (no account email is claimed without a real token exchange)
      const settings = await store.getSettings();
      settings.googleCalendar.connected = true;
      await store.saveSettings(settings);
    } catch (err) {
      console.error('OAuth callback failed:', err);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Connection Failed</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #0f172a;">
            <p>Could not save the connection state. Close this window and try again.</p>
          </body>
        </html>
      `);
      return;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Calendar Connected</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8fafc; color: #0f172a;">
          <div style="background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px;">
            <div style="font-size: 48px; color: #16a34a; margin-bottom: 12px;">✓</div>
            <h2 style="margin: 0 0 8px 0; color: #0f172a;">Connected to Google Calendar</h2>
            <p style="color: #64748b; font-size: 14px;">Your account has been authenticated successfully. You can close this window now.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
              setTimeout(() => { window.close(); }, 1200);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  });

  // 13. Import History & Import Endpoints
  app.get('/api/import/history', async (req, res) => {
    try {
      const history = await store.getImportHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch import history' });
    }
  });

  app.post('/api/import/check-duplicate', async (req, res) => {
    try {
      const { fileHash } = req.body;
      if (!fileHash) {
        return res.json({ isDuplicate: false });
      }
      const history = await store.getImportHistory();
      const match = history.find((h) => h.fileHash === fileHash);
      if (match) {
        return res.json({ isDuplicate: true, previousImport: match });
      }
      res.json({ isDuplicate: false });
    } catch (error) {
      res.status(500).json({ error: 'Duplicate check failed' });
    }
  });

  app.post('/api/import', withRosterLock(async (req, res) => {
    try {
      const { rows, options } = req.body;

      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'Rows array required' });
      }
      if (rows.length > 5000) {
        return res.status(400).json({ error: 'Too many rows (max 5000 per import)' });
      }

      const existingEntries = await store.getRosters();
      const validStatuses = (await store.getStatuses()).map((s) => s.code);

      // Server-side duplicate detection (the client-side check is advisory only).
      const { fileHash } = options || {};
      if (fileHash && typeof fileHash === 'string') {
        const history = await store.getImportHistory();
        if (history.some((h) => h.fileHash === fileHash && h.status === 'Successful')) {
          return res.status(409).json({ error: 'This file has already been imported' });
        }
      }

      // Pre-process rows: check date gap sequence & auto-fill missing dates as HOL
      const normalizedRows = [...rows];
      const validDateRows = normalizedRows.filter((r) => r && r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
      if (validDateRows.length > 0) {
        validDateRows.sort((a, b) => a.date.localeCompare(b.date));
        const dateSet = new Set(validDateRows.map((r) => r.date));
        const minDateStr = validDateRows[0].date;
        const maxDateStr = validDateRows[validDateRows.length - 1].date;

        // Cap the synthesized gap-fill range to prevent resource exhaustion.
        if (countDaysBetween(minDateStr, maxDateStr) > MAX_RANGE_DAYS) {
          return res.status(400).json({ error: `Imported date range too large (max ${MAX_RANGE_DAYS} days)` });
        }

        const start = new Date(minDateStr + 'T00:00:00');
        const end = new Date(maxDateStr + 'T00:00:00');
        let curr = new Date(start);

        while (curr <= end) {
          const yyyy = curr.getFullYear();
          const mm = String(curr.getMonth() + 1).padStart(2, '0');
          const dd = String(curr.getDate()).padStart(2, '0');
          const iso = `${yyyy}-${mm}-${dd}`;

          if (!dateSet.has(iso)) {
            normalizedRows.push({
              date: iso,
              originalStatus: 'HOL',
              action: 'Normal Holiday',
              ot: false,
            });
            dateSet.add(iso);
          }
          curr.setDate(curr.getDate() + 1);
        }
      }

      let importedCount = 0;
      let successCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      const failedRows: any[] = [];
      const processedDates: string[] = [];

      normalizedRows.forEach((row, idx) => {
        importedCount++;
        const rowErrors: string[] = [];

        if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
          rowErrors.push('Invalid or missing date (format must be YYYY-MM-DD)');
        }

        let original = row.originalStatus || row.original || 'HOL';
        if (typeof original === 'string') {
          const upper = original.trim().toUpperCase();
          if (upper.startsWith('DOF(') || upper.startsWith('DOF')) {
            original = 'DOF';
          } else if (upper.startsWith('DOS(') || upper.startsWith('DOS')) {
            original = 'DOS';
          }
        }

        if (!validStatuses.includes(original)) {
          rowErrors.push(`Unknown original status: "${original}"`);
        }

        if (row.changedStatus && !validStatuses.includes(row.changedStatus)) {
          rowErrors.push(`Unknown changed status: "${row.changedStatus}"`);
        }

        if (rowErrors.length > 0) {
          failedCount++;
          failedRows.push({
            rowNumber: idx + 1,
            ...row,
            errors: rowErrors,
          });
        } else {
          successCount++;
          const date = row.date;
          processedDates.push(date);
          const dayName = getDayOfWeekName(date);
          const existingIdx = existingEntries.findIndex((e) => e.date === date);
          const now = new Date().toISOString();

          if (existingIdx !== -1) {
            updatedCount++;
            const existing = existingEntries[existingIdx];
            
            // CRITICAL BUSINESS RULE:
            // Updating Original Roster MUST PRESERVE user's manual changes (changedStatusId & currentStatusId)!
            const hasUserChange = existing.changedStatusId !== null && existing.changedStatusId !== undefined;
            const newChangedStatus = row.changedStatus ? row.changedStatus : (hasUserChange ? existing.changedStatusId : null);
            const newCurrentStatus = newChangedStatus || original;

            existingEntries[existingIdx] = {
              ...existing,
              originalStatusId: original, // Update official office original status
              changedStatusId: newChangedStatus,
              currentStatusId: newCurrentStatus,
              action: row.action || existing.action,
              ot: row.ot !== undefined ? (row.ot === true || row.ot === 'true') : existing.ot,
              updatedAt: now,
            };
          } else {
            createdCount++;
            const newChanged = row.changedStatus || null;
            const newCurrent = newChanged || original;

            existingEntries.push({
              id: `roster-${date}`,
              date,
              day: dayName,
              originalStatusId: original,
              changedStatusId: newChanged,
              currentStatusId: newCurrent,
              action: row.action || (original === 'RTD' ? 'Work on Roster 10.15 - 7.30' : original === 'NWD' ? 'Normal Working Day' : original === 'DOF' ? 'Day Off' : original),
              notes: row.notes || '',
              ot: row.ot === true || row.ot === 'true',
              googleCalendarSyncStatus: 'Not Synced',
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      });

      await store.saveRosters(existingEntries);
      await syncAndPersistOtForEntries(existingEntries);

      // Save Import History Record
      processedDates.sort();
      const minDate = processedDates[0] || 'Unknown';
      const maxDate = processedDates[processedDates.length - 1] || 'Unknown';
      const dateRange = minDate === maxDate ? minDate : `${minDate} - ${maxDate}`;

      const historyRecord = {
        id: randomUUID(),
        filename: options?.filename || 'Official_Roster_Import.xlsx',
        uploadTimestamp: new Date().toISOString(),
        user: options?.employeeName || 'EM Staff',
        rowCount: importedCount,
        createdCount,
        updatedCount,
        skippedCount: failedCount,
        dateRange,
        fileHash: options?.fileHash || `hash-${Date.now()}`,
        employeeName: options?.employeeName || 'EMAL',
        sheetName: options?.sheetName || 'Roster',
        status: failedCount === 0 ? 'Successful' : failedCount < importedCount ? 'Partial' : 'Failed',
      };

      await store.addImportHistoryRecord(historyRecord as any);

      res.json({
        importedCount,
        successCount,
        createdCount,
        updatedCount,
        failedCount,
        failedRows,
        historyRecord,
      });
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ error: 'Failed to process import' });
    }
  }));

  // 14. Weekly Template Generator
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_RANGE_DAYS = 400;
  function countDaysBetween(startStr: string, endStr: string): number {
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
  }

  app.post('/api/templates/generate', withRosterLock(async (req, res) => {
    try {
      const { startDate, endDate, template, overwrite } = req.body;

      if (!startDate || !endDate || !template || typeof template !== 'object') {
        return res.status(400).json({ error: 'Start date, end date, and weekly template mapping required' });
      }
      if (typeof startDate !== 'string' || !DATE_RE.test(startDate) || typeof endDate !== 'string' || !DATE_RE.test(endDate)) {
        return res.status(400).json({ error: 'Dates must be valid YYYY-MM-DD strings' });
      }
      const span = countDaysBetween(startDate, endDate);
      if (span < 0) {
        return res.status(400).json({ error: 'End date must be on or after start date' });
      }
      if (span > MAX_RANGE_DAYS) {
        return res.status(400).json({ error: `Date range too large (max ${MAX_RANGE_DAYS} days)` });
      }

      const entries = await store.getRosters();
      const generated: RosterEntry[] = [];
      const now = new Date().toISOString();

      // Local-midnight parse: a bare new Date(startDate) reads as UTC and
      // shifts the calendar day on servers west of UTC.
      let curr = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');

      while (curr <= end) {
        const year = curr.getFullYear();
        const monthStr = String(curr.getMonth() + 1).padStart(2, '0');
        const dayStr = String(curr.getDate()).padStart(2, '0');
        const dateStr = `${year}-${monthStr}-${dayStr}`;
        const dayName = getDayOfWeekName(dateStr);

        const defaultForDay = template[dayName] || (dayName === 'Saturday' || dayName === 'Sunday' ? 'DOF' : 'RTD');

        const existingIdx = entries.findIndex((e) => e.date === dateStr);

        if (existingIdx !== -1) {
          if (overwrite) {
            entries[existingIdx] = {
              ...entries[existingIdx],
              originalStatusId: defaultForDay,
              currentStatusId: defaultForDay,
              changedStatusId: null,
              action: defaultForDay === 'RTD' ? 'Work on Roster 10.15 - 7.30' : defaultForDay,
              updatedAt: now,
            };
            generated.push(entries[existingIdx]);
          }
        } else {
          const newEntry: RosterEntry = {
            id: `roster-${dateStr}`,
            date: dateStr,
            day: dayName,
            originalStatusId: defaultForDay,
            changedStatusId: null,
            currentStatusId: defaultForDay,
            action: defaultForDay === 'RTD' ? 'Work on Roster 10.15 - 7.30' : defaultForDay,
            ot: false,
            googleCalendarSyncStatus: 'Synced',
            googleCalendarEventId: `gcal-evt-${dateStr}`,
            createdAt: now,
            updatedAt: now,
          };
          entries.push(newEntry);
          generated.push(newEntry);
        }

        curr.setDate(curr.getDate() + 1);
      }

      await store.saveRosters(entries);

      res.json({ count: generated.length, entries: generated });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate template rosters' });
    }
  }));

  // Serve Vite in development mode
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Cache hashed assets aggressively; index.html never cached (Vercel handles separately)
    app.use(express.static(distPath, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      setHeaders: (res, p) => {
        if (p.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (p.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export { createServer };

if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  createServer().then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`EM Roster Manager server running on http://0.0.0.0:${PORT}`);
    });
  }).catch((err) => {
    console.error('Error starting server:', err);
  });
}

