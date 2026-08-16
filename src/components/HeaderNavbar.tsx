import React from 'react';
import { motion } from 'motion/react';
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
    <header className="bg-white/80 dark:bg-zinc-900/80 glass border-b border-slate-200/80 dark:border-zinc-800/80 sticky top-0 z-30 transition-all">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          {/* Brand & Main Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.05, rotate: -3 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-purple-600/20 cursor-pointer"
              >
                RM
              </motion.div>
              <div>
                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  Roster Manager
                </h1>
              </div>
            </div>

            {/* Mobile View Toggle */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setIsActionsExpanded(!isActionsExpanded)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  isActionsExpanded
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400'
                    : 'bg-slate-50 border-slate-200 dark:bg-zinc-800 dark:border-zinc-700 text-slate-700 dark:text-zinc-300'
                }`}
                aria-label="Toggle Quick Actions Menu"
                aria-expanded={isActionsExpanded}
              >
                <span>Actions</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isActionsExpanded ? 'rotate-180' : ''}`} />
              </button>

              <button
                onClick={onSettingsClick}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Month Switcher & Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Today Button */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onTodayClick}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Today
            </motion.button>

            {/* Month Navigation */}
            <div className="flex items-center bg-slate-100 dark:bg-zinc-800 rounded-xl p-0.5 border border-slate-200 dark:border-zinc-700">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onMonthChange(shiftMonthYear(currentMonthYear, -1))}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.button>
              <span className="px-3 text-xs font-bold text-slate-800 dark:text-slate-200 min-w-[100px] text-center select-none">
                {formatMonthYearDisplay(currentMonthYear)}
              </span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onMonthChange(shiftMonthYear(currentMonthYear, 1))}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Search Input (Desktop/Tablet) */}
            <div className="hidden sm:block relative flex-1 min-w-[160px] max-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search roster..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400 transition-all"
              />
            </div>

            {/* View Switcher Tabs */}
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl border border-slate-200 dark:border-zinc-700">
              {viewOptions.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => onViewChange(key)}
                  className={`relative flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    activeView === key
                      ? 'text-purple-700 dark:text-purple-300'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {activeView === key && (
                    <motion.div
                      layoutId="activeViewTab"
                      className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-lg shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary Action Toolbar */}
        <div className={`mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 flex-wrap items-center justify-between gap-2 text-xs ${isActionsExpanded ? 'flex' : 'hidden lg:flex'}`}>
          {/* Quick Actions Left */}
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onChangeTodayClick}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-extrabold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              Change Today's Roster
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onAddRosterClick}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold transition-all flex items-center gap-1.5 shadow-md shadow-purple-600/25 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Roster
            </motion.button>

            {onOtCalculatorClick && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onOtCalculatorClick}
                className="px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30 font-extrabold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                OT & Ledger Engine
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onImportClick}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-extrabold border border-slate-200/80 dark:border-zinc-700/80 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-purple-500" />
              Import
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onExportClick}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-extrabold border border-slate-200/80 dark:border-zinc-700/80 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-purple-500" />
              Export
            </motion.button>
          </div>

          {/* Integration & Settings Right */}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onSyncCalendarClick}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/80 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="Synchronize all roster events with Google Calendar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Google Calendar'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={onThemeToggle}
              className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-colors"
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={onSettingsClick}
              className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={onSignOut}
              className="p-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </header>
  );
};
