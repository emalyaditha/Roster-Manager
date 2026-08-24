import React, { useState, useMemo, useEffect } from 'react';
import { AppSettings, RosterStatusConfig, RosterEntry } from '../types/roster';
import { api } from '../services/api';
import { googleSignIn, googleSignOut, deleteCalendarEventsForEntries, getAccessToken } from '../services/googleAuth';
import { exportBackupData } from '../utils/export';
import { formatRosterCycleTitle, getRosterCycleRange } from '../utils/date';
import {
  X,
  Settings,
  Calendar,
  Clock,
  User,
  Bell,
  Palette,
  Database,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Trash2,
  Users,
  Check,
  Copy,
  RefreshCw,
} from 'lucide-react';

export function filterEntriesByMonthKey(entries: RosterEntry[], monthKey: string): RosterEntry[] {
  if (!entries || entries.length === 0) return [];
  if (monthKey === 'all') return entries;

  if (monthKey.startsWith('cycle:')) {
    const cycleKey = monthKey.replace('cycle:', '');
    const { startDate, endDate } = getRosterCycleRange(cycleKey);
    return entries.filter((e) => e.date >= startDate && e.date <= endDate);
  } else if (monthKey.startsWith('cal:')) {
    const calKey = monthKey.replace('cal:', '');
    return entries.filter((e) => e.date && e.date.startsWith(calKey));
  } else if (/^\d{4}-\d{2}$/.test(monthKey)) {
    const { startDate, endDate } = getRosterCycleRange(monthKey);
    return entries.filter(
      (e) => (e.date >= startDate && e.date <= endDate) || (e.date && e.date.startsWith(monthKey))
    );
  }

  return entries;
}

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  statuses: RosterStatusConfig[];
  entries?: RosterEntry[];
  onClose: () => void;
  onSettingsUpdate: (newSettings: AppSettings) => void;
  onStatusesUpdate: (newStatuses: RosterStatusConfig[]) => void;
  onDataCleared?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  statuses,
  entries = [],
  onClose,
  onSettingsUpdate,
  onStatusesUpdate,
  onDataCleared,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'google' | 'statuses' | 'hours' | 'notifications' | 'data' | 'users' | 'database'>('google');
  const [newEmail, setNewEmail] = useState('');
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [statusList, setStatusList] = useState<RosterStatusConfig[]>(statuses);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);
  const [clearNoticeMessage, setClearNoticeMessage] = useState<string | null>(null);
  const [selectedDeleteMonth, setSelectedDeleteMonth] = useState<string>('all');
  const [deleteFromGoogleCalendar, setDeleteFromGoogleCalendar] = useState<boolean>(true);

  const [allEntries, setAllEntries] = useState<RosterEntry[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);

  const [supabaseStatus, setSupabaseStatus] = useState<{ configured: boolean; connected: boolean; tablesMissing: boolean; error?: string } | null>(null);
  const [checkingSupabase, setCheckingSupabase] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const fetchSupabaseStatus = async () => {
    setCheckingSupabase(true);
    try {
      const status = await api.getSupabaseStatus();
      setSupabaseStatus(status);
    } catch (err) {
      console.warn('Failed to get Supabase status inside SettingsModal:', err);
    } finally {
      setCheckingSupabase(false);
    }
  };

  const handleCopySqlInSettings = async () => {
    try {
      const res = await api.getSupabaseSql();
      if (res && res.sql) {
        await navigator.clipboard.writeText(res.sql);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2000);
      } else {
        alert("Failed to read SQL setup script. Please check the 'supabase_setup.sql' file in your project workspace.");
      }
    } catch (err) {
      console.error('Error copying SQL in settings:', err);
      alert("Failed to read SQL setup script. Please check the 'supabase_setup.sql' file in your project workspace.");
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsLoadingEntries(true);
      fetchSupabaseStatus();
      api.getRosters()
        .then((data) => {
          setAllEntries(data);
        })
        .catch((err) => {
          console.error('Error fetching all entries in SettingsModal:', err);
        })
        .finally(() => {
          setIsLoadingEntries(false);
        });
    }
  }, [isOpen]);

  const activeEntries = allEntries.length > 0 ? allEntries : entries;

  // Extract unique Roster Cycles (16th-15th) and Calendar Months (1st-31st) from activeEntries
  const monthOptions = useMemo(() => {
    if (!activeEntries || activeEntries.length === 0) return { cycles: [], calendarMonths: [] };

    const cycleSet = new Set<string>();
    const calSet = new Set<string>();

    activeEntries.forEach((e) => {
      if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return;

      const [yStr, mStr, dStr] = e.date.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      const d = Number(dStr);

      // Calendar month key
      calSet.add(`${yStr}-${mStr}`);

      // Roster cycle key (16th to 15th)
      if (d >= 16) {
        cycleSet.add(`${yStr}-${mStr}`);
      } else {
        // Day 1 to 15 belongs to cycle of previous month
        const prevObj = new Date(y, m - 2, 1);
        const prevY = prevObj.getFullYear();
        const prevM = String(prevObj.getMonth() + 1).padStart(2, '0');
        cycleSet.add(`${prevY}-${prevM}`);
      }
    });

    return {
      cycles: Array.from(cycleSet).sort(),
      calendarMonths: Array.from(calSet).sort(),
    };
  }, [activeEntries]);

  const [showConfirmClear, setShowConfirmClear] = useState<boolean>(false);

  if (!isOpen) return null;

  const executeClearData = async () => {
    const targetEntries = filterEntriesByMonthKey(activeEntries || [], selectedDeleteMonth);
    setIsClearingData(true);
    setClearNoticeMessage(null);
    setShowConfirmClear(false);

    try {
      // 1. Delete events from Google Calendar if checked
      if (deleteFromGoogleCalendar && targetEntries.length > 0) {
        let token = await getAccessToken();
        if (!token) {
          try {
            const authRes = await googleSignIn();
            token = authRes.accessToken;
          } catch (e) {
            console.warn('Google Auth token not retrieved for bulk deletion');
          }
        }
        if (token) {
          await deleteCalendarEventsForEntries(targetEntries, token);
        }
      }

      // 2. Clear backend data
      const result = await api.clearAllRosters(selectedDeleteMonth);

      const successMsg = `Successfully deleted ${result.deletedCount || 0} roster entry(s)${deleteFromGoogleCalendar ? ' & removed from Google Calendar' : ''}.`;
      setClearNoticeMessage(successMsg);
      setClearSuccess(true);

      // Refresh local list of all entries after delete
      try {
        const updatedAll = await api.getRosters();
        setAllEntries(updatedAll);
      } catch (err) {
        console.error('Error refreshing entries after clear:', err);
      }

      if (onDataCleared) {
        onDataCleared();
      }

      setTimeout(() => {
        setClearSuccess(false);
        setClearNoticeMessage(null);
      }, 5000);
    } catch (err) {
      console.error('Failed to clear roster data:', err);
      setClearNoticeMessage('Failed to delete roster data. Please try again.');
      setClearSuccess(false);
    } finally {
      setIsClearingData(false);
    }
  };


  const handleConnectGoogle = async () => {
    try {
      const { user } = await googleSignIn();
      const updated = {
        ...formData,
        googleCalendar: {
          ...formData.googleCalendar,
          connected: true,
          accountEmail: user.email || 'emalyaditha@gmail.com',
        },
      };
      setFormData(updated);
      const saved = await api.updateSettings(updated);
      onSettingsUpdate(saved);
    } catch (err) {
      console.error('Sign in failed:', err);
      try {
        const { url } = await api.getGoogleAuthUrl();
        window.open(url, 'GoogleOAuthPopup', 'width=600,height=700');
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await googleSignOut();
      const updated = {
        ...formData,
        googleCalendar: {
          ...formData.googleCalendar,
          connected: false,
          accountEmail: '',
        },
      };
      setFormData(updated);
      const saved = await api.updateSettings(updated);
      onSettingsUpdate(saved);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const savedSettings = await api.updateSettings(formData);
      const savedStatuses = await api.updateStatuses(statusList);
      onSettingsUpdate(savedSettings);
      onStatusesUpdate(savedStatuses);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const sideTabClass = (active: boolean) =>
    `w-full text-left px-3 py-2 rounded-md font-medium flex items-center gap-2 transition-colors ${
      active ? 'bg-surface text-fg shadow-[var(--shadow-xs)]' : 'text-muted hover:text-fg'
    }`;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4">
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-2xl md:max-h-[85vh] max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-accent shrink-0">
              <Settings className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg truncate">
                Application Settings
              </h3>
              <p className="text-xs text-muted truncate">
                Configure Google Calendar, Timezone, Statuses & Notifications
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Container Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Side Tabs */}
          <div className="w-full md:w-48 bg-well p-1.5 border-b md:border-b-0 md:border-r border-line space-y-1 text-xs">
            <button
              onClick={() => setActiveTab('google')}
              className={sideTabClass(activeTab === 'google')}
            >
              <Calendar className="w-4 h-4" />
              Google Calendar
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={sideTabClass(activeTab === 'database')}
            >
              <Database className="w-4 h-4" />
              Supabase Database
            </button>

            <button
              onClick={() => setActiveTab('statuses')}
              className={sideTabClass(activeTab === 'statuses')}
            >
              <Palette className="w-4 h-4" />
              Roster Statuses
            </button>

            <button
              onClick={() => setActiveTab('hours')}
              className={sideTabClass(activeTab === 'hours')}
            >
              <Clock className="w-4 h-4" />
              Working Hours
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={sideTabClass(activeTab === 'profile')}
            >
              <User className="w-4 h-4" />
              Profile & Timezone
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={sideTabClass(activeTab === 'notifications')}
            >
              <Bell className="w-4 h-4" />
              Notifications
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={sideTabClass(activeTab === 'users')}
            >
              <Users className="w-4 h-4" />
              Allowed Users
            </button>

            <button
              onClick={() => setActiveTab('data')}
              style={{ color: 'var(--danger)' }}
              className={`w-full text-left px-3 py-2 rounded-md font-medium flex items-center gap-2 transition-colors ${
                activeTab === 'data' ? 'bg-surface shadow-[var(--shadow-xs)]' : 'hover:opacity-80'
              }`}
            >
              <Database className="w-4 h-4" />
              Data & Reset
            </button>
          </div>

          {/* Main Tab Content */}
          <div className="flex-1 px-5 py-4 overflow-y-auto space-y-4 text-xs">

            {/* GOOGLE CALENDAR TAB */}
            {activeTab === 'database' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-fg flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-accent" />
                    Supabase Database Setup & Status
                  </h3>
                  <p className="text-xs text-muted mt-1">
                    Configure your own Supabase relational database to persist roster records, history, status configurations, and user details securely.
                  </p>
                </div>

                {/* CONNECTION STATUS CARD */}
                <div className="card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-fg">
                      Connection Status
                    </span>
                    <button
                      type="button"
                      onClick={fetchSupabaseStatus}
                      disabled={checkingSupabase}
                      className="btn-min btn-secondary text-[11px]"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingSupabase ? 'animate-spin' : ''}`} />
                      {checkingSupabase ? 'Checking...' : 'Refresh Status'}
                    </button>
                  </div>

                  {!supabaseStatus ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-well text-muted">
                      <RefreshCw className="w-4 h-4 animate-spin text-faint" />
                      <span className="font-medium">Retrieving connection state...</span>
                    </div>
                  ) : !supabaseStatus.configured ? (
                    <div
                      className="p-3.5 rounded-lg space-y-2"
                      style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        <span>Supabase Environment Secrets Missing</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        The server is currently running in local storage fallback mode because the required env parameters are not configured in AI Studio.
                      </p>
                    </div>
                  ) : supabaseStatus.tablesMissing ? (
                    <div
                      className="p-3.5 rounded-lg space-y-2"
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        <span>Connected but Database Schema Missing</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        We successfully contacted your Supabase project, but one or more required tables (like <code className="px-1.5 py-0.5 rounded bg-surface font-mono text-[10px]">roster_statuses</code> or <code className="px-1.5 py-0.5 rounded bg-surface font-mono text-[10px]">roster_entries</code>) do not exist yet. Please execute the SQL script below.
                      </p>
                    </div>
                  ) : supabaseStatus.error ? (
                    <div
                      className="p-3.5 rounded-lg space-y-2"
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        <span>Connection Check Failed</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90 font-mono">
                        Error: {supabaseStatus.error}
                      </p>
                    </div>
                  ) : (
                    <div
                      className="p-3.5 rounded-lg space-y-1"
                      style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                    >
                      <div className="flex items-center gap-2 font-semibold text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Supabase is Active & Ready</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        Excellent! Your server is securely communicating with your Supabase database and all relational schema tables exist.
                      </p>
                    </div>
                  )}
                </div>

                {/* HOW TO CONFIGURE SECRETS */}
                <div className="space-y-3">
                  <h4 className="font-medium text-fg flex items-center gap-1">
                    <span>1.</span> Configure AI Studio Environment
                  </h4>
                  <div className="card p-4 space-y-2 text-muted leading-relaxed text-[11px]">
                    <p>
                      To let your app connect to your Supabase project, you must set these environment secrets in Google AI Studio:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 font-medium">
                      <li>Open the <strong className="text-fg">Settings</strong> menu (gear icon) in the AI Studio editor header.</li>
                      <li>Go to the <strong className="text-fg">Secrets / Environment Variables</strong> panel.</li>
                      <li>Define <code className="font-mono bg-well text-accent px-1 py-0.5 rounded">SUPABASE_URL</code> with your project's endpoint URL.</li>
                      <li>Define <code className="font-mono bg-well text-accent px-1 py-0.5 rounded">SUPABASE_KEY</code> with your project's Public/Anon key.</li>
                    </ol>
                  </div>
                </div>

                {/* SQL SETUP SCRIPT */}
                <div className="space-y-3">
                  <h4 className="font-medium text-fg flex items-center gap-1">
                    <span>2.</span> Deploy Database Tables
                  </h4>
                  <div className="card p-4 space-y-3">
                    <p className="text-[11px] text-muted leading-relaxed">
                      Copy the custom-crafted table setup schema and execute it inside your Supabase project's SQL Editor to instantiate all necessary tables and columns:
                    </p>
                    <button
                      type="button"
                      onClick={handleCopySqlInSettings}
                      className="btn-min btn-secondary w-full cursor-pointer"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-4 h-4" style={{ color: 'var(--success)' }} />
                          SQL Script Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Database SQL Script
                        </>
                      )}
                    </button>
                    <div className="p-2.5 rounded-lg bg-well font-mono text-[10px] text-muted max-h-24 overflow-y-auto">
                      -- Creates roster_statuses, roster_entries, roster_history, and system tables...
                      {"\n"}-- Automatically sets up primary keys, relations, and defaults.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* GOOGLE CALENDAR TAB */}
            {activeTab === 'google' && (
              <div className="space-y-4">
                <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-fg block text-sm">
                      Google Calendar Sync Status
                    </span>
                    <span className="text-xs text-muted">
                      {formData.googleCalendar.connected
                        ? `Connected as ${formData.googleCalendar.accountEmail}`
                        : 'Not connected'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {formData.googleCalendar.connected && (
                      <button
                        onClick={handleDisconnectGoogle}
                        className="btn-min btn-secondary"
                      >
                        Disconnect
                      </button>
                    )}
                    <button
                      onClick={handleConnectGoogle}
                      className="btn-min btn-primary"
                    >
                      <Calendar className="w-4 h-4" />
                      {formData.googleCalendar.connected ? 'Reconnect Calendar' : 'Connect Google Calendar'}
                    </button>
                  </div>
                </div>

                <div className="card p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-fg mb-1">
                      Target Calendar
                    </label>
                    <select
                      value={formData.googleCalendar.selectedCalendarId || 'work-calendar-primary'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          googleCalendar: {
                            ...formData.googleCalendar,
                            selectedCalendarId: e.target.value,
                          },
                        })
                      }
                      className="input-min"
                    >
                      <option value="work-calendar-primary">Work Calendar (Primary)</option>
                      <option value="personal-calendar">Personal Calendar</option>
                      <option value="office-calendar-shared">Office Roster Calendar</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={formData.googleCalendar.autoSync}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          googleCalendar: {
                            ...formData.googleCalendar,
                            autoSync: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-line accent-[var(--color-primary)]"
                    />
                    <span className="text-xs font-medium text-fg">
                      Automatically sync changes to Google Calendar upon save
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* STATUSES TAB */}
            {activeTab === 'statuses' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg">
                    Centralized Roster Status Configuration
                  </span>
                  <span className="text-[10px] text-faint">Preserves original color mapping</span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {statusList.map((st, idx) => (
                    <div
                      key={st.code}
                      className="card p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="color"
                          value={st.color}
                          onChange={(e) => {
                            const updated = [...statusList];
                            updated[idx].color = e.target.value;
                            setStatusList(updated);
                          }}
                          className="w-6 h-6 rounded cursor-pointer border-0 shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-fg block text-xs">
                            {st.code}
                          </span>
                          <span className="text-[10px] text-muted">{st.description}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[10px] font-medium text-muted">
                          <input
                            type="checkbox"
                            checked={st.active}
                            onChange={(e) => {
                              const updated = [...statusList];
                              updated[idx].active = e.target.checked;
                              setStatusList(updated);
                            }}
                            className="rounded border-line accent-[var(--color-primary)]"
                          />
                          Active
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WORKING HOURS TAB */}
            {activeTab === 'hours' && (
              <div className="card p-4 space-y-3">
                <h4 className="text-sm font-medium text-fg">
                  Default Working Hours for RTD Roster
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">
                      Start Time (RTD)
                    </label>
                    <input
                      type="time"
                      value={formData.workingHours.start}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          workingHours: { ...formData.workingHours, start: e.target.value },
                        })
                      }
                      className="input-min"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">
                      End Time (RTD)
                    </label>
                    <input
                      type="time"
                      value={formData.workingHours.end}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          workingHours: { ...formData.workingHours, end: e.target.value },
                        })
                      }
                      className="input-min"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PROFILE & TIMEZONE TAB */}
            {activeTab === 'profile' && (
              <div className="card p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">
                    Employee Name
                  </label>
                  <input
                    type="text"
                    value={formData.userName}
                    onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                    className="input-min"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-fg mb-1">
                    Timezone (Strict Date Preserving)
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="input-min"
                  >
                    <option value="Asia/Colombo">Asia/Colombo (Sri Lanka / India Standard Time)</option>
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="America/New_York">America/New_York (Eastern Time)</option>
                    <option value="Europe/London">Europe/London (Greenwich Mean Time)</option>
                  </select>
                </div>
              </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {activeTab === 'notifications' && (
              <div className="card p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.notifications.enabled}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        notifications: { ...formData.notifications, enabled: e.target.checked },
                      })
                    }
                    className="rounded border-line accent-[var(--color-primary)]"
                  />
                  <span className="text-sm font-medium text-fg">
                    Enable System Notifications
                  </span>
                </label>

                <div className="pl-6 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.notifications.rosterChanges}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          notifications: {
                            ...formData.notifications,
                            rosterChanges: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-line accent-[var(--color-primary)]"
                    />
                    <span className="text-xs text-fg">Notify on roster changes</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.notifications.syncErrors}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          notifications: {
                            ...formData.notifications,
                            syncErrors: e.target.checked,
                          },
                        })
                      }
                      className="rounded border-line accent-[var(--color-primary)]"
                    />
                    <span className="text-xs text-fg">Alert on Google Calendar sync errors</span>
                  </label>
                </div>
              </div>
            )}

            {/* ALLOWED USERS TAB */}
            {activeTab === 'users' && (
              <div className="card p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-fg mb-1">
                    Allowed Google Accounts (Access Control)
                  </h4>
                  <p className="text-xs text-muted">
                    Only the Gmail/Google accounts listed below will be allowed to log in and manage this roster. All other accounts will be blocked.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Enter Gmail or Google Workspace email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="input-min flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = newEmail.trim().toLowerCase();
                      if (trimmed && !(formData.allowedEmails || ['emalyaditha@gmail.com']).includes(trimmed)) {
                        setFormData({
                          ...formData,
                          allowedEmails: [...(formData.allowedEmails || ['emalyaditha@gmail.com']), trimmed],
                        });
                        setNewEmail('');
                      }
                    }}
                    className="btn-min btn-primary shrink-0"
                  >
                    Add User
                  </button>
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {(formData.allowedEmails || ['emalyaditha@gmail.com']).map((email) => (
                    <div
                      key={email}
                      className="border border-line rounded-md p-2.5 bg-surface flex items-center justify-between text-xs font-medium text-fg"
                    >
                      <span>{email}</span>
                      {email !== 'emalyaditha@gmail.com' && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              allowedEmails: (formData.allowedEmails || ['emalyaditha@gmail.com']).filter((e) => e !== email),
                            });
                          }}
                          style={{ color: 'var(--danger)' }}
                          className="p-1 rounded-md hover:bg-[var(--danger-bg)] cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DATA & RESET TAB */}
            {activeTab === 'data' && (
              <div className="space-y-4">
                <div className="card p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="p-2 rounded-lg shrink-0 mt-0.5"
                      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 space-y-3 min-w-0">
                      <div>
                        <h4 className="text-sm font-medium text-fg">
                          Delete Uploaded Roster & Calendar Data
                        </h4>
                        <p className="text-xs text-muted mt-0.5">
                          Select a specific roster month or choose to delete all uploaded roster entries and clear them from Google Calendar.
                        </p>
                      </div>

                      {/* Month Selection */}
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-fg">
                          Select Roster Month to Delete:
                        </label>
                        <select
                          value={selectedDeleteMonth}
                          onChange={(e) => {
                            setSelectedDeleteMonth(e.target.value);
                            setShowConfirmClear(false);
                          }}
                          className="input-min"
                        >
                          <option value="all">🗑️ Delete All Months ({activeEntries?.length || 0} total entries)</option>

                          {monthOptions.cycles.length > 0 && (
                            <optgroup label="📋 By Roster Cycle (16th – 15th)">
                              {monthOptions.cycles.map((c) => {
                                const title = formatRosterCycleTitle(c, true);
                                const { label } = getRosterCycleRange(c);
                                const cycleEntries = filterEntriesByMonthKey(activeEntries, `cycle:${c}`);
                                return (
                                  <option key={`cycle:${c}`} value={`cycle:${c}`}>
                                    📋 {title} ({label}) — {cycleEntries.length} entries
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}

                          {monthOptions.calendarMonths.length > 0 && (
                            <optgroup label="📅 By Calendar Month (1st – 31st)">
                              {monthOptions.calendarMonths.map((m) => {
                                const [yyyy, mm] = m.split('-');
                                const dateObj = new Date(Number(yyyy), Number(mm) - 1, 1);
                                const monthName = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                                const calEntries = filterEntriesByMonthKey(activeEntries, `cal:${m}`);
                                return (
                                  <option key={`cal:${m}`} value={`cal:${m}`}>
                                    📅 {monthName} ({m}) — {calEntries.length} entries
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {/* Google Calendar Sync Checkbox */}
                      <div className="p-2.5 rounded-lg bg-well">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-fg">
                          <input
                            type="checkbox"
                            checked={deleteFromGoogleCalendar}
                            onChange={(e) => {
                              setDeleteFromGoogleCalendar(e.target.checked);
                              setShowConfirmClear(false);
                            }}
                            className="rounded border-line accent-[var(--color-primary)]"
                          />
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />
                            Also delete corresponding events from Google Calendar
                          </span>
                        </label>
                      </div>

                      {/* Action Button or Confirm UI */}
                      {!showConfirmClear ? (
                        <button
                          type="button"
                          onClick={() => setShowConfirmClear(true)}
                          disabled={isClearingData}
                          className="btn-min btn-danger-min text-xs"
                        >
                          <Trash2 className="w-4 h-4" />
                          {isClearingData
                            ? 'Deleting Data & Syncing Calendar...'
                            : selectedDeleteMonth === 'all'
                            ? 'Delete All Uploaded Data'
                            : `Delete Selected Dataset`}
                        </button>
                      ) : (
                        <div
                          className="p-3.5 rounded-lg space-y-3"
                          style={{ background: 'var(--danger-bg)' }}
                        >
                          <p className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                            ⚠️ Are you sure you want to permanently delete this roster data?
                          </p>
                          <p className="text-[11px] text-muted leading-relaxed">
                            This action will permanently delete{' '}
                            <span className="font-semibold" style={{ color: 'var(--danger)' }}>
                              {selectedDeleteMonth === 'all'
                                ? 'ALL roster entries across all months'
                                : `ratios / entries for ${selectedDeleteMonth}`}
                            </span>
                            {deleteFromGoogleCalendar ? ' and ALSO remove them from your Google Calendar.' : '.'}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={executeClearData}
                              disabled={isClearingData}
                              style={{ background: 'var(--danger)', color: '#fff' }}
                              className="inline-flex items-center justify-center rounded-md h-9 px-3.5 text-sm font-medium cursor-pointer transition-opacity disabled:opacity-50"
                            >
                              {isClearingData ? 'Deleting...' : 'Yes, Permanently Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowConfirmClear(false)}
                              disabled={isClearingData}
                              className="btn-min btn-secondary text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {clearSuccess && (
                  <div
                    className="p-3.5 rounded-lg text-xs flex items-center gap-2 font-medium"
                    style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{clearNoticeMessage || 'Uploaded data has been successfully deleted!'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-line flex items-center justify-between">
          <span className="font-medium text-xs flex items-center gap-1" style={{ color: 'var(--success)' }}>
            {saveSuccess && (
              <>
                <CheckCircle2 className="w-4 h-4" /> Settings Saved!
              </>
            )}
          </span>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-min btn-secondary">
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-min btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
