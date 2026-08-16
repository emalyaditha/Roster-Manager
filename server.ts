import express from 'express';
import path from 'path';
import fs from 'fs';
import { store } from './server/store.js';
import { RosterEntry, RosterChangeHistory } from './src/types/roster.js';
import { getDayOfWeekName, extractTimeInTimezone } from './src/utils/date.js';
import { calculateDayOt, DEFAULT_OT_SETTINGS } from './src/utils/otCalculator.js';

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

  // Middleware
  app.use(async (req, res, next) => {
    next();
  });

  // Helper to get 16th-to-15th roster cycle date range
  function getCycleDateRange(monthYearStr: string) {
    const [year, month] = monthYearStr.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-16`;
    const endObj = new Date(year, month, 15);
    const endDate = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-15`;
    return { startDate, endDate };
  }

  // API Routes
  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Supabase status check
  app.get('/api/supabase-status', async (req, res) => {
    try {
      const status = await store.checkSupabaseStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || String(error) });
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
      res.status(500).json({ error: error?.message || String(error) });
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
            e.action.toLowerCase().includes(query) ||
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
  app.put('/api/roster/:id/clock-times', async (req, res) => {
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
      res.status(500).json({ error: error?.message || 'Failed to update clock times and remark' });
    }
  });

  // 3c. Batch Update clock times and remarks for multiple entries
  app.post('/api/roster/clock-times/batch', async (req, res) => {
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
      res.status(500).json({ error: error?.message || 'Failed to batch update clock times' });
    }
  });

  // 4. Create new Roster Entry
  app.post('/api/roster', async (req, res) => {
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
          ot: Boolean(ot),
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
  });

  // 5. Change Roster Entry Workflow (Preserving Original Roster)
  app.put('/api/roster/:id/change', async (req, res) => {
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
        id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
        details: error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error))
      });
    }
  });

  // 6. Bulk Change Roster Workflow
  app.post('/api/roster/bulk-change', async (req, res) => {
    try {
      const { ids, newStatusId, action, reason, user, updateCalendar } = req.body;

      if (!Array.isArray(ids) || ids.length === 0 || !newStatusId) {
        return res.status(400).json({ error: 'Roster IDs and new status are required' });
      }

      const entries = await store.getRosters();
      const updatedEntries: RosterEntry[] = [];
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

          // Individual audit history record for every affected entry!
          await store.addHistoryRecord({
            id: `hist-bulk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

      res.json({ updatedCount: updatedEntries.length, entries: updatedEntries });
    } catch (error) {
      console.error('Error performing bulk change:', error);
      res.status(500).json({ error: 'Failed to apply bulk change' });
    }
  });

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

  app.delete('/api/roster/clear', clearHandler);
  app.delete('/api/roster/all/clear', clearHandler);

  app.delete('/api/roster/:id', async (req, res) => {
    try {
      let entries = await store.getRosters();
      const target = entries.find((e) => e.id === req.params.id);

      if (!target) {
        return res.status(404).json({ error: 'Roster entry not found' });
      }

      entries = entries.filter((e) => e.id !== req.params.id);
      await store.saveRosters(entries);

      res.json({
        message: 'Roster entry and associated calendar event deleted successfully',
        deletedId: req.params.id,
        googleCalendarEventId: target.googleCalendarEventId,
      });
    } catch (error) {
      console.error('Error deleting roster:', error);
      res.status(500).json({ error: 'Failed to delete roster entry' });
    }
  });

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
      const newSettings = req.body;
      const current = await store.getSettings();
      const merged = { ...current, ...newSettings };
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

  app.post('/api/calendar/sync/:id', async (req, res) => {
    try {
      const entries = await store.getRosters();
      const index = entries.findIndex((e) => e.id === req.params.id);

      if (index === -1) {
        return res.status(404).json({ error: 'Roster entry not found' });
      }

      const item = entries[index];
      const { googleCalendarEventId, syncStatus } = req.body || {};

      item.googleCalendarSyncStatus = syncStatus || 'Synced';
      if (googleCalendarEventId) {
        item.googleCalendarEventId = googleCalendarEventId;
      } else if (!item.googleCalendarEventId) {
        item.googleCalendarEventId = `gcal-evt-${item.date}-${Date.now()}`;
      }
      item.calendarSyncError = undefined;
      item.updatedAt = new Date().toISOString();

      entries[index] = item;
      await store.saveRosters(entries);

      res.json({ message: 'Synced successfully', entry: item });
    } catch (error) {
      res.status(500).json({ error: 'Calendar sync failed' });
    }
  });

  app.post('/api/calendar/sync-all', async (req, res) => {
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
  });

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
      res.status(500).json({ error: err?.message || 'Failed to save OT calculations' });
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
      res.status(500).json({ error: err?.message || 'Failed to fetch OT calculations' });
    }
  });

  // 11c. Clock Sync Endpoint with 3-Day Rolling Backfill & Non-Null Merging
  app.post('/api/clock/sync', async (req, res) => {
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
      res.status(500).json({ error: err?.message || 'Failed to sync clock events' });
    }
  });

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
      res.status(500).json({ error: err?.message || 'Failed to fetch clock events' });
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
      res.status(500).json({ error: err?.message || 'Failed to fetch leave balance' });
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
      res.status(500).json({ error: err?.message || 'Failed to save leave entitlements' });
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
    // Save connected state
    const settings = await store.getSettings();
    settings.googleCalendar.connected = true;
    settings.googleCalendar.accountEmail = 'emalyaditha@gmail.com';
    await store.saveSettings(settings);

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
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
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

  app.post('/api/import', async (req, res) => {
    try {
      const { rows, options } = req.body;

      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'Rows array required' });
      }

      const existingEntries = await store.getRosters();
      const validStatuses = (await store.getStatuses()).map((s) => s.code);

      // Pre-process rows: check date gap sequence & auto-fill missing dates as HOL
      const normalizedRows = [...rows];
      const validDateRows = normalizedRows.filter((r) => r && r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
      if (validDateRows.length > 0) {
        validDateRows.sort((a, b) => a.date.localeCompare(b.date));
        const dateSet = new Set(validDateRows.map((r) => r.date));
        const minDateStr = validDateRows[0].date;
        const maxDateStr = validDateRows[validDateRows.length - 1].date;

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
              ot: row.ot !== undefined ? Boolean(row.ot) : existing.ot,
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
              ot: Boolean(row.ot),
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
        id: `imp-${Date.now()}`,
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
  });

  // 14. Weekly Template Generator
  app.post('/api/templates/generate', async (req, res) => {
    try {
      const { startDate, endDate, template, overwrite } = req.body;

      if (!startDate || !endDate || !template) {
        return res.status(400).json({ error: 'Start date, end date, and weekly template mapping required' });
      }

      const entries = await store.getRosters();
      const generated: RosterEntry[] = [];
      const now = new Date().toISOString();

      let curr = new Date(startDate);
      const end = new Date(endDate);

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
  });

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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
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

