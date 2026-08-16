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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full md:max-h-[85vh] max-h-[90vh] flex flex-col overflow-hidden transition-all my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Application Settings
              </h3>
              <p className="text-xs text-slate-500">
                Configure Google Calendar, Timezone, Statuses & Notifications
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Container Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Side Tabs */}
          <div className="w-full md:w-48 bg-slate-50 dark:bg-slate-800/40 p-2 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 space-y-1 text-xs">
            <button
              onClick={() => setActiveTab('google')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'google'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Google Calendar
            </button>

            <button
              onClick={() => setActiveTab('database')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'database'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Database className="w-4 h-4" />
              Supabase Database
            </button>

            <button
              onClick={() => setActiveTab('statuses')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'statuses'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Palette className="w-4 h-4" />
              Roster Statuses
            </button>

            <button
              onClick={() => setActiveTab('hours')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'hours'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              Working Hours
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'profile'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <User className="w-4 h-4" />
              Profile & Timezone
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'notifications'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Bell className="w-4 h-4" />
              Notifications
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'users'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              Allowed Users
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`w-full text-left px-3 py-2 rounded-xl font-semibold flex items-center gap-2 transition-colors ${
                activeTab === 'data'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
              }`}
            >
              <Database className="w-4 h-4" />
              Data & Reset
            </button>
          </div>

          {/* Main Tab Content */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
            
            {/* GOOGLE CALENDAR TAB */}
            {activeTab === 'database' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-purple-600" />
                    Supabase Database Setup & Status
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Configure your own Supabase relational database to persist roster records, history, status configurations, and user details securely.
                  </p>
                </div>

                {/* CONNECTION STATUS CARD */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Connection Status
                    </span>
                    <button
                      type="button"
                      onClick={fetchSupabaseStatus}
                      disabled={checkingSupabase}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingSupabase ? 'animate-spin' : ''}`} />
                      {checkingSupabase ? 'Checking...' : 'Refresh Status'}
                    </button>
                  </div>

                  {!supabaseStatus ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                      <span className="font-medium">Retrieving connection state...</span>
                    </div>
                  ) : !supabaseStatus.configured ? (
                    <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 space-y-2">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Supabase Environment Secrets Missing</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        The server is currently running in local storage fallback mode because the required env parameters are not configured in AI Studio.
                      </p>
                    </div>
                  ) : supabaseStatus.tablesMissing ? (
                    <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 space-y-2">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>Connected but Database Schema Missing</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        We successfully contacted your Supabase project, but one or more required tables (like <code className="px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 font-mono text-[10px]">roster_statuses</code> or <code className="px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 font-mono text-[10px]">roster_entries</code>) do not exist yet. Please execute the SQL script below.
                      </p>
                    </div>
                  ) : supabaseStatus.error ? (
                    <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 space-y-2">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>Connection Check Failed</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90 font-mono">
                        Error: {supabaseStatus.error}
                      </p>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 space-y-1">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <span>1.</span> Configure AI Studio Environment
                  </h4>
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-2 text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                    <p>
                      To let your app connect to your Supabase project, you must set these environment secrets in Google AI Studio:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 font-medium">
                      <li>Open the <strong className="text-slate-800 dark:text-slate-200">Settings</strong> menu (gear icon) in the AI Studio editor header.</li>
                      <li>Go to the <strong className="text-slate-800 dark:text-slate-200">Secrets / Environment Variables</strong> panel.</li>
                      <li>Define <code className="font-mono bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 px-1 py-0.5 rounded">SUPABASE_URL</code> with your project's endpoint URL.</li>
                      <li>Define <code className="font-mono bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-400 px-1 py-0.5 rounded">SUPABASE_KEY</code> with your project's Public/Anon key.</li>
                    </ol>
                  </div>
                </div>

                {/* SQL SETUP SCRIPT */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <span>2.</span> Deploy Database Tables
                  </h4>
                  <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-3">
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Copy the custom-crafted table setup schema and execute it inside your Supabase project's SQL Editor to instantiate all necessary tables and columns:
                    </p>
                    <button
                      type="button"
                      onClick={handleCopySqlInSettings}
                      className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-all cursor-pointer"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          SQL Script Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Database SQL Script
                        </>
                      )}
                    </button>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 font-mono text-[10px] text-slate-500 max-h-24 overflow-y-auto border border-slate-100 dark:border-slate-800">
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
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white block text-sm">
                      Google Calendar Sync Status
                    </span>
                    <span className="text-slate-500 text-xs">
                      {formData.googleCalendar.connected
                        ? `Connected as ${formData.googleCalendar.accountEmail}`
                        : 'Not connected'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {formData.googleCalendar.connected && (
                      <button
                        onClick={handleDisconnectGoogle}
                        className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-bold transition-colors"
                      >
                        Disconnect
                      </button>
                    )}
                    <button
                      onClick={handleConnectGoogle}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <Calendar className="w-4 h-4" />
                      {formData.googleCalendar.connected ? 'Reconnect Calendar' : 'Connect Google Calendar'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="work-calendar-primary">Work Calendar (Primary)</option>
                    <option value="personal-calendar">Personal Calendar</option>
                    <option value="office-calendar-shared">Office Roster Calendar</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer pt-2">
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
                    className="rounded border-slate-300 text-purple-600"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Automatically sync changes to Google Calendar upon save
                  </span>
                </label>
              </div>
            )}

            {/* STATUSES TAB */}
            {activeTab === 'statuses' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Centralized Roster Status Configuration
                  </span>
                  <span className="text-[10px] text-slate-400">Preserves original color mapping</span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {statusList.map((st, idx) => (
                    <div
                      key={st.code}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3"
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
                          <span className="font-bold text-slate-900 dark:text-white block">
                            {st.code}
                          </span>
                          <span className="text-[10px] text-slate-500">{st.description}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={st.active}
                            onChange={(e) => {
                              const updated = [...statusList];
                              updated[idx].active = e.target.checked;
                              setStatusList(updated);
                            }}
                            className="rounded border-slate-300 text-purple-600"
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
              <div className="space-y-4">
                <h4 className="font-bold text-slate-900 dark:text-white">
                  Default Working Hours for RTD Roster
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PROFILE & TIMEZONE TAB */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Employee Name
                  </label>
                  <input
                    type="text"
                    value={formData.userName}
                    onChange={(e) => setFormData({ ...formData, userName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Timezone (Strict Date Preserving)
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
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
              <div className="space-y-3">
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
                    className="rounded border-slate-300 text-purple-600"
                  />
                  <span className="font-bold text-slate-900 dark:text-white">
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
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>Notify on roster changes</span>
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
                      className="rounded border-slate-300 text-purple-600"
                    />
                    <span>Alert on Google Calendar sync errors</span>
                  </label>
                </div>
              </div>
            )}

            {/* ALLOWED USERS TAB */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                    Allowed Google Accounts (Access Control)
                  </h4>
                  <p className="text-xs text-slate-500 mb-3">
                    Only the Gmail/Google accounts listed below will be allowed to log in and manage this roster. All other accounts will be blocked.
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Enter Gmail or Google Workspace email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-purple-500 outline-hidden"
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
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                  >
                    Add User
                  </button>
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {(formData.allowedEmails || ['emalyaditha@gmail.com']).map((email) => (
                    <div
                      key={email}
                      className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300"
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
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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
                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-200 flex-shrink-0 mt-0.5">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                          Delete Uploaded Roster & Calendar Data
                        </h4>
                        <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                          Select a specific roster month or choose to delete all uploaded roster entries and clear them from Google Calendar.
                        </p>
                      </div>

                      {/* Month Selection */}
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                          Select Roster Month to Delete:
                        </label>
                        <select
                          value={selectedDeleteMonth}
                          onChange={(e) => {
                            setSelectedDeleteMonth(e.target.value);
                            setShowConfirmClear(false);
                          }}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500"
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
                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-rose-200 dark:border-rose-900/60">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-rose-900 dark:text-rose-200">
                          <input
                            type="checkbox"
                            checked={deleteFromGoogleCalendar}
                            onChange={(e) => {
                              setDeleteFromGoogleCalendar(e.target.checked);
                              setShowConfirmClear(false);
                            }}
                            className="rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                          />
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-rose-600" />
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
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          {isClearingData
                            ? 'Deleting Data & Syncing Calendar...'
                            : selectedDeleteMonth === 'all'
                            ? 'Delete All Uploaded Data'
                            : `Delete Selected Dataset`}
                        </button>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-3">
                          <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                            ⚠️ Are you sure you want to permanently delete this roster data?
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            This action will permanently delete{' '}
                            <span className="font-bold text-rose-700 dark:text-rose-300">
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
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isClearingData ? 'Deleting...' : 'Yes, Permanently Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowConfirmClear(false)}
                              disabled={isClearingData}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
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
                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <span>{clearNoticeMessage || 'Uploaded data has been successfully deleted!'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center gap-1">
            {saveSuccess && (
              <>
                <CheckCircle2 className="w-4 h-4" /> Settings Saved!
              </>
            )}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);
};
