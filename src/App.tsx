import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { motion } from "motion/react";
import {
  RosterEntry,
  RosterStatusConfig,
  AppSettings,
  MonthSummary,
  LeaveRow,
} from "./types/roster";
import { api } from "./services/api";
import { DEFAULT_ROSTER_STATUSES } from "./data/defaultStatuses";
import {
  googleSignIn,
  getAccessToken,
  createOrUpdateCalendarEvent,
  syncRosterEntriesToGoogleCalendar,
  migrateDutyRosterEventSummaries,
  deleteCalendarEvent,
  googleSignOut,
  auth,
  onAuthStateChanged,
} from "./services/googleAuth";
import { AppShell, type ViewTab } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";
import { RosterTable } from "./components/RosterTable";
import { RosterCardList } from "./components/RosterCardList";
import { RosterCalendarView } from "./components/RosterCalendarView";
import { SummaryCards } from "./components/SummaryCards";
import { CalendarLoader } from "./components/CalendarLoader";
import { Toast, ToastItem } from "./components/Toast";
import { LEAVE_CODE_TO_TYPE, getBalanceForCode, getDisplayCode, isPartialLeaveCode, getShortLeaveCutoff } from "./utils/leave";

const LazyDashboardOverview = React.lazy(() => import("./components/DashboardOverview").then(m => ({ default: m.DashboardOverview })));
const LazyTasksView = React.lazy(() => import("./components/tasks/TasksView").then(m => ({ default: m.TasksView })));
const LazyRosterChangeModal = React.lazy(() => import("./components/RosterChangeModal").then(m => ({ default: m.RosterChangeModal })));
const LazyAuditHistoryModal = React.lazy(() => import("./components/AuditHistoryModal").then(m => ({ default: m.AuditHistoryModal })));
const LazyImportWizardModal = React.lazy(() => import("./components/ImportWizardModal").then(m => ({ default: m.ImportWizardModal })));
const LazyExportModal = React.lazy(() => import("./components/ExportModal").then(m => ({ default: m.ExportModal })));
const LazySettingsModal = React.lazy(() => import("./components/SettingsModal").then(m => ({ default: m.SettingsModal })));
const LazyBulkEditModal = React.lazy(() => import("./components/BulkEditModal").then(m => ({ default: m.BulkEditModal })));
const LazyAddRosterModal = React.lazy(() => import("./components/AddRosterModal").then(m => ({ default: m.AddRosterModal })));
const LazyDeleteConfirmModal = React.lazy(() => import("./components/DeleteConfirmModal").then(m => ({ default: m.DeleteConfirmModal })));
const LazyOtCalculatorModal = React.lazy(() => import("./components/OtCalculatorModal").then(m => ({ default: m.OtCalculatorModal })));
const LazyLeavePickerModal = React.lazy(() => import("./components/LeavePickerModal").then(m => ({ default: m.LeavePickerModal })));
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
  KanbanSquare,
} from "lucide-react";

const ViewLoading = () => (
  <div className="py-16 flex justify-center">
    <CalendarLoader compact label="Loading view" />
  </div>
);

export default function App() {
  // Theme State - Respect system preference, then localStorage
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light") return false;
    if (stored === "dark") return true;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
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
          const me = await api.getMe();
          if (!me.email) {
            await googleSignOut();
            setCurrentUser(null);
            setAuthError("Access is restricted to staff members configured in system settings.");
            setAuthLoading(false);
            return;
          }
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
          if (err?.status === 403) {
            await googleSignOut();
            setCurrentUser(null);
            setAuthError("Access is restricted to staff members configured in system settings.");
          } else {
            setAuthError(err?.status === 401 ? "Session expired. Please sign in again." : "Failed to verify user settings.");
          }
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

  const handleLogout = useCallback(async () => {
    try {
      await googleSignOut();
      setCurrentUser(null);
    } catch (e) {
      console.error("Logout error:", e);
    }
  }, []);

  // Active View Tab ('table' | 'calendar' | 'dashboard' | 'tasks') — Dashboard is always the landing view
  const [activeTab, setActiveTab] = useState<ViewTab>(() => "dashboard");
  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
  };

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
  const [statusFilterCodes, setStatusFilterCodes] = useState<string[]>([]);
  const [statusFilterLabel, setStatusFilterLabel] = useState<string>("All Statuses");
  const [changedOnlyFilter, setChangedOnlyFilter] = useState<boolean>(false);

  const handleCardFilterChangedOnly = useCallback(() => setChangedOnlyFilter(true), []);
  const handleCardFilterStatus = useCallback((codes: string[], label: string) => {
    setStatusFilterCodes(codes);
    setStatusFilterLabel(label);
  }, []);

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
      document.documentElement.style.colorScheme = "dark";
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Initial Load & Load on Month Change (sequence guard: only the latest
  // request may commit state, so rapid month/tab changes can't race)
  const loadDataSeqRef = useRef(0);
  const loadData = async () => {
    if (!currentUser) return;
    const seq = ++loadDataSeqRef.current;
    setLoading(true);
    try {
      try {
        const sStatus = await api.getSupabaseStatus();
        if (seq !== loadDataSeqRef.current) return;
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

      if (seq !== loadDataSeqRef.current) return;

      setEntries(fetchedEntries);
      const mergedStatuses = [...fetchedStatuses];
      DEFAULT_ROSTER_STATUSES.forEach((d) => {
        if (!mergedStatuses.some((s) => s.code === d.code)) mergedStatuses.push(d);
      });
      setStatuses(mergedStatuses);
      setSettings(fetchedSettings);
      setMonthSummary(fetchedSummary);
      setSelectedIds([]);
      setAuthError(null);
    } catch (err: any) {
      console.error("Error loading data:", err);
      if (err?.status === 403) {
        setAuthError(
          "Your account is not authorized to access this roster. Access restricted to whitelisted accounts.",
        );
        setCurrentUser(null);
        await googleSignOut();
      } else if (err?.status === 401) {
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

  const handleSyncAllGoogle = useCallback(async () => {
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
  }, [entries, statuses, currentMonthYear]);

  const handleSyncSingle = useCallback(async (entry: RosterEntry) => {
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
  }, [statuses]);

  // Filtered entries for table and list
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDate = e.date.toLowerCase().includes(q);
        const matchesDay = e.day.toLowerCase().includes(q);
        const matchesAction = (e.action || '').toLowerCase().includes(q);
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

      // Status Filter (supports grouped codes, e.g. all working-day codes)
      if (statusFilterCodes.length > 0 && !statusFilterCodes.includes(e.currentStatusId)) {
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
  }, [entries, searchQuery, statusFilterCodes, changedOnlyFilter]);

  const handleToggleSelectAll = useCallback(() => {
    if (selectedIds.length === filteredEntries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredEntries.map((e) => e.id));
    }
  }, [selectedIds.length, filteredEntries]);

  const handleToggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      return [...prev, id];
    });
  }, []);

  const selectedEntries = useMemo(() => {
    return entries.filter((e) => selectedIds.includes(e.id));
  }, [entries, selectedIds]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f8] dark:bg-[#0a0e1a] transition-colors relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-2" />
        </div>
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
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
    <div className="min-h-screen bg-page text-fg transition-colors">
      <AppShell
        currentMonthYear={currentMonthYear}
        onMonthChange={(m) => setCurrentMonthYear(m)}
        onTodayClick={() => setCurrentMonthYear(ongoingCycle)}
        searchQuery={searchQuery}
        onSearchChange={(q) => setSearchQuery(q)}
        activeView={activeTab}
        onViewChange={(v) => handleTabChange(v)}
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
        darkMode={darkMode}
        onThemeToggle={() => setDarkMode(!darkMode)}
        isSyncing={isSyncingAll}
        userName={currentUser?.displayName || "User"}
        onSignOut={handleLogout}
      >
      <div className="space-y-5">
        {/* Sync Notification Banner */}
        {syncNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3 rounded-lg border text-xs font-medium flex items-center justify-between"
            style={{ background: 'var(--success-bg)', borderColor: 'var(--color-border)', color: 'var(--success)' }}
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {syncNotice}
            </span>
            <button onClick={() => setSyncNotice(null)} aria-label="Dismiss notification" className="hover:opacity-70 transition-opacity">✕</button>
          </motion.div>
        )}

        {/* Supabase Connection Alert Banner */}
        {supabaseStatus?.configured && supabaseStatus?.tablesMissing && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3"
            style={{ background: 'var(--warning-bg)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
              <div>
                <span className="font-semibold text-sm block mb-1" style={{ color: 'var(--warning)' }}>
                  Supabase configured but tables missing
                </span>
                <p className="text-muted text-xs leading-relaxed">
                  The app is connected to Supabase, but the database tables do not exist. It has{" "}
                  <strong className="text-fg">fallen back to local JSON storage</strong> — your schedule is safe. Run the schema from{" "}
                  <code className="px-1.5 py-0.5 rounded bg-well font-medium">supabase_setup.sql</code> in the Supabase SQL editor to activate cloud sync.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button onClick={handleCopySql} className="btn-secondary !h-8 !px-3 !text-xs flex items-center gap-1.5">
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
                onClick={() =>
                  alert(
                    "1. Click the 'Copy SQL Script' button to copy the setup schema to your clipboard.\n2. Open your Supabase Dashboard, select your project, and click 'SQL Editor' in the left menu.\n3. Click 'New query' (or paste in the default editor), paste (Ctrl+V or Cmd+V) the copied SQL, and click 'Run'.\n4. Your database tables will be created instantly and sync will activate immediately!",
                  )
                }
                className="btn-primary !h-8 !px-3 !text-xs"
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
                className="btn-icon !h-7 !w-7 text-sm font-bold"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
        {/* Roster Manager page header */}
        {activeTab === "table" && !loading && (
          <div className="flex items-end justify-between gap-3 pt-4 border-t border-line">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-fg">Roster Manager</h1>
              <p className="text-sm text-muted">{formatMonthYearDisplay(currentMonthYear)} schedule</p>
            </div>
          </div>
        )}
        {/* Search and Filters Bar (Desktop Only) */}
        {activeTab === "table" && (
          <div className="hidden md:flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search date, day, status, action..."
                className="input-min pl-8 pr-4 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-faint" />
                <select
                  value={
                    statusFilterCodes.length === 0
                      ? "ALL"
                      : statusFilterCodes.length === 1
                        ? statusFilterCodes[0]
                        : "__group__"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__group__") return;
                    if (v === "ALL") {
                      setStatusFilterCodes([]);
                      setStatusFilterLabel("All Statuses");
                      return;
                    }
                    setStatusFilterCodes([v]);
                    const match = statuses.find((s) => s.code === v);
                    setStatusFilterLabel(match ? `${match.code} — ${match.displayName}` : v);
                  }}
                  className="input-min !h-9 w-auto pr-8 text-xs font-medium"
                >
                  <option value="ALL">All Statuses</option>
                  {statusFilterCodes.length > 1 && (
                    <option value="__group__">{statusFilterLabel} ({statusFilterCodes.length})</option>
                  )}
                  {statuses.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer font-medium text-muted hover:text-fg transition-colors select-none">
                <input
                  type="checkbox"
                  checked={changedOnlyFilter}
                  onChange={(e) => setChangedOnlyFilter(e.target.checked)}
                  className="rounded border-line accent-[var(--color-primary)] cursor-pointer"
                />
                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--warning)" }} />
                <span>Show Changed Only</span>
              </label>
            </div>
          </div>
        )}
        {/* Bulk Selection Banner */}
        {activeTab === "table" && selectedIds.length > 0 && (
          <div
            className="p-3 rounded-lg border flex items-center justify-between text-xs"
            style={{ background: "var(--accent-soft)", borderColor: "var(--color-border)" }}
          >
            <span className="font-semibold flex items-center gap-2" style={{ color: "var(--color-primary)" }}>
              <CheckSquare className="w-4 h-4" />
              {selectedIds.length} entries selected
            </span>

            <div className="flex items-center gap-2">
              <button onClick={() => setIsBulkEditModalOpen(true)} className="btn-primary !h-8 !px-3 !text-xs">
                <Edit3 className="w-3.5 h-3.5" />
                Bulk Change
              </button>

              <button onClick={() => setSelectedIds([])} className="btn-ghost !h-8 !px-2.5 !text-xs">
                Clear
              </button>
            </div>
          </div>
        )}
        {/* Content Views */}
        {loading ? (
          <div className="pt-14 pb-24 flex justify-center">
            <CalendarLoader label={`Loading ${formatMonthYearDisplay(currentMonthYear)} roster days`} />
          </div>
        ) : (
          <>
            {activeTab === "table" && (
              <>
                <SummaryCards
                  entries={entries}
                  statuses={statuses}
                  onFilterChangedOnly={handleCardFilterChangedOnly}
                  onFilterStatus={handleCardFilterStatus}
                  onOpenOtCalculator={() => setIsOtCalculatorModalOpen(true)}
                />
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
              <Suspense fallback={<ViewLoading />}>
              <LazyDashboardOverview
                entries={entries}
                statuses={statuses}
                currentMonthYear={currentMonthYear}
                leaveRows={leaveRows}
                leaveLoading={leaveLoading}
                onSyncLeave={() => loadLeaveBalance(currentLeaveYear)}
                onOpenTasks={() => handleTabChange("tasks")}
                onOpenRoster={() => handleTabChange("table")}
              />
              </Suspense>
            )}

            {activeTab === "tasks" && (
              <Suspense fallback={<ViewLoading />}>
                <LazyTasksView userName={currentUser?.displayName || "User"} onToast={pushToast} />
              </Suspense>
            )}
          </>
        )}
      </div>
      </AppShell>

      {/* Floating Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 border border-line bg-surface shadow-[var(--shadow-md)] rounded-xl px-5 py-2.5 flex items-center gap-6 md:hidden">
        {([
          { id: "dashboard", icon: LayoutDashboard, label: "Home" },
          { id: "table", icon: LayoutList, label: "Roster" },
          { id: "tasks", icon: KanbanSquare, label: "Tasks" },
          { id: "calendar", icon: CalendarDays, label: "Calendar" },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => handleTabChange(id)}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors ${
              activeTab === id ? "text-accent" : "text-faint hover:text-muted"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {/* Application Modals */}
      <Suspense fallback={null}>
      <LazyAddRosterModal
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

      <LazyRosterChangeModal
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

      <LazyLeavePickerModal
        isOpen={!!leavePickerEntry}
        entry={leavePickerEntry}
        leaveRows={leaveRows}
        onClose={() => setLeavePickerEntry(null)}
        onApply={async (code, reason) => {
          if (!leavePickerEntry) return;
          const balRow = getBalanceForCode(code, leaveRows);
          const leaveType = LEAVE_CODE_TO_TYPE[code] || code;
          const displayCode = getDisplayCode(code);
          const previousCode = leavePickerEntry.currentStatusId || leavePickerEntry.originalStatusId || "";
          // Partial leaves (Short Leave / Half Day) keep the base work status:
          // the day is still worked, so NWD/RTD must NOT be replaced.
          const partial = isPartialLeaveCode(code);
          const actionText = !partial
            ? leaveType
            : code === "Short Leave"
              ? `Short Leave (Arrive by ${getShortLeaveCutoff(previousCode)})`
              : code === "LEAVE(Half)-Annual"
                ? "Half Day (Annual)"
                : "Half Day (Casual)";
          try {
            await api.updateRoster(leavePickerEntry.id, {
              currentStatusId: partial ? previousCode : displayCode,
              action: actionText,
              reason: reason || `${actionText} applied`,
              notes: reason || (partial
                ? `${actionText} on ${previousCode} - status unchanged`
                : `Converted from ${previousCode} to ${leaveType}`),
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
            const unit = code.startsWith("LEAVE(Half)") ? 0.5 : 1;
            const after = balRow && balRow.balance !== null ? Math.max(0, balRow.balance - unit) : null;
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

      <LazyAuditHistoryModal
        isOpen={!!auditModalEntry}
        entry={auditModalEntry}
        statuses={statuses}
        onClose={() => setAuditModalEntry(null)}
      />

      <LazyDeleteConfirmModal
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

      <LazyImportWizardModal
        isOpen={isImportModalOpen}
        statuses={statuses}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          setIsImportModalOpen(false);
          loadData();
        }}
      />

      <LazyExportModal
        isOpen={isExportModalOpen}
        entries={entries}
        statuses={statuses}
        onClose={() => setIsExportModalOpen(false)}
        onPrintClick={() => window.print()}
      />

      {settings && (
        <LazySettingsModal
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

      <LazyBulkEditModal
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
        <LazyOtCalculatorModal
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
      </Suspense>
    </div>
  );
}
