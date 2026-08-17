import React from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Upload,
  Download,
  RefreshCw,
  Settings,
  Search,
  Moon,
  Sun,
  LayoutDashboard,
  Table as TableIcon,
  CalendarDays,
  LogOut,
  Calculator,
} from 'lucide-react';
import { formatMonthYearDisplay, shiftMonthYear } from '../utils/date';
import { AppSettings } from '../types/roster';

interface HeaderNavbarProps {
  currentMonthYear: string;
  onMonthChange: (newMonthYear: string) => void;
  onTodayClick: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeView: 'table' | 'calendar' | 'dashboard';
  onViewChange: (view: 'table' | 'calendar' | 'dashboard') => void;
  onAddRosterClick: () => void;
  onChangeTodayClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
  onSyncCalendarClick: () => void;
  onSettingsClick: () => void;
  onOtCalculatorClick?: () => void;
  onPrintClick?: () => void;
  onTemplateClick?: () => void;
  settings: AppSettings;
  darkMode: boolean;
  onThemeToggle: () => void;
  isSyncing: boolean;
  onSignOut: () => void;
}

export const HeaderNavbar: React.FC<HeaderNavbarProps> = ({
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
  onPrintClick,
  onTemplateClick,
  settings,
  darkMode,
  onThemeToggle,
  isSyncing,
  onSignOut,
}) => {
  const [isActionsExpanded, setIsActionsExpanded] = React.useState(false);

  const viewOptions = [
    { key: 'table' as const, label: 'Table', icon: TableIcon },
    { key: 'calendar' as const, label: 'Calendar', icon: CalendarDays },
    { key: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  ];

  return (
    <header className="bg-white/90 dark:bg-zinc-950/90 glass border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-30">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          {/* Brand & Main Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center text-sm font-bold tracking-tight">
                RM
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Roster Manager
                </h1>
              </div>
            </div>

            {/* Mobile View Toggle */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setIsActionsExpanded(!isActionsExpanded)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  isActionsExpanded
                    ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300'
                    : 'bg-slate-50 border-slate-200 dark:bg-zinc-900 dark:border-zinc-800 text-slate-600 dark:text-zinc-300'
                }`}
                aria-label="Toggle Quick Actions Menu"
                aria-expanded={isActionsExpanded}
              >
                <span>Actions</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isActionsExpanded ? 'rotate-180' : ''}`} />
              </button>

              <button
                onClick={onSettingsClick}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Month Switcher & Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Today Button */}
            <button
              onClick={onTodayClick}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 transition-colors"
            >
              Today
            </button>

            {/* Month Navigation */}
            <div className="flex items-center bg-slate-100 dark:bg-zinc-800 rounded-lg p-0.5 border border-slate-200 dark:border-zinc-700">
              <button
                onClick={() => onMonthChange(shiftMonthYear(currentMonthYear, -1))}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 min-w-[100px] text-center select-none">
                {formatMonthYearDisplay(currentMonthYear)}
              </span>
              <button
                onClick={() => onMonthChange(shiftMonthYear(currentMonthYear, 1))}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="hidden sm:block relative flex-1 min-w-[160px] max-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search roster..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
              />
            </div>

            {/* View Switcher Tabs */}
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-700">
              {viewOptions.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => onViewChange(key)}
                  className={`relative flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeView === key
                      ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary Action Toolbar */}
        <div className={`mt-2.5 pt-2.5 border-t border-slate-100 dark:border-zinc-800/80 flex-wrap items-center justify-between gap-2 text-xs ${isActionsExpanded ? 'flex' : 'hidden lg:flex'}`}>
          {/* Quick Actions Left */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={onChangeTodayClick}
              className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              Change Today
            </button>

            <button
              onClick={onAddRosterClick}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Roster
            </button>

            {onOtCalculatorClick && (
              <button
                onClick={onOtCalculatorClick}
                className="px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5" />
                OT & Ledger
              </button>
            )}

            <button
              onClick={onImportClick}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 font-semibold border border-slate-200 dark:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>

            <button
              onClick={onExportClick}
              className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 font-semibold border border-slate-200 dark:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>

          {/* Integration & Settings Right */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <button
              onClick={onSyncCalendarClick}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center gap-1.5 disabled:opacity-40 text-xs"
              title="Synchronize all roster events with Google Calendar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Calendar'}
            </button>

            <button
              onClick={onThemeToggle}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={onSettingsClick}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
