import { getSupabaseClient, reportSupabaseIssue, readJsonFile, writeJsonFile } from './store';

/**
 * Supabase-first persistence for the Task Management stores.
 *
 * Pattern mirrors store.ts (roster data):
 *  - Reads come from Supabase when configured; empty tables are seeded from the
 *    local JSON store (one-time migration of existing data) and the seed is returned.
 *  - Writes sync the full row list to Supabase (delete-missing + upsert) and always
 *    mirror to the local JSON file so the app keeps working offline / pre-migration.
 *  - Any Supabase failure (e.g. tables not created yet) degrades silently to JSON.
 */

/** True when the error means "table does not exist yet". */
function isMissingTableError(err: any): boolean {
  const code = err?.code || '';
  const msg = err?.message || '';
  return code === '42P01' || code === 'PGRST205' || msg.includes('relation') || msg.includes('does not exist');
}

// Track which tables were seeded this process, so a legitimately emptied
// table is never re-seeded from stale local JSON (which would resurrect
// deleted rows after a wipe).
const seededTables = new Set<string>();

/**
 * Load rows for a task-domain table.
 * - Supabase rows win whenever present.
 * - Empty Supabase table + local data => seed Supabase from local JSON once
 *   per process (one-time migration); afterwards an empty table is respected.
 * - Supabase unavailable/failed => local JSON (or the provided default).
 */
export async function loadTaskRows<T>(
  table: string,
  file: string,
  getFallback: () => T[],
): Promise<T[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        return data as T[];
      }
      // Table exists but is empty — migrate any existing local data up, once.
      if (!seededTables.has(table)) {
        seededTables.add(table);
        const local = readJsonFile<T[]>(file, []);
        const seed = local.length > 0 ? local : getFallback();
        if (seed.length > 0) {
          const { error: seedError } = await supabase.from(table).upsert(seed);
          if (seedError) {
            reportSupabaseIssue(`Seeding ${table} from local store`, seedError);
          } else {
            console.log(`✅ Seeded ${seed.length} row(s) into Supabase ${table} from local store.`);
          }
          return seed;
        }
      }
      return [];
    } catch (err: any) {
      reportSupabaseIssue(`Fetching ${table} from Supabase`, err);
      if (isMissingTableError(err)) {
        return readJsonFile<T[]>(file, getFallback());
      }
    }
  }
  return readJsonFile<T[]>(file, getFallback());
}

/**
 * Persist the full row list for a task-domain table.
 * Upsert runs BEFORE the delete-missing pass so a partial failure can leave
 * stale rows but never lose rows that were written successfully. The local
 * JSON file is always mirrored as a resilient fallback.
 */
export async function saveTaskRows<T>(
  table: string,
  idColumn: string,
  rows: T[],
  file: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const ids = (rows as any[]).map((r) => r[idColumn]);
      if (ids.length > 0) {
        const { error: upsertError } = await supabase.from(table).upsert(rows);
        if (upsertError) throw upsertError;

        const escaped = ids.map((id) => `"${String(id).replace(/"/g, '""')}"`).join(',');
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .not(idColumn, 'in', `(${escaped})`);
        if (deleteError) throw deleteError;
      } else {
        const { error: clearError } = await supabase.from(table).delete().neq(idColumn, '');
        if (clearError) throw clearError;
      }
    } catch (err: any) {
      reportSupabaseIssue(`Saving ${table} to Supabase`, err);
    }
  }
  writeJsonFile(file, rows);
}
