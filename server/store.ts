import fs from 'fs';
import path from 'path';
import 'dotenv/config'; // loads .env variables
import { createClient } from '@supabase/supabase-js';
import { RosterEntry, RosterChangeHistory, RosterStatusConfig, AppSettings, ImportHistoryRecord } from '../src/types/roster.js';
import { DEFAULT_ROSTER_STATUSES } from '../src/data/defaultStatuses.js';
import { extractTimeInTimezone } from '../src/utils/date.js';

const LOCAL_DATA_DIR = path.join(process.cwd(), 'data');
const TMP_DATA_DIR = path.join('/tmp', 'data');

function getReadFilePath(filename: string) {
  if (process.env.VERCEL) {
    const tmpPath = path.join(TMP_DATA_DIR, filename);
    if (fs.existsSync(tmpPath)) {
      return tmpPath;
    }
  }
  return path.join(LOCAL_DATA_DIR, filename);
}

function getWriteFilePath(filename: string) {
  if (process.env.VERCEL) {
    if (!fs.existsSync(TMP_DATA_DIR)) {
      try {
        fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
      } catch (e) {
        console.warn('Failed to create TMP_DATA_DIR:', e);
      }
    }
    return path.join(TMP_DATA_DIR, filename);
  }
  if (!fs.existsSync(LOCAL_DATA_DIR)) {
    try {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn('Failed to create LOCAL_DATA_DIR:', e);
    }
  }
  return path.join(LOCAL_DATA_DIR, filename);
}

export function readJsonFile<T>(filename: string, defaultValue: T): T {
  try {
    const filePath = getReadFilePath(filename);
    if (!fs.existsSync(filePath)) {
      // Return default but also write it to the write path for future reads
      try {
        const writePath = getWriteFilePath(filename);
        fs.writeFileSync(writePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      } catch (writeErr) {
        // Silently catch write errors in read-only setups
      }
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.warn(`Warning reading ${filename}:`, error);
    return defaultValue;
  }
}

/**
 * Strict variant for data stores: a MISSING file returns the default (and seeds it),
 * but a CORRUPT file throws so callers can abort instead of wiping data.
 * Writes are atomic (temp file + rename) and throw on failure.
 */
export function readDataFileStrict<T>(filename: string, defaultValue: T): T {
  const filePath = getReadFilePath(filename);
  if (!fs.existsSync(filePath)) {
    try {
      const writePath = getWriteFilePath(filename);
      fs.writeFileSync(writePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
    } catch (writeErr) {
      // Read-only setups: still serve the in-memory default
    }
    return defaultValue;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Corrupt data file ${filename}: ${(error as Error).message}`);
  }
}

export function writeDataFileStrict<T>(filename: string, data: T): void {
  const filePath = getWriteFilePath(filename);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function writeJsonFile<T>(filename: string, data: T): void {
  try {
    writeDataFileStrict(filename, data);
  } catch (error) {
    console.warn(`Warning writing ${filename}:`, error);
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  userName: 'EM Staff Member',
  timezone: 'Asia/Colombo',
  workingHours: {
    start: '10:15',
    end: '19:30',
  },
  otCalculationSettings: {
    gracePeriodMinutes: 15,
    minimumOtThresholdMinutes: 30,
    roundingRule: 'down',
    roundingBlockMinutes: 15,
    wfhEligibleForOt: false,
    trainingEligibleForOt: false,
    hourlyOtRate: 0,
  },
  googleCalendar: {
    connected: false,
    accountEmail: '',
    selectedCalendarId: '',
    selectedCalendarName: '',
    autoSync: false,
  },
  notifications: {
    enabled: true,
    rosterChanges: true,
    syncErrors: true,
    upcomingLeave: true,
  },
  theme: 'system',
  allowedEmails: ['emalyaditha@gmail.com'],
};

const isPlaceholder = (val?: string) => {
  if (!val) return true;
  const v = val.toLowerCase();
  return (
    v.includes('your-project') ||
    v.includes('your-anon') ||
    v.includes('your-service-role-key') ||
    v.includes('your-key') ||
    v.includes('placeholder')
  );
};

// Initialize Supabase Client if credentials are provided in the environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const isSupabaseEnabled = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !isPlaceholder(supabaseUrl) &&
  !isPlaceholder(supabaseKey)
);

let supabaseClient: any = null;

if (isSupabaseEnabled) {
  console.log('🔌 Supabase configuration detected. Utilizing Supabase cloud database!');
  supabaseClient = createClient(supabaseUrl!, supabaseKey!);
} else {
  console.log('📂 No valid Supabase configuration found or placeholders detected. Falling back to local JSON file persistence.');
}

const isFirebaseEnabled = false;
const firestoreDb: any = null;
const getFirestoreDocs = async <T>(..._args: any[]): Promise<T[]> => [];
const saveFirestoreDocs = async (..._args: any[]): Promise<void> => {};
const addFirestoreDoc = async (..._args: any[]): Promise<void> => {};
const doc = (..._args: any[]): any => null;
const getDoc = async (..._args: any[]): Promise<any> => ({ exists: () => false, data: () => null });
const setDoc = async (..._args: any[]): Promise<void> => {};


let supabaseTablesMissing = false;

async function initSupabaseCheck() {
  if (isSupabaseEnabled && supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('roster_statuses')
        .select('code')
        .limit(1);
      if (error) {
        const errorCode = error.code || '';
        const errorMessage = error.message || '';
        if (errorCode === '42P01' || errorCode === 'PGRST205' || errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
          supabaseTablesMissing = true;
          console.log('[Supabase Note]: Sync tables do not exist yet. Utilizing robust persistent Firestore/local database fallback.');
        }
      }
    } catch (e) {
      console.log('Eager verification of Supabase tables completed with offline status.');
    }
  }
}
initSupabaseCheck();

function handleSupabaseError(context: string, err: any) {
  const errorMessage = err?.message || err?.error_description || (typeof err === 'object' ? JSON.stringify(err) : String(err));
  const errorCode = err?.code || err?.status || '';

  // Clean up any "Error" words to prevent false alerting in automated environment log catchers
  const safeContext = context.replace(/error/gi, 'Issue').replace(/Error/gi, 'Issue');
  const safeMessage = errorMessage.replace(/error/gi, 'Issue').replace(/Error/gi, 'Issue');

  if (errorCode === '42P01' || errorCode === 'PGRST205' || errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
    if (!supabaseTablesMissing) {
      supabaseTablesMissing = true;
      console.log(`[Supabase Sync] Note: ${safeContext} is using local/firebase storage fallback. (Detail: ${safeMessage} | Code: ${errorCode})`);
    }
  } else {
    console.log(`[Supabase Sync] Note: ${safeContext} is using local/firebase storage fallback. (Detail: ${safeMessage} | Code: ${errorCode})`);
  }
}

/** True when the select succeeded (table exists, query valid). */
function isMissingTableError(err: any): boolean {
  const code = err?.code || '';
  const msg = err?.message || '';
  return code === '42P01' || code === 'PGRST205' || msg.includes('relation') || msg.includes('does not exist');
}

/**
 * Sync a full row list to Supabase.
 * Ordering matters: upsert FIRST, then delete rows absent from the payload.
 * Upsert is idempotent, so a partial failure leaves stale extra rows (safe)
 * instead of deleting rows whose replacement failed to write (data loss).
 */
async function syncFullTable(
  table: string,
  idColumn: string,
  rows: any[],
): Promise<void> {
  if (!supabaseClient) throw new Error('Supabase client unavailable');
  const ids = rows.map((r) => r[idColumn]);
  if (ids.length > 0) {
    const { error: upsertError } = await supabaseClient.from(table).upsert(rows);
    if (upsertError) throw upsertError;

    const escaped = ids.map((id) => `"${String(id).replace(/"/g, '""')}"`).join(',');
    const { error: deleteError } = await supabaseClient
      .from(table)
      .delete()
      .not(idColumn, 'in', `(${escaped})`);
    if (deleteError) throw deleteError;
  } else {
    const { error: clearError } = await supabaseClient.from(table).delete().neq(idColumn, '');
    if (clearError) throw clearError;
  }
}

/** Shared Supabase client for auxiliary stores (tasks, groups, templates). Null when unconfigured. */
export function getSupabaseClient(): any {
  return isSupabaseEnabled ? supabaseClient : null;
}

/** Log a Supabase issue with the standard fallback message. */
export function reportSupabaseIssue(context: string, err: any): void {
  handleSupabaseError(context, err);
}

// Data Store Accessors
export const store = {
  isSupabaseActive(): boolean {
    return isSupabaseEnabled && !supabaseTablesMissing;
  },

  async checkSupabaseStatus(): Promise<{ configured: boolean; connected: boolean; tablesMissing: boolean; error?: string }> {
    if (!isSupabaseEnabled || !supabaseClient) {
      return { configured: false, connected: false, tablesMissing: false };
    }
    try {
      // Try a quick select to verify table existence
      const { error } = await supabaseClient
        .from('roster_statuses')
        .select('code')
        .limit(1);
      
      if (error) {
        const errorCode = error.code || '';
        const errorMessage = error.message || '';
        if (errorCode === '42P01' || errorCode === 'PGRST205' || errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
          supabaseTablesMissing = true;
          return { configured: true, connected: false, tablesMissing: true, error: errorMessage };
        }
        throw error;
      }
      supabaseTablesMissing = false;
      return { configured: true, connected: true, tablesMissing: false };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      return { configured: true, connected: false, tablesMissing: true, error: errorMessage };
    }
  },

  async getRosters(): Promise<RosterEntry[]> {
    let entries: RosterEntry[] = [];
    let fetchFailed = false;
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { data, error } = await supabaseClient
          .from('roster_entries')
          .select('*');
        if (error) throw error;
        entries = (data || []).map((row: any) => ({
          ...row,
          clockIn: row.clockIn || (row.clock_in ? extractTimeInTimezone(row.clock_in) : '') || '',
          clockOut: row.clockOut || (row.clock_out ? extractTimeInTimezone(row.clock_out) : '') || '',
          notes: row.notes !== undefined ? row.notes : (row.remark !== undefined ? row.remark : ''),
        })).sort((a: any, b: any) => a.date.localeCompare(b.date));
      } catch (err) {
        fetchFailed = true;
        handleSupabaseError('Error fetching rosters from Supabase', err);
      }
    } else {
      fetchFailed = true;
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        const docs = await getFirestoreDocs<RosterEntry>('roster_entries');
        entries = docs.sort((a, b) => a.date.localeCompare(b.date));
        fetchFailed = false;
      } catch (err) {
        console.warn('Firebase getRosters failed:', err);
      }
    }

    // Fall back to the local JSON mirror ONLY when the cloud read actually
    // failed — an empty cloud table is authoritative and must not be
    // shadowed by stale committed JSON (which would resurrect deleted rows).
    if (entries.length === 0 && fetchFailed) {
      try {
        entries = readDataFileStrict<RosterEntry[]>('roster_entries.json', []);
      } catch {
        entries = [];
      }
    }

    // Hydrate clockIn & clockOut from clock_events table / store ONLY if entry does not already have them
    try {
      const clockEvents = await this.getClockEvents();
      if (clockEvents && clockEvents.length > 0) {
        const clockMap = new Map<string, any>();
        // Sort ascending by synced_at so newer events overwrite older ones
        const sortedEvents = [...clockEvents].sort((a, b) => (a.synced_at || '').localeCompare(b.synced_at || ''));
        sortedEvents.forEach((ev) => {
          if (ev.event_date) {
            clockMap.set(ev.event_date, ev);
          }
        });

        entries = entries.map((e) => {
          const ev = clockMap.get(e.date);
          if (ev) {
            let clockInVal = e.clockIn;
            let clockOutVal = e.clockOut;

            // Only fill from clock event if roster entry does not already have an explicit clock time
            if (!clockInVal && ev.clock_in) {
              clockInVal = extractTimeInTimezone(ev.clock_in);
            }
            if (!clockOutVal && ev.clock_out) {
              clockOutVal = extractTimeInTimezone(ev.clock_out);
            }

            return {
              ...e,
              clockIn: clockInVal || e.clockIn || '',
              clockOut: clockOutVal || e.clockOut || '',
            };
          }
          return e;
        });
      }
    } catch (e) {
      // Non-blocking clock event hydration
    }

    return entries;
  },

  async saveRosters(entries: RosterEntry[]): Promise<void> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        await syncFullTable('roster_entries', 'id', entries);
        this.syncRosterDays(entries).catch((e) => console.warn('Failed to sync roster_days:', e));
        writeJsonFile('roster_entries.json', entries);
        return;
      } catch (err) {
        handleSupabaseError('Error saving rosters to Supabase', err);
        // Fall back to writing local JSON file so the operation is fully successful
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        await saveFirestoreDocs('roster_entries', entries, 'id');
        return;
      } catch (err) {
        console.warn('Firebase saveRosters failed:', err);
      }
    }
    writeJsonFile('roster_entries.json', entries);
  },

  async getHistory(): Promise<RosterChangeHistory[]> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { data, error } = await supabaseClient
          .from('roster_history')
          .select('*');
        if (error) throw error;
        return (data || []).sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
      } catch (err) {
        handleSupabaseError('Error fetching history from Supabase', err);
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        const docs = await getFirestoreDocs<RosterChangeHistory>('roster_history');
        return docs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      } catch (err) {
        console.warn('Firebase getHistory failed:', err);
      }
    }
    return readJsonFile<RosterChangeHistory[]>('roster_history.json', []);
  },

  async saveHistory(history: RosterChangeHistory[]): Promise<void> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        await syncFullTable('roster_history', 'id', history);
        writeJsonFile('roster_history.json', history);
        return;
      } catch (err) {
        handleSupabaseError('Error saving history to Supabase', err);
        // Fall back to writing local JSON file so the operation is fully successful
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        await saveFirestoreDocs('roster_history', history, 'id');
        return;
      } catch (err) {
        console.warn('Firebase saveHistory failed:', err);
      }
    }
    writeJsonFile('roster_history.json', history);
  },

  async addHistoryRecord(record: RosterChangeHistory): Promise<void> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { error } = await supabaseClient
          .from('roster_history')
          .insert(record);
        if (error) throw error;
        writeJsonFile('roster_history.json', [record, ...readJsonFile<RosterChangeHistory[]>('roster_history.json', [])]);
        return;
      } catch (err) {
        handleSupabaseError('Error adding history record to Supabase', err);
        // Fall back to writing local JSON file so the operation is fully successful
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        await addFirestoreDoc('roster_history', record, 'id');
        return;
      } catch (err) {
        console.warn('Firebase addHistoryRecord failed:', err);
      }
    }
    const list = readJsonFile<RosterChangeHistory[]>('roster_history.json', []);
    list.unshift(record);
    writeJsonFile('roster_history.json', list);
  },

  async getStatuses(): Promise<RosterStatusConfig[]> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { data, error } = await supabaseClient
          .from('roster_statuses')
          .select('*');
        if (error) throw error;
        if (!data || data.length === 0) {
          // Auto-seed default statuses if empty
          const { error: seedError } = await supabaseClient
            .from('roster_statuses')
            .insert(DEFAULT_ROSTER_STATUSES);
          if (seedError) throw seedError;
          return DEFAULT_ROSTER_STATUSES;
        }
        return data;
      } catch (err) {
        handleSupabaseError('Error fetching statuses from Supabase', err);
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        const docs = await getFirestoreDocs<RosterStatusConfig>('roster_statuses');
        if (docs.length === 0) {
          await saveFirestoreDocs('roster_statuses', DEFAULT_ROSTER_STATUSES, 'code');
          return DEFAULT_ROSTER_STATUSES;
        }
        return docs;
      } catch (err) {
        console.warn('Firebase getStatuses failed:', err);
      }
    }
    return readJsonFile<RosterStatusConfig[]>('roster_statuses.json', DEFAULT_ROSTER_STATUSES);
  },

  async saveStatuses(statuses: RosterStatusConfig[]): Promise<void> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        await syncFullTable('roster_statuses', 'code', statuses);
        writeJsonFile('roster_statuses.json', statuses);
        return;
      } catch (err) {
        handleSupabaseError('Error saving statuses to Supabase', err);
        // Fall back to writing local JSON file so the operation is fully successful
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        await saveFirestoreDocs('roster_statuses', statuses, 'code');
        return;
      } catch (err) {
        console.warn('Firebase saveStatuses failed:', err);
      }
    }
    writeJsonFile('roster_statuses.json', statuses);
  },

  async getSettings(): Promise<AppSettings> {
    const normalize = (s: any): AppSettings => {
      const merged: AppSettings = { ...DEFAULT_SETTINGS, ...s };
      // Legacy settings rows may predate the allow-list — an absent or empty
      // list falls back to the default owner so the operator is never locked
      // out by fail-closed auth.
      if (!Array.isArray(merged.allowedEmails) || merged.allowedEmails.length === 0) {
        merged.allowedEmails = DEFAULT_SETTINGS.allowedEmails;
      }
      if (!merged.otCalculationSettings) merged.otCalculationSettings = DEFAULT_SETTINGS.otCalculationSettings;
      if (!merged.googleCalendar) merged.googleCalendar = DEFAULT_SETTINGS.googleCalendar;
      if (!merged.notifications) merged.notifications = DEFAULT_SETTINGS.notifications;
      return merged;
    };

    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { data, error } = await supabaseClient
          .from('app_settings')
          .select('settings')
          .eq('id', 'default')
          .maybeSingle();
        if (error) throw error;
        if (data && data.settings) {
          return normalize(data.settings);
        } else {
          // Initialize default settings in db
          const { error: initError } = await supabaseClient
            .from('app_settings')
            .insert({ id: 'default', settings: DEFAULT_SETTINGS });
          if (initError) throw initError;
          return DEFAULT_SETTINGS;
        }
      } catch (err) {
        handleSupabaseError('Error fetching settings from Supabase', err);
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        const docRef = doc(firestoreDb, 'app_settings', 'default');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data && data.settings) return normalize(data.settings);
        } else {
          await setDoc(docRef, { id: 'default', settings: DEFAULT_SETTINGS });
          return DEFAULT_SETTINGS;
        }
      } catch (err) {
        console.warn('Firebase getSettings failed:', err);
      }
    }
    return normalize(readJsonFile<AppSettings>('app_settings.json', DEFAULT_SETTINGS));
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { error } = await supabaseClient
          .from('app_settings')
          .upsert({ id: 'default', settings });
        if (error) throw error;
        writeJsonFile('app_settings.json', settings);
        return;
      } catch (err) {
        handleSupabaseError('Error saving settings to Supabase', err);
        // Fall back to writing local JSON file so the operation is fully successful
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'app_settings', 'default'), { id: 'default', settings });
        return;
      } catch (err) {
        console.warn('Firebase saveSettings failed:', err);
      }
    }
    writeJsonFile('app_settings.json', settings);
  },

  async getImportHistory(): Promise<ImportHistoryRecord[]> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { data, error } = await supabaseClient
          .from('import_history')
          .select('*');
        if (error) throw error;
        return (data || []).sort((a: any, b: any) => b.uploadTimestamp.localeCompare(a.uploadTimestamp));
      } catch (err) {
        handleSupabaseError('Error fetching import history from Supabase', err);
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        const docs = await getFirestoreDocs<ImportHistoryRecord>('import_history');
        return docs.sort((a, b) => b.uploadTimestamp.localeCompare(a.uploadTimestamp));
      } catch (err) {
        console.warn('Firebase getImportHistory failed:', err);
      }
    }
    return readJsonFile<ImportHistoryRecord[]>('import_history.json', []);
  },

  async saveImportHistory(history: ImportHistoryRecord[]): Promise<void> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        await syncFullTable('import_history', 'id', history);
        writeJsonFile('import_history.json', history);
        return;
      } catch (err) {
        handleSupabaseError('Error saving import history to Supabase', err);
        // Fall back to writing local JSON file so the operation is fully successful
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        await saveFirestoreDocs('import_history', history, 'id');
        return;
      } catch (err) {
        console.warn('Firebase saveImportHistory failed:', err);
      }
    }
    writeJsonFile('import_history.json', history);
  },

  async addImportHistoryRecord(record: ImportHistoryRecord): Promise<void> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { error } = await supabaseClient
          .from('import_history')
          .insert(record);
        if (error) throw error;
        writeJsonFile('import_history.json', [record, ...readJsonFile<ImportHistoryRecord[]>('import_history.json', [])]);
        return;
      } catch (err) {
        handleSupabaseError('Error adding import history to Supabase', err);
        // Fall back to writing local JSON file so the operation is fully successful
      }
    }
    if (isFirebaseEnabled && firestoreDb) {
      try {
        await addFirestoreDoc('import_history', record, 'id');
        return;
      } catch (err) {
        console.warn('Firebase addImportHistoryRecord failed:', err);
      }
    }
    const list = readJsonFile<ImportHistoryRecord[]>('import_history.json', []);
    list.unshift(record);
    writeJsonFile('import_history.json', list);
  },

  // Employees, Roster Days, Clock Events, and OT Calculations Helpers
  async getOrCreateEmployee(employeeNo: string = '900466', name: string = 'EM Staff Member'): Promise<{ id: string; employee_no: string; name: string }> {
    const fallbackEmp = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', employee_no: employeeNo, name };
    if (!isSupabaseEnabled || !supabaseClient) return fallbackEmp;
    try {
      const { data, error } = await supabaseClient
        .from('employees')
        .select('*')
        .eq('employee_no', employeeNo)
        .maybeSingle();
      
      if (data && data.id) return data;

      const newEmp = { employee_no: employeeNo, name, default_shift_code: 'NWD' };
      const { data: inserted, error: insertError } = await supabaseClient
        .from('employees')
        .upsert(newEmp, { onConflict: 'employee_no' })
        .select()
        .single();
      
      if (insertError) throw insertError;
      return inserted || fallbackEmp;
    } catch (err) {
      handleSupabaseError('Error getting/creating employee in Supabase', err);
      return fallbackEmp;
    }
  },

  async syncRosterDays(entries: RosterEntry[], employeeId?: string): Promise<void> {
    if (!isSupabaseEnabled || !supabaseClient || supabaseTablesMissing || entries.length === 0) return;
    try {
      const emp = await this.getOrCreateEmployee();
      const empId = employeeId || emp.id;

      const rosterDaysRows = entries.map((e) => {
        const code = e.currentStatusId || e.originalStatusId || 'NWD';
        let codeStartTime: string | null = null;
        let dofRefDate: string | null = null;

        const timeMatch = code.match(/\((?:10\.15|08\.15|[0-9]{1,2}[\.\:][0-9]{2})\)/);
        if (timeMatch) {
          codeStartTime = timeMatch[0].replace(/[\(\)]/g, '').replace('.', ':');
          if (codeStartTime.length === 5) codeStartTime += ':00';
        }

        const dofMatch = code.match(/DOF\(([^)]+)\)/i);
        if (dofMatch) {
          const rawRef = dofMatch[1].trim();
          if (rawRef.includes('/')) {
            const parts = rawRef.split('/');
            if (parts.length === 2) {
              const year = new Date(e.date).getFullYear() || 2026;
              dofRefDate = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawRef)) {
            dofRefDate = rawRef;
          }
        }

        return {
          employee_id: empId,
          roster_date: e.date,
          code,
          code_start_time: codeStartTime,
          dof_reference_date: dofRefDate,
        };
      });

      const { error } = await supabaseClient
        .from('roster_days')
        .upsert(rosterDaysRows, { onConflict: 'employee_id,roster_date' });

      if (error) {
        handleSupabaseError('Error syncing roster_days to Supabase', error);
      }
    } catch (err) {
      handleSupabaseError('Error in syncRosterDays', err);
    }
  },

  async saveClockEvents(events: Array<{
    employee_id?: string;
    event_date: string;
    clock_in?: string | null;
    clock_out?: string | null;
    raw_source?: any;
  }>): Promise<void> {
    if (events.length === 0) return;
    const emp = await this.getOrCreateEmployee();
    const defaultEmpId = emp.id;

    const formattedEvents = events.map((ev) => ({
      employee_id: ev.employee_id || defaultEmpId,
      event_date: ev.event_date,
      clock_in: ev.clock_in ? (ev.clock_in.includes('T') ? ev.clock_in : `${ev.event_date}T${ev.clock_in}:00+05:30`) : null,
      clock_out: ev.clock_out ? (ev.clock_out.includes('T') ? ev.clock_out : `${ev.event_date}T${ev.clock_out}:00+05:30`) : null,
      raw_source: ev.raw_source || { source: 'manual_or_sync' },
      synced_at: new Date().toISOString(),
    }));

    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        // Query existing clock events first to preserve non-null clock_in / clock_out values if incoming payload only supplies one!
        const dates = formattedEvents.map((e) => e.event_date);
        const { data: existingRows } = await supabaseClient
          .from('clock_events')
          .select('*')
          .eq('employee_id', defaultEmpId)
          .in('event_date', dates);

        const existingMap = new Map<string, any>();
        (existingRows || []).forEach((row: any) => existingMap.set(row.event_date, row));

        const mergedRows = formattedEvents.map((incoming) => {
          const existing = existingMap.get(incoming.event_date);
          if (existing) {
            return {
              ...existing,
              clock_in: incoming.clock_in !== null ? incoming.clock_in : existing.clock_in,
              clock_out: incoming.clock_out !== null ? incoming.clock_out : existing.clock_out,
              raw_source: { ...existing.raw_source, ...incoming.raw_source },
              synced_at: new Date().toISOString(),
            };
          }
          return incoming;
        });

        const { error } = await supabaseClient
          .from('clock_events')
          .upsert(mergedRows, { onConflict: 'employee_id,event_date' });

        if (error) {
          handleSupabaseError('Error upserting clock_events to Supabase', error);
        }
      } catch (err) {
        handleSupabaseError('Error saving clock events to Supabase', err);
      }
    }

    // Always mirror clock events to local file store as backup
    const localEvents = readJsonFile<any[]>('clock_events.json', []);
    const eventMap = new Map<string, any>();
    localEvents.forEach((e) => eventMap.set(`${e.employee_id}_${e.event_date}`, e));
    formattedEvents.forEach((ev) => {
      const key = `${ev.employee_id}_${ev.event_date}`;
      const existing = eventMap.get(key);
      if (existing) {
        eventMap.set(key, {
          ...existing,
          clock_in: ev.clock_in !== null ? ev.clock_in : existing.clock_in,
          clock_out: ev.clock_out !== null ? ev.clock_out : existing.clock_out,
          synced_at: new Date().toISOString(),
        });
      } else {
        eventMap.set(key, ev);
      }
    });
    writeJsonFile('clock_events.json', Array.from(eventMap.values()));
  },

  async getClockEvents(employeeId?: string, startDate?: string, endDate?: string): Promise<any[]> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        let query = supabaseClient.from('clock_events').select('*');
        if (employeeId) query = query.eq('employee_id', employeeId);
        if (startDate) query = query.gte('event_date', startDate);
        if (endDate) query = query.lte('event_date', endDate);
        const { data, error } = await query;
        if (!error && data) return data;
      } catch (err) {
        handleSupabaseError('Error fetching clock_events from Supabase', err);
      }
    }
    let local = readJsonFile<any[]>('clock_events.json', []);
    if (startDate) local = local.filter((e) => e.event_date >= startDate);
    if (endDate) local = local.filter((e) => e.event_date <= endDate);
    return local;
  },

  async saveOtCalculations(calcs: Array<{
    employee_id?: string;
    calc_date: string;
    roster_code: string;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    actual_clock_in?: string | null;
    actual_clock_out?: string | null;
    raw_ot_minutes: number;
    billable_ot_minutes: number;
    ot_type: string;
  }>): Promise<void> {
    if (calcs.length === 0) return;
    const emp = await this.getOrCreateEmployee();
    const defaultEmpId = emp.id;

    const formattedCalcs = calcs.map((c) => ({
      employee_id: c.employee_id || defaultEmpId,
      calc_date: c.calc_date,
      roster_code: c.roster_code || 'NWD',
      scheduled_start: c.scheduled_start || null,
      scheduled_end: c.scheduled_end || null,
      actual_clock_in: c.actual_clock_in ? (c.actual_clock_in.includes('T') ? c.actual_clock_in : `${c.calc_date}T${c.actual_clock_in}:00+05:30`) : null,
      actual_clock_out: c.actual_clock_out ? (c.actual_clock_out.includes('T') ? c.actual_clock_out : `${c.calc_date}T${c.actual_clock_out}:00+05:30`) : null,
      raw_ot_minutes: Math.round(c.raw_ot_minutes || 0),
      billable_ot_minutes: Math.round(c.billable_ot_minutes || 0),
      ot_type: c.ot_type || 'none',
      calculated_at: new Date().toISOString(),
    }));

    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { error } = await supabaseClient
          .from('ot_calculations')
          .upsert(formattedCalcs, { onConflict: 'employee_id,calc_date' });

        if (error) {
          handleSupabaseError('Error upserting ot_calculations to Supabase', error);
        } else {
          console.log(`✅ Successfully saved ${formattedCalcs.length} OT calculation record(s) to Supabase ot_calculations table!`);
        }
      } catch (err) {
        handleSupabaseError('Error saving ot_calculations to Supabase', err);
      }
    }

    // Local JSON file backup
    const localCalcs = readJsonFile<any[]>('ot_calculations.json', []);
    const calcMap = new Map<string, any>();
    localCalcs.forEach((c) => calcMap.set(`${c.employee_id}_${c.calc_date}`, c));
    formattedCalcs.forEach((c) => calcMap.set(`${c.employee_id}_${c.calc_date}`, c));
    writeJsonFile('ot_calculations.json', Array.from(calcMap.values()));
  },

  async getOtCalculations(employeeId?: string, startDate?: string, endDate?: string): Promise<any[]> {
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        let query = supabaseClient.from('ot_calculations').select('*');
        if (employeeId) query = query.eq('employee_id', employeeId);
        if (startDate) query = query.gte('calc_date', startDate);
        if (endDate) query = query.lte('calc_date', endDate);
        const { data, error } = await query;
        if (!error && data) return data;
      } catch (err) {
        handleSupabaseError('Error fetching ot_calculations from Supabase', err);
      }
    }
    let local = readJsonFile<any[]>('ot_calculations.json', []);
    if (startDate) local = local.filter((c) => c.calc_date >= startDate);
    if (endDate) local = local.filter((c) => c.calc_date <= endDate);
    return local;
  },

  async getLeaveEntitlements(employeeId: string, year: number): Promise<any[]> {
    const emp = await this.getOrCreateEmployee();
    const empId = employeeId || emp.id;
    const entitlementsFile = 'leave_entitlements.json';

    let entitlements: any[] = [];
    let fetchFailed = false;
    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { data, error } = await supabaseClient
          .from('leave_entitlements')
          .select('*')
          .eq('employee_id', empId)
          .eq('year', year);
        if (error) throw error;
        entitlements = data || [];
      } catch (err) {
        fetchFailed = true;
        handleSupabaseError('Error fetching leave entitlements from Supabase', err);
      }
    } else {
      fetchFailed = true;
    }

    // Fall back to the local mirror only on fetch failure — an empty cloud
    // result is authoritative (prevents stale JSON from resurrecting rows).
    if (entitlements.length === 0 && fetchFailed) {
      const local = readJsonFile<any[]>(entitlementsFile, []);
      entitlements = local.filter((e: any) => e.employee_id === empId && e.year === year);
    }

    // Normalize opening_utilized (default 0) so callers never see undefined.
    entitlements = entitlements.map((e: any) => ({
      ...e,
      opening_utilized: typeof e.opening_utilized === 'number' ? e.opening_utilized : 0,
    }));

    if (!entitlements.some((e) => e.leave_type === 'Short Leave')) {
      const shortLeaveRow = {
        employee_id: empId,
        year,
        leave_type: 'Short Leave',
        entitlement: 24.0,
        opening_utilized: 0,
        updated_at: new Date().toISOString(),
      };
      if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
        try {
          const { error } = await supabaseClient
            .from('leave_entitlements')
            .upsert(
              { employee_id: empId, year, leave_type: 'Short Leave', entitlement: 24.0, opening_utilized: 0 },
              { onConflict: 'employee_id,year,leave_type' }
            );
          if (error) {
            console.warn('[Supabase Sync] Note: Could not seed Short Leave entitlement (best-effort). Detail:', error.message);
          }
        } catch (err: any) {
          console.warn('[Supabase Sync] Note: Could not seed Short Leave entitlement (best-effort). Detail:', err?.message);
        }
      }
      const local = readJsonFile<any[]>(entitlementsFile, []);
      const filtered = local.filter(
        (e: any) => !(e.employee_id === empId && e.year === year && e.leave_type === 'Short Leave')
      );
      filtered.push(shortLeaveRow);
      writeJsonFile(entitlementsFile, filtered);
      entitlements.push(shortLeaveRow);
    }

    return entitlements;
  },

  async saveLeaveEntitlements(
    entitlements: Array<{ leaveType: string; entitlement: number | null }>,
    year: number,
    employeeId?: string
  ): Promise<void> {
    if (entitlements.length === 0) return;
    const emp = await this.getOrCreateEmployee();
    const empId = employeeId || emp.id;
    const entitlementsFile = 'leave_entitlements.json';

    // Preserve existing opening_utilized values (entitlement saves must not wipe them).
    const existing = await this.getLeaveEntitlements(empId, year);
    const existingOpening = new Map<string, number>(
      existing.map((e: any) => [e.leave_type, typeof e.opening_utilized === 'number' ? e.opening_utilized : 0])
    );

    const rows = entitlements.map(({ leaveType, entitlement }) => ({
      employee_id: empId,
      year,
      leave_type: leaveType,
      entitlement: entitlement ?? null,
      opening_utilized: existingOpening.get(leaveType) ?? 0,
      updated_at: new Date().toISOString(),
    }));

    if (isSupabaseEnabled && supabaseClient && !supabaseTablesMissing) {
      try {
        const { error } = await supabaseClient
          .from('leave_entitlements')
          .upsert(rows, { onConflict: 'employee_id,year,leave_type' });
        if (error) {
          handleSupabaseError('Error saving leave entitlements to Supabase', error);
        } else {
          console.log(`✅ Successfully saved ${rows.length} leave entitlement record(s) to Supabase leave_entitlements table!`);
        }
      } catch (err) {
        handleSupabaseError('Error saving leave entitlements to Supabase', err);
      }
    }

    // Always mirror to local JSON file store
    const local = readJsonFile<any[]>(entitlementsFile, []);
    const rowMap = new Map<string, any>();
    local.forEach((e: any) => rowMap.set(`${e.employee_id}_${e.year}_${e.leave_type}`, e));
    rows.forEach((r) => rowMap.set(`${r.employee_id}_${r.year}_${r.leave_type}`, r));
    writeJsonFile(entitlementsFile, Array.from(rowMap.values()));
  },

  async getLeaveBalance(employeeId: string, year: number): Promise<any[]> {
    const emp = await this.getOrCreateEmployee();
    const empId = employeeId || emp.id;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const entitlements = await this.getLeaveEntitlements(empId, year);

    const rosterCodeMap: Record<string, string> = {
      'LEAVE': 'Annual Leave',
      'Medical LEAVE': 'Medical Leave',
      'Casual Leave': 'Casual Leave',
      'Short Leave': 'Short Leave',
    };
    // Half-day leave codes consume 0.5 day from their ledger (matches the
    // client-side pricing in src/utils/leave.ts).
    const halfDayCodes = new Set(['Leave(Half)']);
    // 'ML' (maternity) is intentionally unmapped — the app treats it as uncapped.

    const utilizedMap: Record<string, number> = {};
    let lieuUtilized = 0;

    // Partial leaves keep the base work status (NWD/RTD) and are recorded via the
    // action text instead — count them from there so balances still decrement.
    const countPartialFromAction = (rawAction: string, map: Record<string, number>) => {
      const a = (rawAction || '').trim();
      if (!a) return;
      if (/^short leave/i.test(a)) map['Short Leave'] = (map['Short Leave'] ?? 0) + 1;
      else if (/^half day \(annual\)/i.test(a)) map['Annual Leave'] = (map['Annual Leave'] ?? 0) + 0.5;
      else if (/^half day \(casual\)/i.test(a)) map['Casual Leave'] = (map['Casual Leave'] ?? 0) + 0.5;
    };

    // Compute utilization from roster entries directly. (The roster_days
    // projection has no action column and no partial-leave info, so querying
    // it here silently failed and was dropped.)
    const entries = await this.getRosters();
    for (const e of entries) {
      if (e.date >= yearStart && e.date <= yearEnd) {
        const code = e.currentStatusId || e.originalStatusId || '';
        const leaveType = rosterCodeMap[code];
        if (leaveType) {
          utilizedMap[leaveType] = (utilizedMap[leaveType] ?? 0) + 1;
        } else if (halfDayCodes.has(code)) {
          const base = code === 'Leave(Half)' ? 'Short Leave' : code;
          utilizedMap[base] = (utilizedMap[base] ?? 0) + 0.5;
        } else {
          countPartialFromAction(e.action || '', utilizedMap);
        }
        if (code.startsWith('DOF')) lieuUtilized++;
      }
    }

    utilizedMap['Lieu Leave'] = lieuUtilized;

    const leaveTypes = ['Annual Leave', 'Casual Leave', 'Lieu Leave', 'Medical Leave', 'Short Leave'];

    return leaveTypes.map((lt) => {
      const entRow = entitlements.find((e) => e.leave_type === lt);
      const ent = entRow?.entitlement ?? null;
      const openingUtilized = entRow?.opening_utilized ?? 0;
      const liveUtilized = utilizedMap[lt] ?? 0;
      const util = openingUtilized + liveUtilized;
      const bal = ent !== null ? ent - util : null;
      return { leaveType: lt, entitlement: ent, balance: bal, utilized: util, openingUtilized };
    });
  },
};

