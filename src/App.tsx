import React, { useState, useEffect, useMemo } from "react";
import {
  RosterEntry,
  RosterStatusConfig,
  AppSettings,
  MonthSummary,
  LeaveRow,
} from "./types/roster";
import { api } from "./services/api";
import {
  googleSignIn,
  getAccessToken,
  createOrUpdateCalendarEvent,
  syncRosterEntriesToGoogleCalendar,
  migrateDutyRosterEventSummaries,
  deleteCalendarEvent,
  getSavedUserSession,
  googleSignOut,
  auth,
  onAuthStateChanged,
} from "./services/googleAuth";
import { HeaderNavbar } from "./components/HeaderNavbar";
import { LoginScreen } from "./components/LoginScreen";
import { RosterTable } from "./components/RosterTable";
import { RosterCardList } from "./components/RosterCardList";
import { RosterCalendarView } from "./components/RosterCalendarView";
import { DashboardOverview } from "./components/DashboardOverview";
import { RosterChangeModal } from "./components/RosterChangeModal";
import { AuditHistoryModal } from "./components/AuditHistoryModal";
import { ImportWizardModal } from "./components/ImportWizardModal";
import { ExportModal } from "./components/ExportModal";
import { SettingsModal } from "./components/SettingsModal";
import { BulkEditModal } from "./components/BulkEditModal";
import { AddRosterModal } from "./components/AddRosterModal";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { TemplateGeneratorModal } from "./components/TemplateGeneratorModal";
import { OtCalculatorModal } from "./components/OtCalculatorModal";
import { PrintView } from "./components/PrintView";
import { LeavePickerModal } from "./components/LeavePickerModal";
import { Toast, ToastItem } from "./components/Toast";
import { LEAVE_CODE_TO_TYPE, getBalanceForCode } from "./utils/leave";
import {
  formatMonthYearDisplay,
  getRosterCycleRange,
  shiftMonthYear,
  formatRosterCycleTitle,
  getRosterCycleForDate,
  getTodayDateString,
  formatDateDisplay,
} from "./utils/date";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutList,
  CalendarDays,
  LayoutDashboard,
  Search,
  Filter,
  Plus,
  Upload,
  Download,
  Settings,
  RefreshCw,
  Moon,
  Sun,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Briefcase,
  Layers,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Edit3,
  Database,
  Copy,
  Check,
  LogOut,
  Calculator,
} from "lucide-react";

export default function App() {
  // Theme State - Default to true for rich black UI/UX
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("theme") !== "light";
  });

  // Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Current Month-Year filter (always initialized to the roster cycle containing today's date)
  const [currentMonthYear, setCurrentMonthYear] = useState<string>(() => {
    return getRosterCycleForDate(new Date());
  });

  // Supabase Status State
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    connected: boolean;
    tablesMissing: boolean;
    error?: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Core Data
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [statuses, setStatuses] = useState<RosterStatusConfig[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Leave balance (centralized so the card + picker stay in sync)
  const [leaveRows, setLeaveRows] = useState<LeaveRow[]>([]);
  const [leaveLoading, setLeaveLoading] = useState<boolean>(false);
  const [leavePickerEntry, setLeavePickerEntry] = useState<RosterEntry | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const currentLeaveYear = useMemo(
    () => parseInt(currentMonthYear.split("-")[0], 10) || new Date().getFullYear(),
    [currentMonthYear]
  );

  const loadLeaveBalance = async (year?: number) => {
    setLeaveLoading(true);
    try {
      const res = await api.getLeaveBalance(year ?? currentLeaveYear);
      setLeaveRows(res.rows);
    } catch (err) {
      console.error("Failed to fetch leave balance:", err);
    } finally {
      setLeaveLoading(false);
    }
  };

  const pushToast = (type: ToastItem["type"], message: string, sub?: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message, sub }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setAuthLoading(true);
      if (fbUser) {
        try {
          const userSession = {
            uid: fbUser.uid,
            email: fbUser.email || "",
            displayName:
              fbUser.displayName ||
              fbUser.email?.split("@")[0] ||
              "Staff Member",
            photoURL: fbUser.photoURL || undefined,
          };
          const fetchedSettings = await api.getSettings();
          setSettings(fetchedSettings);
          setCurrentUser(userSession);
          setAuthError(null);
        } catch (err: any) {
          console.error("Authorization check failed:", err);
          setAuthError("Failed to verify user settings.");
        } finally {
          setAuthLoading(false);
        }
      } else {
        // Require explicit Google authentication on new or unauthenticated sessions
        setCurrentUser(null);
        localStorage.removeItem("em_roster_user_session");
        localStorage.removeItem("em_roster_gcal_token");
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await googleSignOut();
      setCurrentUser(null);
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  // Active View Tab ('table' | 'calendar' | 'dashboard')
  const [activeTab, setActiveTab] = useState<
    "table" | "calendar" | "dashboard"
  >("table");

  // Ongoing Roster Cycle strictly based on today's live date
  const ongoingCycle = useMemo(() => getRosterCycleForDate(new Date()), []);

  // Available Roster Cycle options spanning historical and upcoming periods
  const availableCycles = useMemo(() => {
    const cyclesSet = new Set<string>();

    // Generate 6 months past and 6 months forward relative to the current ongoing cycle
    for (let offset = -6; offset <= 6; offset++) {
      cyclesSet.add(shiftMonthYear(ongoingCycle, offset));
    }

    // Ensure currently selected month is always present
    cyclesSet.add(currentMonthYear);

    return Array.from(cyclesSet).sort();
  }, [ongoingCycle, currentMonthYear]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [changedOnlyFilter, setChangedOnlyFilter] = useState<boolean>(false);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals
  const [changeModalEntry, setChangeModalEntry] = useState<RosterEntry | null>(
    null,
  );
  const [auditModalEntry, setAuditModalEntry] = useState<RosterEntry | null>(
    null,
  );
  const [deleteModalEntry, setDeleteModalEntry] = useState<RosterEntry | null>(
    null,
  );
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isAddRosterModalOpen, setIsAddRosterModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isOtCalculatorModalOpen, setIsOtCalculatorModalOpen] = useState(false);

  // Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Initial Load & Load on Month Change
  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      try {
        const sStatus = await api.getSupabaseStatus();
        setSupabaseStatus(sStatus);
      } catch (sErr) {
        console.warn("Could not retrieve Supabase status:", sErr);
      }

      const [fetchedEntries, fetchedStatuses, fetchedSettings, fetchedSummary] =
        await Promise.all([
          api.getRosters({ monthYear: currentMonthYear }),
          api.getStatuses(),
          api.getSettings(),
          api.getSummary(currentMonthYear),
        ]);

      setEntries(fetchedEntries);
      setStatuses(fetchedStatuses);
      setSettings(fetchedSettings);
      setMonthSummary(fetchedSummary);
      setSelectedIds([]);
      setAuthError(null);
    } catch (err: any) {
      console.error("Error loading data:", err);
      if (
        err.message?.includes("403") ||
        err.message?.includes("Forbidden") ||
        err.message?.includes("authorized")
      ) {
        setAuthError(
          "Your account is not authorized to access this roster. Access restricted to whitelisted accounts.",
        );
        setCurrentUser(null);
        await googleSignOut();
      } else if (
        err.message?.includes("401") ||
        err.message?.includes("Unauthorized")
      ) {
        setAuthError("Session expired. Please try logging in again.");
        setCurrentUser(null);
        await googleSignOut();
      }
    } finally {
      setLoading(false);
      loadLeaveBalance(currentLeaveYear);
    }
  };

  const handleCopySql = async () => {
    try {
      const res = await api.getSupabaseSql();
      if (res && res.sql) {
        await navigator.clipboard.writeText(res.sql);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2000);
      } else {
        alert(
          "Failed to read SQL setup script. Please check the 'supabase_setup.sql' file in your project workspace.",
        );
      }
    } catch (err) {
      console.error("Error copying SQL:", err);
      alert(
        "Failed to read SQL setup script. Please check the 'supabase_setup.sql' file in your project workspace.",
      );
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentMonthYear, currentUser]);

  // Sync All with Google Calendar
  const handleSyncAllGoogle = async () => {
    setIsSyncingAll(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        try {
          const authRes = await googleSignIn();
          token = authRes.accessToken;
        } catch (authErr) {
          console.warn(
            "OAuth popup skipped or closed, performing backend sync:",
            authErr,
          );
        }
      }

      if (token) {
        let migratedCount = 0;
        try {
          const migrateRes = await migrateDutyRosterEventSummaries(token);
          migratedCount = migrateRes.migratedCount;
        } catch (err) {
          console.warn("Failed to migrate existing event summaries:", err);
        }

        if (entries.length > 0) {
          const syncRes = await syncRosterEntriesToGoogleCalendar(
            entries,
            statuses,
            token,
          );
          const syncedEntries = syncRes.syncedResults.map((r) => ({
            id: r.id,
            googleCalendarEventId: r.googleCalendarEventId,
            syncStatus: "Synced",
          }));
          await api.syncAllCalendar(currentMonthYear, syncedEntries);
          setSyncNotice(
            `Google Calendar Sync Complete! ${syncRes.successCount} entries published to Google Calendar.${migratedCount > 0 ? ` ${migratedCount} existing events updated to the new format.` : ""}`,
          );
        } else {
          await api.syncAllCalendar(currentMonthYear);
          setSyncNotice(
            `Google Calendar Sync Complete!${migratedCount > 0 ? ` ${migratedCount} existing events updated to the new format.` : ""}`,
          );
        }
      } else {
        const res = await api.syncAllCalendar(currentMonthYear);
        setSyncNotice(
          `Google Calendar Sync Complete! ${res.syncedCount} entries updated.`,
        );
      }

      setTimeout(() => setSyncNotice(null), 4000);
      await loadData();
    } catch (err: any) {
      console.error(err);
      await api.syncAllCalendar(currentMonthYear);
      setSyncNotice("Roster Calendar status updated.");
      setTimeout(() => setSyncNotice(null), 4000);
      await loadData();
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Sync Single Entry to Google Calendar
  const handleSyncSingle = async (entry: RosterEntry) => {
    try {
      let token = await getAccessToken();
      if (!token) {
        try {
          const authRes = await googleSignIn();
          token = authRes.accessToken;
        } catch (e) {}
      }

      let realEventId: string | undefined;
      if (token) {
        const gcalRes = await createOrUpdateCalendarEvent(
          entry,
          statuses,
          token,
        );
        realEventId = gcalRes.eventId;
      }
      await api.syncSingleCalendar(entry.id, realEventId);
      setSyncNotice(
        `Synced ${entry.date} (${entry.currentStatusId}) to Google Calendar.`,
      );
      setTimeout(() => setSyncNotice(null), 3000);
      await loadData();
    } catch (err) {
      console.error(err);
      await api.syncSingleCalendar(entry.id);
      setSyncNotice(`Synced ${entry.date} to Calendar.`);
      setTimeout(() => setSyncNotice(null), 3000);
      await loadData();
    }
  };

  // Save Roster Change (Single)
  const handleSaveRosterChange = async (data: {
    newStatusId: string;
    action: string;
    reason: string;
    notes: string;
    ot: boolean;
    otMorningHours?: number;
    otNightHours?: number;
    updateCalendar: boolean;
  }) => {
    if (!changeModalEntry) return;

    const res = await api.updateRoster(changeModalEntry.id, {
      currentStatusId: data.newStatusId,
      action: data.action,
      notes: data.notes,
      ot: data.ot,
      otMorningHours: data.otMorningHours,
      otNightHours: data.otNightHours,
      reason: data.reason,
      updateCalendar: data.updateCalendar,
    });

    if (
      (data.updateCalendar || settings?.googleCalendar.autoSync) &&
      res.entry
    ) {
      try {
        const token = await getAccessToken();
        if (token) {
          const gcalRes = await createOrUpdateCalendarEvent(
            res.entry,
            statuses,
            token,
          );
          await api.syncSingleCalendar(res.entry.id, gcalRes.eventId);
          setSyncNotice(`Updated Google Calendar event for ${res.entry.date}`);
          setTimeout(() => setSyncNotice(null), 3000);
        }
      } catch (err) {
        console.warn("Google Calendar update error on single edit:", err);
      }
    }

    await loadData();
  };

  // Apply Bulk Change
  const handleApplyBulkChange = async (data: {
    ids: string[];
    newStatusId: string;
    action: string;
    reason: string;
    updateCalendar: boolean;
  }) => {
    const res = await api.bulkUpdate(data.ids, {
      currentStatusId: data.newStatusId,
      action: data.action,
      reason: data.reason,
      updateCalendar: data.updateCalendar,
    });

    if (
      (data.updateCalendar || settings?.googleCalendar.autoSync) &&
      res.entries
    ) {
      try {
        const token = await getAccessToken();
        if (token) {
          const syncRes = await syncRosterEntriesToGoogleCalendar(
            res.entries,
            statuses,
            token,
          );
          const syncedEntries = syncRes.syncedResults.map((r) => ({
            id: r.id,
            googleCalendarEventId: r.googleCalendarEventId,
            syncStatus: "Synced",
          }));
          await api.syncAllCalendar(undefined, syncedEntries);
          setSyncNotice(
            `Updated ${res.entries.length} Google Calendar event(s)`,
          );
          setTimeout(() => setSyncNotice(null), 3000);
        }
      } catch (err) {
        console.warn("Bulk calendar update error:", err);
      }
    }

    await loadData();
  };

  // Add Manual Entry
  const handleAddRoster = async (data: {
    date: string;
    day: string;
    originalStatusId: string;
    changedStatusId: string;
    action: string;
    notes: string;
    ot: boolean;
    otMorningHours?: number;
    otNightHours?: number;
  }) => {
    const newEntry = await api.addRoster(data);
    if (settings?.googleCalendar.autoSync && newEntry) {
      try {
        const token = await getAccessToken();
        if (token) {
          const gcalRes = await createOrUpdateCalendarEvent(
            newEntry,
            statuses,
            token,
          );
          await api.syncSingleCalendar(newEntry.id, gcalRes.eventId);
        }
      } catch (e) {
        console.warn(
          "Failed to sync newly created roster entry to Google Calendar",
        );
      }
    }
    await loadData();
  };

  // Confirm Delete
  const handleConfirmDelete = async (shouldDeleteCalendarEvent: boolean) => {
    if (!deleteModalEntry) return;

    if (shouldDeleteCalendarEvent && deleteModalEntry.googleCalendarEventId) {
      try {
        const token = await getAccessToken();
        if (token) {
          await deleteCalendarEvent(
            deleteModalEntry.googleCalendarEventId,
            token,
          );
          setSyncNotice(
            `Removed event for ${deleteModalEntry.date} from Google Calendar`,
          );
          setTimeout(() => setSyncNotice(null), 3000);
        }
      } catch (err) {
        console.warn("Google Calendar delete error on single delete:", err);
      }
    }

    await api.deleteRoster(deleteModalEntry.id, shouldDeleteCalendarEvent);
    await loadData();
  };

  // Filtered entries for table and list
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDate = e.date.toLowerCase().includes(q);
        const matchesDay = e.day.toLowerCase().includes(q);
        const matchesAction = e.action.toLowerCase().includes(q);
        const matchesNotes = e.notes?.toLowerCase().includes(q);
        const matchesOriginal = e.originalStatusId.toLowerCase().includes(q);
        const matchesCurrent = e.currentStatusId.toLowerCase().includes(q);

        if (
          !matchesDate &&
          !matchesDay &&
          !matchesAction &&
          !matchesNotes &&
          !matchesOriginal &&
          !matchesCurrent
        ) {
          return false;
        }
      }

      // Status Filter
      if (statusFilter !== "ALL" && e.currentStatusId !== statusFilter) {
        return false;
      }

      // Changed Only Filter
      if (changedOnlyFilter) {
        const isStatusChanged = e.originalStatusId !== e.currentStatusId;
        const hasOvertime = e.ot === true;
        if (!isStatusChanged && !hasOvertime) {
          return false;
        }
      }

      return true;
    });
  }, [entries, searchQuery, statusFilter, changedOnlyFilter]);

  // Bulk Selection Logic
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredEntries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredEntries.map((e) => e.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectedEntries = useMemo(() => {
    return entries.filter((e) => selectedIds.includes(e.id));
  }, [entries, selectedIds]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">
            Verifying access permissions...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => setCurrentUser(user)}
        initialError={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors font-sans pb-16">
      {/* Navigation Header */}
      <HeaderNavbar
        currentMonthYear={currentMonthYear}
        onMonthChange={(m) => setCurrentMonthYear(m)}
        onTodayClick={() => setCurrentMonthYear(ongoingCycle)}
        searchQuery={searchQuery}
        onSearchChange={(q) => setSearchQuery(q)}
        activeView={activeTab}
        onViewChange={(v) => setActiveTab(v)}
        onAddRosterClick={() => setIsAddRosterModalOpen(true)}
        onChangeTodayClick={() => {
          const todayStr = getTodayDateString();
          const todayEntry = entries.find((e) => e.date === todayStr);
          if (todayEntry) {
            setChangeModalEntry(todayEntry);
          } else {
            setIsAddRosterModalOpen(true);
          }
        }}
        onImportClick={() => setIsImportModalOpen(true)}
        onExportClick={() => setIsExportModalOpen(true)}
        onSyncCalendarClick={handleSyncAllGoogle}
        onSettingsClick={() => setIsSettingsModalOpen(true)}
        onOtCalculatorClick={() => setIsOtCalculatorModalOpen(true)}
        settings={settings || ({ theme: darkMode ? "dark" : "light" } as any)}
        darkMode={darkMode}
        onThemeToggle={() => setDarkMode(!darkMode)}
        isSyncing={isSyncingAll}
        onSignOut={handleLogout}
      />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Sync Notification Banner */}
        {syncNotice && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-between shadow-sm animate-fadeIn">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              {syncNotice}
            </span>
            <button
              onClick={() => setSyncNotice(null)}
              className="text-emerald-500 hover:text-emerald-800"
            >
              ✕
            </button>
          </div>
        )}

        {/* Supabase Connection Alert Banner */}
        {supabaseStatus?.configured && supabaseStatus?.tablesMissing && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm animate-fadeIn">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold text-amber-800 dark:text-amber-400 text-sm block mb-1">
                  Supabase Configured but Database Tables are Missing
                </span>
                <p className="text-slate-600 dark:text-zinc-300 font-medium leading-relaxed">
                  Your application is connected to Supabase, but the database
                  tables do not exist in your schema.
                  <strong>
                    {" "}
                    The app has gracefully fallen back to local JSON storage
                  </strong>{" "}
                  so your schedule is completely safe! To activate real-time
                  cloud synchronization, copy the SQL schema inside{" "}
                  <code className="px-1.5 py-0.5 bg-slate-200 dark:bg-zinc-800 font-bold rounded">
                    supabase_setup.sql
                  </code>{" "}
                  in your project, open your Supabase SQL Editor, and paste-run
                  it.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                onClick={handleCopySql}
                className={`px-3.5 py-2 text-white font-extrabold rounded-xl transition-all shadow-xs shrink-0 cursor-pointer text-[11px] flex items-center gap-1.5 ${copiedSql ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-700 hover:bg-slate-800"}`}
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied SQL!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy SQL Script
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  alert(
                    "1. Click the 'Copy SQL Script' button to copy the setup schema to your clipboard.\n2. Open your Supabase Dashboard, select your project, and click 'SQL Editor' in the left menu.\n3. Click 'New query' (or paste in the default editor), paste (Ctrl+V or Cmd+V) the copied SQL, and click 'Run'.\n4. Your database tables will be created instantly and sync will activate immediately!",
                  );
                }}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-xl transition-all shadow-xs shrink-0 cursor-pointer text-[11px]"
              >
                Setup Guide
              </button>
              <button
                onClick={() =>
                  setSupabaseStatus({
                    ...supabaseStatus,
                    tablesMissing: false,
                  })
                }
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}



        {/* Quick Month Stats Summary Banner */}
        {monthSummary && (
          <div className="flex overflow-x-auto snap-x scrollbar-none gap-3 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 lg:grid-cols-7 mb-6">
            <div className="min-w-[130px] sm:min-w-0 snap-start p-3.5 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/80 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block mb-1">
                Total Days
              </span>
              <span className="text-xl font-extrabold text-slate-900 dark:text-white">
                {monthSummary.totalDays}
              </span>
            </div>

            <div className="min-w-[130px] sm:min-w-0 snap-start p-3.5 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/80 shadow-xs">
              <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                Duty / Working
              </span>
              <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {monthSummary.workingDays}{" "}
                <span className="text-xs font-normal text-slate-400">
                  days
                </span>
              </span>
            </div>

            <div className="min-w-[130px] sm:min-w-0 snap-start p-3.5 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/80 shadow-xs">
              <span className="text-[10px] font-extrabold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                Days Off (DOF)
              </span>
              <span className="text-xl font-extrabold text-slate-700 dark:text-zinc-300">
                {monthSummary.offDays}{" "}
                <span className="text-xs font-normal text-slate-400">
                  days
                </span>
              </span>
            </div>

            <div className="min-w-[130px] sm:min-w-0 snap-start p-3.5 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/80 shadow-xs">
              <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">
                Holidays (HOL)
              </span>
              <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
                {monthSummary.holDays || 0}{" "}
                <span className="text-xs font-normal text-slate-400">
                  days
                </span>
              </span>
            </div>

            <div className="min-w-[130px] sm:min-w-0 snap-start p-3.5 rounded-3xl bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/80 shadow-xs">
              <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block mb-1">
                Leaves / Absence
              </span>
              <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                {monthSummary.leaveDays}{" "}
                <span className="text-xs font-normal text-slate-400">
                  days
                </span>
              </span>
            </div>

            <div
              onClick={() => setIsOtCalculatorModalOpen(true)}
              className="min-w-[130px] sm:min-w-0 snap-start p-3.5 rounded-3xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/80 shadow-xs cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-orange-600 dark:text-orange-400 uppercase tracking-wider block mb-1">
                  Overtime (OT)
                </span>
                <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400 group-hover:underline">
                  Engine &rarr;
                </span>
              </div>
              <span className="text-xl font-extrabold text-orange-600 dark:text-orange-400">
                {monthSummary.otDays}{" "}
                <span className="text-xs font-normal text-slate-400">
                  shifts
                </span>
              </span>
            </div>

            <div className="min-w-[130px] sm:min-w-0 snap-start p-3.5 rounded-3xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/80 shadow-xs">
              <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1">
                Roster Changed
              </span>
              <span className="text-xl font-extrabold text-amber-700 dark:text-amber-400">
                {monthSummary.changedDays}{" "}
                <span className="text-xs font-normal text-slate-400">
                  modified
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Search and Filters Bar (Desktop Only - Mobile is simplified without clutter) */}
        {activeTab === "table" && (
          <div className="hidden md:flex pt-3 border-t border-slate-100 dark:border-zinc-800/80 flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search date, day, status, action..."
                className="w-full pl-9 pr-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700/80 bg-slate-50 dark:bg-zinc-950/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-medium"
              />
            </div>

            {/* Status Filter Dropdown & Checkbox */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-full border border-slate-200 dark:border-zinc-700/80 bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-200 font-bold focus:outline-none text-xs"
                >
                  <option value="ALL">All Statuses</option>
                  {statuses.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 dark:text-zinc-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                <input
                  type="checkbox"
                  checked={changedOnlyFilter}
                  onChange={(e) => setChangedOnlyFilter(e.target.checked)}
                  className="rounded-md border-slate-300 dark:border-zinc-700 text-purple-600 focus:ring-purple-500 bg-zinc-950 cursor-pointer"
                />
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" />
                <span>Show Changed Only</span>
              </label>
            </div>
          </div>
        )}

        {/* Bulk Selection Banner Bar */}
        {activeTab === "table" && selectedIds.length > 0 && (
          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-between text-xs animate-fadeIn">
            <span className="font-extrabold text-purple-900 dark:text-purple-200 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-purple-500" />
              {selectedIds.length} entries selected
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsBulkEditModalOpen(true)}
                className="px-3 py-1.5 rounded-full bg-purple-600 hover:bg-purple-700 text-white font-extrabold flex items-center gap-1 shadow-md shadow-purple-600/20"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Bulk Change
              </button>

              <button
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 rounded-full text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 font-bold"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Content Views */}
        {loading ? (
          <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
            <span>
              Loading roster entries for{" "}
              {formatMonthYearDisplay(currentMonthYear)}...
            </span>
          </div>
        ) : (
          <>
            {activeTab === "table" && (
              <>
                <div className="hidden md:block">
                  <RosterTable
                    entries={filteredEntries}
                    statuses={statuses}
                    selectedIds={selectedIds}
                    onToggleSelectAll={handleToggleSelectAll}
                    onToggleSelect={handleToggleSelectOne}
                    onChangeRosterClick={(entry) =>
                      setChangeModalEntry(entry)
                    }
                    onHistoryClick={(entry) => setAuditModalEntry(entry)}
                    onSyncSingleClick={handleSyncSingle}
                    onDeleteClick={(entry) => setDeleteModalEntry(entry)}
                    onBulkEditClick={() => setIsBulkEditModalOpen(true)}
                  />
                </div>

                <RosterCardList
                  entries={filteredEntries}
                  statuses={statuses}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelectOne}
                  onChangeRosterClick={(entry) => setChangeModalEntry(entry)}
                  onHistoryClick={(entry) => setAuditModalEntry(entry)}
                  onDeleteClick={(entry) => setDeleteModalEntry(entry)}
                  onSyncSingleClick={handleSyncSingle}
                />
              </>
            )}

            {activeTab === "calendar" && (
              <RosterCalendarView
                entries={entries}
                statuses={statuses}
                currentMonthYear={currentMonthYear}
                onMonthChange={(m) => setCurrentMonthYear(m)}
                onEntryClick={(entry) => setChangeModalEntry(entry)}
              />
            )}

            {activeTab === "dashboard" && (
              <DashboardOverview
                entries={entries}
                statuses={statuses}
                currentMonthYear={currentMonthYear}
                settings={settings || ({ theme: darkMode ? "dark" : "light" } as any)}
                leaveRows={leaveRows}
                leaveLoading={leaveLoading}
                onSyncLeave={() => loadLeaveBalance(currentLeaveYear)}
              />
            )}
          </>
        )}
      </div>

      {/* Floating Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 md:hidden bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-full shadow-xl px-4 py-2 flex items-center gap-6">
        <button
          onClick={() => setActiveTab("table")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-extrabold ${
            activeTab === "table"
              ? "text-purple-600 dark:text-purple-400"
              : "text-slate-400 dark:text-zinc-500"
          }`}
        >
          <LayoutList className="w-5 h-5" />
          <span>Roster</span>
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-extrabold ${
            activeTab === "calendar"
              ? "text-purple-600 dark:text-purple-400"
              : "text-slate-400 dark:text-zinc-500"
          }`}
        >
          <CalendarDays className="w-5 h-5" />
          <span>Calendar</span>
        </button>
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-extrabold ${
            activeTab === "dashboard"
              ? "text-purple-600 dark:text-purple-400"
              : "text-slate-400 dark:text-zinc-500"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Analytics</span>
        </button>
      </div>

      {/* Application Modals */}
      <AddRosterModal
        isOpen={isAddRosterModalOpen}
        statuses={statuses}
        onClose={() => setIsAddRosterModalOpen(false)}
        onAddRoster={async (data) => {
          await api.addRoster({
            date: data.date,
            day: data.day,
            originalStatusId: data.originalStatusId,
            changedStatusId: data.changedStatusId,
            action: data.action,
            notes: data.notes,
            ot: data.ot,
            clockIn: data.clockIn,
            clockOut: data.clockOut,
            otMorningHours: data.otMorningHours,
            otNightHours: data.otNightHours,
          });
          setIsAddRosterModalOpen(false);
          loadData();
        }}
      />

      <RosterChangeModal
        isOpen={!!changeModalEntry}
        entry={changeModalEntry}
        statuses={statuses}
        onClose={() => setChangeModalEntry(null)}
        onApplyLeave={(entry) => {
          setChangeModalEntry(null);
          setLeavePickerEntry(entry);
        }}
        onSave={async (data) => {
          if (!changeModalEntry) return;
          await api.updateRoster(changeModalEntry.id, {
            currentStatusId: data.newStatusId,
            action: data.action,
            reason: data.reason,
            notes: data.notes,
            ot: data.ot,
            clockIn: data.clockIn,
            clockOut: data.clockOut,
            otMorningHours: data.otMorningHours,
            otNightHours: data.otNightHours,
            user: currentUser?.displayName || "User",
            updateCalendar: data.updateCalendar,
          });
          setChangeModalEntry(null);
          loadData();
        }}
      />

      <LeavePickerModal
        isOpen={!!leavePickerEntry}
        entry={leavePickerEntry}
        leaveRows={leaveRows}
        onClose={() => setLeavePickerEntry(null)}
        onApply={async (code, reason) => {
          if (!leavePickerEntry) return;
          const balRow = getBalanceForCode(code, leaveRows);
          const leaveType = LEAVE_CODE_TO_TYPE[code] || code;
          const previousCode = leavePickerEntry.currentStatusId || leavePickerEntry.originalStatusId || "";
          try {
            await api.updateRoster(leavePickerEntry.id, {
              currentStatusId: code,
              action: leaveType,
              reason: reason || `Leave applied (${leaveType})`,
              notes: reason || `Converted from ${previousCode} to ${leaveType}`,
              ot: false,
              clockIn: "",
              clockOut: "",
              otMorningHours: 0,
              otNightHours: 0,
              user: currentUser?.displayName || "User",
              updateCalendar: true,
            });
            setLeavePickerEntry(null);
            loadData();
            const after = balRow && balRow.balance !== null ? Math.max(0, balRow.balance - 1) : null;
            pushToast(
              "success",
              `${leaveType} applied for ${formatDateDisplay(leavePickerEntry.date)}`,
              after !== null ? `${leaveType} balance: ${after.toFixed(2)} days remaining` : "Leave applied"
            );
          } catch (err: any) {
            pushToast(
              "error",
              `Failed to apply ${leaveType}`,
              err?.message || "Please try again"
            );
            throw err;
          }
        }}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />

      <AuditHistoryModal
        isOpen={!!auditModalEntry}
        entry={auditModalEntry}
        statuses={statuses}
        onClose={() => setAuditModalEntry(null)}
      />

      <DeleteConfirmModal
        isOpen={!!deleteModalEntry}
        entry={deleteModalEntry}
        onClose={() => setDeleteModalEntry(null)}
        onConfirmDelete={async (deleteGCal) => {
          if (!deleteModalEntry) return;
          await api.deleteRoster(deleteModalEntry.id, deleteGCal);
          setDeleteModalEntry(null);
          loadData();
        }}
      />

      <ImportWizardModal
        isOpen={isImportModalOpen}
        statuses={statuses}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          setIsImportModalOpen(false);
          loadData();
        }}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        entries={entries}
        statuses={statuses}
        onClose={() => setIsExportModalOpen(false)}
        onPrintClick={() => window.print()}
      />

      {settings && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          settings={settings}
          statuses={statuses}
          entries={entries}
          onClose={() => setIsSettingsModalOpen(false)}
          onSettingsUpdate={async (newSettings) => {
            await api.updateSettings(newSettings);
            setSettings(newSettings);
          }}
          onStatusesUpdate={async (newStatuses) => {
            await api.updateStatuses(newStatuses);
            setStatuses(newStatuses);
          }}
        />
      )}

      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        selectedEntries={entries.filter((e) => selectedIds.includes(e.id))}
        statuses={statuses}
        onClose={() => setIsBulkEditModalOpen(false)}
        onApplyBulkChange={async (data) => {
          await api.bulkUpdate(data.ids, {
            currentStatusId: data.newStatusId,
            action: data.action,
            reason: data.reason,
            user: currentUser?.displayName || "User",
            updateCalendar: data.updateCalendar,
          });
          setIsBulkEditModalOpen(false);
          setSelectedIds([]);
          loadData();
        }}
      />

      {settings && (
        <OtCalculatorModal
          isOpen={isOtCalculatorModalOpen}
          onClose={() => setIsOtCalculatorModalOpen(false)}
          entries={entries}
          settings={settings}
          statuses={statuses}
          currentMonthYear={currentMonthYear}
          onUpdateSettings={async (newSettings) => {
            await api.updateSettings(newSettings);
            setSettings(newSettings);
          }}
          onSyncComplete={async () => {
            loadData();
          }}
        />
      )}
    </div>
  );
}
