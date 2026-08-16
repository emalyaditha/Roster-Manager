import {
  RosterEntry,
  RosterChangeHistory,
  RosterStatusConfig,
  AppSettings,
  GoogleCalendarInfo,
  RosterSummary,
  ImportHistoryRecord,
  ImportOptions,
  LeaveBalanceResponse,
} from '../types/roster';

async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers || {}) } as Record<string, string>;
  return fetch(url, { ...init, headers });
}

export const api = {
  // Fetch Roster entries with filters
  async getRosters(params?: {
    monthYear?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    currentStatus?: string;
    originalStatus?: string;
    changedOnly?: boolean;
    otOnly?: boolean;
    syncStatus?: string;
  }): Promise<RosterEntry[]> {
    const query = new URLSearchParams();
    if (params) {
      if (params.monthYear) query.append('monthYear', params.monthYear);
      if (params.startDate) query.append('startDate', params.startDate);
      if (params.endDate) query.append('endDate', params.endDate);
      if (params.search) query.append('search', params.search);
      if (params.currentStatus) query.append('currentStatus', params.currentStatus);
      if (params.originalStatus) query.append('originalStatus', params.originalStatus);
      if (params.changedOnly) query.append('changedOnly', 'true');
      if (params.otOnly) query.append('otOnly', 'true');
      if (params.syncStatus) query.append('syncStatus', params.syncStatus);
    }

    const res = await authorizedFetch(`/api/roster?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to load roster entries');
    return res.json();
  },

  // Get Summary
  async getSummary(monthYear: string): Promise<RosterSummary> {
    const res = await authorizedFetch(`/api/summary?monthYear=${monthYear}`);
    if (!res.ok) throw new Error('Failed to load roster summary');
    return res.json();
  },

  // Add / Save raw Roster entry
  async addRoster(data: {
    date: string;
    day?: string;
    originalStatusId: string;
    changedStatusId?: string | null;
    action?: string;
    notes?: string;
    ot?: boolean;
    clockIn?: string;
    clockOut?: string;
    otMorningHours?: number;
    otNightHours?: number;
    updateCalendar?: boolean;
  }): Promise<RosterEntry> {
    const res = await authorizedFetch('/api/roster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to save roster entry');
    return res.json();
  },

  // Change Roster Workflow (Preserves Original Roster!)
  async updateRoster(
    id: string,
    data: {
      currentStatusId: string;
      action: string;
      reason?: string;
      notes?: string;
      ot?: boolean;
      clockIn?: string;
      clockOut?: string;
      otMorningHours?: number;
      otNightHours?: number;
      user?: string;
      updateCalendar?: boolean;
    }
  ): Promise<{ entry: RosterEntry; history: RosterChangeHistory }> {
    const res = await authorizedFetch(`/api/roster/${id}/change`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newStatusId: data.currentStatusId,
        action: data.action,
        reason: data.reason,
        notes: data.notes,
        ot: data.ot,
        clockIn: data.clockIn,
        clockOut: data.clockOut,
        otMorningHours: data.otMorningHours,
        otNightHours: data.otNightHours,
        user: data.user,
        updateCalendar: data.updateCalendar,
      }),
    });
    if (!res.ok) throw new Error('Failed to update roster change');
    return res.json();
  },

  // Update Clock Times and Remark
  async updateClockTimes(id: string, clockIn: string, clockOut: string, remark?: string): Promise<RosterEntry> {
    const res = await authorizedFetch(`/api/roster/${id}/clock-times`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clockIn, clockOut, remark, notes: remark }),
    });
    if (!res.ok) throw new Error('Failed to update clock times and remark');
    return res.json();
  },

  // Bulk Update Clock Times and Remarks
  async bulkUpdateClockTimes(updates: Array<{ id: string; clockIn: string; clockOut: string; remark?: string }>): Promise<{ updatedCount: number; updatedEntries: RosterEntry[] }> {
    const res = await authorizedFetch('/api/roster/clock-times/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (!res.ok) throw new Error('Failed to batch update clock times');
    return res.json();
  },

  // Bulk change rosters
  async bulkUpdate(
    ids: string[],
    data: {
      currentStatusId: string;
      action?: string;
      reason?: string;
      user?: string;
      updateCalendar?: boolean;
    }
  ): Promise<{ updatedCount: number; entries: RosterEntry[] }> {
    const res = await authorizedFetch('/api/roster/bulk-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids,
        newStatusId: data.currentStatusId,
        action: data.action,
        reason: data.reason,
        user: data.user,
        updateCalendar: data.updateCalendar,
      }),
    });
    if (!res.ok) throw new Error('Failed to perform bulk change');
    return res.json();
  },

  // Delete Roster entry
  async deleteRoster(id: string, deleteCalendarEvent?: boolean): Promise<void> {
    const res = await authorizedFetch(`/api/roster/${id}?deleteCalendarEvent=${Boolean(deleteCalendarEvent)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete roster entry');
  },

  async clearAllRosters(month?: string): Promise<{ message: string; deletedCount: number; deletedEntries: RosterEntry[] }> {
    const url = month && month !== 'all' ? `/api/roster/clear?month=${encodeURIComponent(month)}` : '/api/roster/clear';
    const res = await authorizedFetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear roster data');
    return res.json();
  },

  // Fetch Audit Change History
  async getHistory(rosterEntryId?: string, date?: string): Promise<RosterChangeHistory[]> {
    const query = new URLSearchParams();
    if (rosterEntryId) query.append('rosterEntryId', rosterEntryId);
    if (date) query.append('date', date);

    const res = await authorizedFetch(`/api/history?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to load change history');
    return res.json();
  },

  // Status Configurations
  async getStatuses(): Promise<RosterStatusConfig[]> {
    const res = await authorizedFetch('/api/statuses');
    if (!res.ok) throw new Error('Failed to load status configurations');
    return res.json();
  },

  async updateStatuses(statuses: RosterStatusConfig[]): Promise<RosterStatusConfig[]> {
    const res = await authorizedFetch('/api/statuses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statuses),
    });
    if (!res.ok) throw new Error('Failed to save status configurations');
    return res.json();
  },

  // Settings
  async getSettings(): Promise<AppSettings> {
    const res = await authorizedFetch('/api/settings');
    if (!res.ok) throw new Error('Failed to load settings');
    return res.json();
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const res = await authorizedFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  // Google Calendar Integration
  async getCalendars(): Promise<GoogleCalendarInfo[]> {
    const res = await authorizedFetch('/api/calendar/calendars');
    if (!res.ok) throw new Error('Failed to fetch Google Calendars');
    return res.json();
  },

  async syncSingleCalendar(id: string, googleCalendarEventId?: string, syncStatus?: string): Promise<RosterEntry> {
    const res = await authorizedFetch(`/api/calendar/sync/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleCalendarEventId, syncStatus }),
    });
    if (!res.ok) throw new Error('Sync failed');
    const data = await res.json();
    return data.entry;
  },

  async syncAllCalendar(
    monthYear?: string,
    syncedEntries?: Array<{ id: string; googleCalendarEventId: string; syncStatus: string }>
  ): Promise<{ message: string; syncedCount: number }> {
    const res = await authorizedFetch('/api/calendar/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthYear, syncedEntries }),
    });
    if (!res.ok) throw new Error('Bulk sync failed');
    return res.json();
  },

  async getGoogleAuthUrl(): Promise<{ url: string; redirectUri: string }> {
    const res = await authorizedFetch('/api/auth/google/url');
    if (!res.ok) throw new Error('Failed to get Google Auth URL');
    return res.json();
  },

  // Import API
  async getImportHistory(): Promise<ImportHistoryRecord[]> {
    const res = await authorizedFetch('/api/import/history');
    if (!res.ok) throw new Error('Failed to fetch import history');
    return res.json();
  },

  async checkDuplicateImport(fileHash: string): Promise<{ isDuplicate: boolean; previousImport?: ImportHistoryRecord }> {
    const res = await authorizedFetch('/api/import/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileHash }),
    });
    if (!res.ok) throw new Error('Failed to check duplicate import');
    return res.json();
  },

  async importRows(
    rows: any[],
    options?: ImportOptions & { filename?: string; fileHash?: string; sheetName?: string }
  ): Promise<{
    importedCount: number;
    successCount: number;
    createdCount: number;
    updatedCount: number;
    failedCount: number;
    failedRows: any[];
    historyRecord?: ImportHistoryRecord;
  }> {
    const res = await authorizedFetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, options }),
    });
    if (!res.ok) throw new Error('Import failed');
    return res.json();
  },

  // Generate Template
  async generateTemplate(data: {
    startDate: string;
    endDate: string;
    template: Record<string, string>;
    overwrite: boolean;
  }): Promise<{ count: number; entries: RosterEntry[] }> {
    const res = await authorizedFetch('/api/templates/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to generate template rosters');
    return res.json();
  },

  // Get Supabase connection and tables status
  async getSupabaseStatus(): Promise<{ configured: boolean; connected: boolean; tablesMissing: boolean; error?: string }> {
    const res = await authorizedFetch('/api/supabase-status');
    if (!res.ok) throw new Error('Failed to get Supabase status');
    return res.json();
  },

  // Get Supabase raw SQL script contents
  async getSupabaseSql(): Promise<{ sql: string }> {
    const res = await authorizedFetch('/api/supabase-sql');
    if (!res.ok) throw new Error('Failed to fetch Supabase SQL setup');
    return res.json();
  },

  // OT Calculations API
  async saveOtCalculations(entries: RosterEntry[], settings?: Partial<AppSettings>): Promise<{ message: string; savedCount: number }> {
    const res = await authorizedFetch('/api/ot/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries, settings }),
    });
    if (!res.ok) throw new Error('Failed to save OT calculations');
    return res.json();
  },

  async getOtCalculations(startDate?: string, endDate?: string): Promise<any[]> {
    const query = new URLSearchParams();
    if (startDate) query.append('startDate', startDate);
    if (endDate) query.append('endDate', endDate);
    const res = await authorizedFetch(`/api/ot/calculations?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to load OT calculations');
    return res.json();
  },

  // Leave Balance API
  async getLeaveBalance(year?: number): Promise<LeaveBalanceResponse> {
    const query = new URLSearchParams();
    if (year) query.append('year', String(year));
    const res = await authorizedFetch(`/api/leave-balance?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to load leave balance');
    return res.json();
  },

  // Save Leave Entitlements (entitlement column only — balance/utilized are derived)
  async saveLeaveEntitlements(
    year: number,
    entitlements: { leaveType: string; entitlement: number | null }[]
  ): Promise<{ success: boolean; balance: LeaveBalanceResponse['rows'] }> {
    const res = await authorizedFetch('/api/leave-balance/entitlements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, entitlements }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save leave entitlements');
    }
    return res.json();
  },

  // Clock Sync API with Rolling Backfill
  async syncClockEvents(startDate?: string, endDate?: string, events?: any[]): Promise<{ message: string; updatedCount: number }> {
    const res = await authorizedFetch('/api/clock/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, events }),
    });
    if (!res.ok) throw new Error('Failed to sync clock events');
    return res.json();
  },
};
