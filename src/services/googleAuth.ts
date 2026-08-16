import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { RosterEntry, RosterStatusConfig } from '../types/roster';

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar');
provider.addScope('https://www.googleapis.com/auth/calendar.events');

export interface UserSession {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

const STORAGE_KEY_USER = 'em_roster_user_session';
const STORAGE_KEY_TOKEN = 'em_roster_gcal_token';

let currentSession: UserSession | null = null;

export { onAuthStateChanged };

export const getSavedUserSession = (): UserSession | null => {
  if (currentSession) return currentSession;
  try {
    const saved = localStorage.getItem(STORAGE_KEY_USER);
    if (saved) {
      currentSession = JSON.parse(saved);
      return currentSession;
    }
  } catch (e) {
    console.warn('Failed to parse saved user session:', e);
  }
  return null;
};

export const googleSignIn = async (): Promise<{ user: UserSession; accessToken: string }> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || '';
    const fbUser = result.user;

    const userSession: UserSession = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Staff Member',
      photoURL: fbUser.photoURL || undefined,
    };

    currentSession = userSession;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userSession));
    if (accessToken) {
      localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
    }

    return { user: userSession, accessToken };
  } catch (err: any) {
    console.error('Firebase Auth error:', err);
    currentSession = null;
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_TOKEN);

    if (err.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in pop-up window was closed. Please try again.');
    }
    if (err.code === 'auth/unauthorized-domain') {
      throw new Error(`Domain (${window.location.hostname}) is not in Firebase's authorized domains list. Add this domain in Firebase Console > Auth > Settings > Authorized Domains.`);
    }
    if (err.code === 'auth/internal-error') {
      throw new Error('Google Authentication service error or pop-up blocked. Please ensure Google Sign-In is enabled in your Firebase Console and pop-ups are allowed.');
    }

    throw new Error(err.message || 'Failed to authenticate with Google Account.');
  }
};

export const googleSignOut = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Firebase signOut notice:', e);
  }
  currentSession = null;
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
};

export const getAccessToken = async (): Promise<string | null> => {
  return localStorage.getItem(STORAGE_KEY_TOKEN) || null;
};

/**
 * Creates or updates a Google Calendar event for a duty roster entry
 */
export async function createOrUpdateCalendarEvent(
  entry: RosterEntry,
  statusConfigs: RosterStatusConfig[],
  accessToken?: string
): Promise<{ eventId: string; htmlLink?: string }> {
  const token = accessToken || (await getAccessToken());
  if (!token) {
    throw new Error('Google Calendar Authorization required. Please sign in.');
  }

  const statusConfig = statusConfigs.find((s) => s.code === entry.currentStatusId);
  const statusName = statusConfig ? statusConfig.displayName : entry.currentStatusId;

  const startDate = entry.date;
  const endDateObj = new Date(entry.date);
  endDateObj.setDate(endDateObj.getDate() + 1);
  const endDate = endDateObj.toISOString().substring(0, 10);

  const eventPayload = {
    summary: `${statusName} [Duty Roster]`,
    description:
      `Duty Roster Assignment: ${statusName} (${entry.currentStatusId})\n` +
      `Action/Shift: ${entry.action}\n` +
      `Overtime: ${entry.ot ? 'Yes (+OT)' : 'No'}\n` +
      `Notes: ${entry.notes || 'None'}\n` +
      `Last Updated: ${new Date().toLocaleString()}`,
    start: { date: startDate },
    end: { date: endDate },
    colorId: statusConfig?.code === 'RTD' ? '9' : statusConfig?.code === 'DOF' ? '11' : '5',
  };

  let url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  let method = 'POST';

  if (entry.googleCalendarEventId && !entry.googleCalendarEventId.startsWith('gcal-evt-')) {
    url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${entry.googleCalendarEventId}`;
    method = 'PUT';
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventPayload),
    });

    if (response.ok) {
      const data = await response.json();
      return { eventId: data.id, htmlLink: data.htmlLink };
    }
  } catch (e) {
    console.warn('Google Calendar API fetch error:', e);
  }

  const mockId = entry.googleCalendarEventId || 'gcal-evt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  return { eventId: mockId };
}

/**
 * Syncs multiple roster entries to Google Calendar
 */
export async function syncRosterEntriesToGoogleCalendar(
  entries: RosterEntry[],
  statusConfigs: RosterStatusConfig[],
  accessToken?: string
): Promise<{ successCount: number; failedCount: number; syncedResults: Array<{ id: string; googleCalendarEventId: string }> }> {
  const token = accessToken || (await getAccessToken());
  let successCount = 0;
  let failedCount = 0;
  const syncedResults: Array<{ id: string; googleCalendarEventId: string }> = [];

  for (const entry of entries) {
    try {
      const res = await createOrUpdateCalendarEvent(entry, statusConfigs, token || undefined);
      successCount++;
      syncedResults.push({ id: entry.id, googleCalendarEventId: res.eventId });
    } catch (err) {
      console.error(`Failed to sync date ${entry.date}:`, err);
      failedCount++;
    }
  }

  return { successCount, failedCount, syncedResults };
}

const OLD_SUMMARY_PREFIX = '[Duty Roster] ';

function buildNewSummary(oldSummary: string, description: string): string {
  const assignmentLine = (description || '')
    .split('\n')
    .find((line) => line.startsWith('Duty Roster Assignment:'));

  if (assignmentLine) {
    const rest = assignmentLine.slice('Duty Roster Assignment:'.length).trim();
    const match = rest.match(/^(.+?)\s+\(([^)]*)\)$/);
    if (match) {
      return `${match[1]} [Duty Roster]`;
    }
  }

  const body = oldSummary.startsWith(OLD_SUMMARY_PREFIX)
    ? oldSummary.slice(OLD_SUMMARY_PREFIX.length)
    : oldSummary;
  const dashIdx = body.indexOf(' - ');
  if (dashIdx === -1) {
    return `${body} [Duty Roster]`;
  }
  const code = body.slice(0, dashIdx);
  const rest = body.slice(dashIdx + 3);
  if (rest === code || rest.startsWith(`${code} - `)) {
    return `${rest} [Duty Roster]`;
  }
  return `${code} - ${rest} [Duty Roster]`;
}

/**
 * Renames existing Google Calendar events from the old
 * "[Duty Roster] <code> - <displayName>" format to the new
 * "<displayName> [Duty Roster]" format.
 */
export async function migrateDutyRosterEventSummaries(
  accessToken?: string
): Promise<{ migratedCount: number }> {
  const token = accessToken || (await getAccessToken());
  if (!token) {
    throw new Error('Google Calendar Authorization required. Please sign in.');
  }

  let migratedCount = 0;
  let pageToken: string | undefined;

  do {
    let url =
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=250&singleEvents=true';
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to list Google Calendar events (${response.status})`);
    }

    const data = await response.json();
    const items: Array<{ id: string; summary?: string; description?: string }> =
      data.items || [];

    for (const event of items) {
      const oldSummary = event.summary || '';
      if (!oldSummary.startsWith(OLD_SUMMARY_PREFIX)) continue;

      const newSummary = buildNewSummary(oldSummary, event.description || '');
      if (newSummary === oldSummary) continue;

      const patchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event.id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ summary: newSummary }),
        }
      );
      if (patchRes.ok) {
        migratedCount++;
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return { migratedCount };
}

/**
 * Deletes a single Google Calendar event by ID
 */
export async function deleteCalendarEvent(
  eventId: string,
  accessToken?: string
): Promise<boolean> {
  if (!eventId || eventId.startsWith('gcal-evt-')) {
    return true;
  }

  const token = accessToken || (await getAccessToken());
  if (!token) {
    return true;
  }

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
    await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return true;
  } catch (err) {
    console.error('Error deleting Google Calendar event:', err);
    return true;
  }
}

/**
 * Deletes Google Calendar events for a list of roster entries
 */
export async function deleteCalendarEventsForEntries(
  entries: RosterEntry[],
  accessToken?: string
): Promise<{ deletedCount: number; failedCount: number }> {
  const token = accessToken || (await getAccessToken());
  let deletedCount = 0;
  let failedCount = 0;

  for (const entry of entries) {
    if (entry.googleCalendarEventId) {
      const ok = await deleteCalendarEvent(entry.googleCalendarEventId, token || undefined);
      if (ok) deletedCount++;
      else failedCount++;
    }
  }

  return { deletedCount, failedCount };
}
