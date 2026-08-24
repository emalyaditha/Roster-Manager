import React, { useEffect, useState } from "react";
import {
  LayoutList,
  CalendarDays,
  LayoutDashboard,
  KanbanSquare,
  Plus,
  Search,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  RefreshCw,
  Calculator,
  Settings,
  MoreHorizontal,
  CalendarCheck,
} from "lucide-react";

export type ViewTab = 'table' | 'calendar' | 'dashboard' | 'tasks';

interface AppShellProps {
  currentMonthYear: string;
  onMonthChange: (newMonthYear: string) => void;
  onTodayClick: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeView: ViewTab;
  onViewChange: (view: ViewTab) => void;
  onAddRosterClick: () => void;
  onChangeTodayClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
  onSyncCalendarClick: () => void;
  onSettingsClick: () => void;
  onOtCalculatorClick?: () => void;
  darkMode: boolean;
  onThemeToggle: () => void;
  isSyncing: boolean;
  userName: string;
  onSignOut: () => void;
  children?: React.ReactNode;
}

const NAV_ITEMS: { id: ViewTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "table", label: "Roster Manager", icon: LayoutList },
  { id: "tasks", label: "Task Manager", icon: KanbanSquare },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

function shiftMonth(monthYear: string, delta: number): string {
  const [y, m] = monthYear.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthYear: string): string {
  const [y, m] = monthYear.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const AppShell = React.memo<AppShellProps>(({
  currentMonthYear,
  onMonthChange,
  onTodayClick,
  searchQuery,
  onSearchChange,
  activeView,
  onViewChange,
  onAddRosterClick,
  onChangeTodayClick,
  onImportClick,
  onExportClick,
  onSyncCalendarClick,
  onSettingsClick,
  onOtCalculatorClick,
  darkMode,
  onThemeToggle,
  isSyncing,
  userName,
  onSignOut,
  children,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  const initial = (userName || "U").trim().charAt(0).toUpperCase();

  const MonthNav = () => (
    <div className="flex items-center gap-0.5 min-w-0">
      <button onClick={() => onMonthChange(shiftMonth(currentMonthYear, -1))} className="btn-icon !h-8 !w-8" aria-label="Previous month">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={onTodayClick}
        title="Jump to current month"
        className="font-semibold text-fg tracking-tight hover:text-accent transition-colors truncate text-sm px-2 min-w-[7.5rem] text-center"
      >
        {monthLabel(currentMonthYear)}
      </button>
      <button onClick={() => onMonthChange(shiftMonth(currentMonthYear, 1))} className="btn-icon !h-8 !w-8" aria-label="Next month">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  /* ── Desktop / tablet sidebar ── */
  const Sidebar = (
    <aside className="fixed inset-y-0 left-0 z-40 hidden md:flex flex-col border-r border-line bg-surface md:w-14 lg:w-60">
      {/* Brand */}
      <div className="h-14 flex items-center gap-3 border-b border-line px-4 lg:px-5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-accent text-on-accent flex items-center justify-center shrink-0">
          <span className="text-[13px] font-bold leading-none">E</span>
        </div>
        <span className="hidden lg:block text-sm font-semibold tracking-tight text-fg whitespace-nowrap">EM Roster</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 lg:px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              title={label}
              className={`w-full flex items-center gap-3 rounded-md h-9 px-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent-soft text-accent" : "text-muted hover:bg-well hover:text-fg"
              }`}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className="hidden lg:block">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-line p-2 lg:p-3 space-y-1">
        <button
          onClick={onThemeToggle}
          title={darkMode ? "Light mode" : "Dark mode"}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          className="btn-icon w-full justify-start gap-3 !rounded-md hidden lg:inline-flex"
        >
          {darkMode ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          <span className="hidden lg:block text-sm font-medium">{darkMode ? "Light" : "Dark"}</span>
        </button>
        <div className="flex items-center gap-3 rounded-md h-9 px-2.5">
          <div className="w-6 h-6 rounded-full bg-well text-muted text-[11px] font-semibold flex items-center justify-center shrink-0">
            {initial}
          </div>
          <span className="hidden lg:block text-xs font-medium text-muted truncate flex-1">{userName || "User"}</span>
          <button onClick={onSignOut} title="Sign out" aria-label="Sign out" className="btn-icon !h-7 !w-7 hidden lg:inline-flex">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  /* ── Overflow menu actions ── */
  const MenuActions = (
    <>
      {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}
      <div className="relative">
        <button onClick={() => setMenuOpen((v) => !v)} className="btn-icon !h-8 !w-8" title="More actions" aria-label="More actions" aria-expanded={menuOpen}>
          <MoreHorizontal className="w-[18px] h-[18px]" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1.5 z-50 w-52 card shadow-[var(--shadow-md)] p-1 animate-scaleIn origin-top-right">
            {[
              { icon: CalendarCheck, label: "Change today", fn: onChangeTodayClick },
              { icon: RefreshCw, label: isSyncing ? "Syncing…" : "Sync calendar", fn: onSyncCalendarClick, disabled: isSyncing },
              ...(onOtCalculatorClick ? [{ icon: Calculator, label: "OT calculator", fn: onOtCalculatorClick }] : []),
              { icon: Settings, label: "Settings", fn: onSettingsClick },
            ].map(({ icon: Icon, label, fn, disabled }) => (
              <button
                key={label}
                onClick={() => { setMenuOpen(false); fn(); }}
                disabled={(disabled as boolean | undefined) ?? false}
                className="btn-ghost w-full flex items-center justify-start gap-2.5 !h-9 px-3 rounded-md text-sm font-medium text-fg"
              >
                <Icon className="w-4 h-4 shrink-0 text-muted" />
                <span className="truncate">{label}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <button onClick={() => { setMenuOpen(false); onThemeToggle(); }} className="btn-ghost w-full flex items-center justify-start gap-2.5 !h-9 px-3 rounded-md text-sm font-medium md:hidden">
              {darkMode ? <Sun className="w-4 h-4 shrink-0 text-muted" /> : <Moon className="w-4 h-4 shrink-0 text-muted" />}
              <span>{darkMode ? "Light mode" : "Dark mode"}</span>
            </button>
            <button onClick={() => { setMenuOpen(false); onSignOut(); }} className="btn-ghost w-full flex items-center justify-start gap-2.5 !h-9 px-3 rounded-md text-sm font-medium md:hidden">
              <LogOut className="w-4 h-4 shrink-0 text-muted" />
              <span>Sign out</span>
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-page">
      {Sidebar}

      <div className="md:pl-14 lg:pl-60 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-12 bg-page/85 backdrop-blur border-b border-line">
          <div className="h-full max-w-[1200px] mx-auto px-4 sm:px-6 flex items-center gap-2">
            {/* Mobile brand */}
            <div className="md:hidden w-6 h-6 rounded-md bg-accent text-on-accent flex items-center justify-center shrink-0 mr-1">
              <span className="text-[11px] font-bold leading-none">E</span>
            </div>

            <MonthNav />

            {/* Search — tablet+ */}
            <div className="relative ml-auto hidden sm:block w-44 md:w-56 lg:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search…"
                className="input-min !h-8 pl-8 pr-3 text-xs"
              />
            </div>

            <div className="flex items-center gap-0.5 ml-auto sm:ml-2">
              <button onClick={onAddRosterClick} className="btn-primary !h-8 !px-2.5 sm:!px-3 !text-xs" title="Add roster entry">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>

              {/* Import/export pair — desktop */}
              <button onClick={onImportClick} className="btn-icon !h-8 !w-8 hidden md:inline-flex" title="Import" aria-label="Import">
                <Upload className="w-4 h-4" />
              </button>
              <button onClick={onExportClick} className="btn-icon !h-8 !w-8 hidden md:inline-flex" title="Export" aria-label="Export">
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={onThemeToggle}
                className="btn-icon !h-8 !w-8 md:hidden"
                title={darkMode ? "Light mode" : "Dark mode"}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {MenuActions}
            </div>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
});
