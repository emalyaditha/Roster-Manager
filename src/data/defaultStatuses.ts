import { RosterStatusConfig } from '../types/roster';

export const DEFAULT_ROSTER_STATUSES: RosterStatusConfig[] = [
  {
    code: 'NWD',
    displayName: 'NWD - Normal Working Day',
    description: 'Normal Working Day',
    color: '#16a34a', // Green
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/80',
    badgeText: 'text-emerald-800 dark:text-emerald-200',
    badgeBorder: 'border-emerald-300 dark:border-emerald-800',
    active: true,
    isWorkDay: true,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '08:15',
      endTime: '17:30',
      titlePrefix: 'WORK —',
    },
  },
  {
    code: 'RTD',
    displayName: 'RTD - Work on Roster',
    description: 'WORK ON ROSTER 10.15 - 7.30',
    color: '#9333ea', // Purple
    badgeBg: 'bg-purple-100 dark:bg-purple-950/80',
    badgeText: 'text-purple-800 dark:text-purple-200',
    badgeBorder: 'border-purple-300 dark:border-purple-800',
    active: true,
    isWorkDay: true,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '10:15',
      endTime: '19:30',
      titlePrefix: 'WORK —',
    },
  },
  {
    code: 'OT',
    displayName: 'OT - Work with OT',
    description: 'WORK WITH OT',
    color: '#ea580c', // Orange
    badgeBg: 'bg-orange-100 dark:bg-orange-950/80',
    badgeText: 'text-orange-800 dark:text-orange-200',
    badgeBorder: 'border-orange-300 dark:border-orange-800',
    active: true,
    isWorkDay: true,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '10:15',
      endTime: '21:00',
      titlePrefix: 'WORK (OT) —',
    },
  },
  {
    code: 'DOS',
    displayName: 'DOS - Day Off Settlement',
    description: 'WORK WITH DAY OFF SETTLEMENT',
    color: '#2563eb', // Blue
    badgeBg: 'bg-blue-100 dark:bg-blue-950/80',
    badgeText: 'text-blue-800 dark:text-blue-200',
    badgeBorder: 'border-blue-300 dark:border-blue-800',
    active: true,
    isWorkDay: true,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '10:15',
      endTime: '19:30',
      titlePrefix: 'WORK (DOS) —',
    },
  },
  {
    code: 'DOF',
    displayName: 'DOF - Day Off',
    description: 'DAY OFF',
    color: '#dc2626', // Red
    badgeBg: 'bg-red-100 dark:bg-red-950/80',
    badgeText: 'text-red-800 dark:text-red-200',
    badgeBorder: 'border-red-300 dark:border-red-800',
    active: true,
    isWorkDay: false,
    calendarEventConfig: {
      isAllDay: true,
      titlePrefix: 'DAY OFF —',
    },
  },
  {
    code: 'HOL',
    displayName: 'HOL - Normal Holiday',
    description: 'Normal Public Holiday',
    color: '#0284c7', // Sky Blue
    badgeBg: 'bg-sky-100 dark:bg-sky-950/80',
    badgeText: 'text-sky-800 dark:text-sky-200',
    badgeBorder: 'border-sky-300 dark:border-sky-800',
    active: true,
    isWorkDay: false,
    calendarEventConfig: {
      isAllDay: true,
      titlePrefix: 'NORMAL HOLIDAY —',
    },
  },
  {
    code: 'Training',
    displayName: 'Training',
    description: 'Training',
    color: '#eab308', // Yellow
    badgeBg: 'bg-amber-100 dark:bg-amber-950/80',
    badgeText: 'text-amber-800 dark:text-amber-200',
    badgeBorder: 'border-amber-300 dark:border-amber-800',
    active: true,
    isWorkDay: true,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '09:00',
      endTime: '17:00',
      titlePrefix: 'TRAINING —',
    },
  },
  {
    code: 'WFH',
    displayName: 'WFH - Work From Home',
    description: 'Work From Home',
    color: '#a855f7', // Light Purple
    badgeBg: 'bg-purple-50 dark:bg-purple-900/40',
    badgeText: 'text-purple-700 dark:text-purple-300',
    badgeBorder: 'border-purple-200 dark:border-purple-700',
    active: true,
    isWorkDay: true,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '10:15',
      endTime: '19:30',
      titlePrefix: 'WORK FROM HOME —',
    },
  },
  {
    code: 'LEAVE',
    displayName: 'LEAVE - Full Day',
    description: 'Full day leave',
    color: '#16a34a', // Green
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/80',
    badgeText: 'text-emerald-800 dark:text-emerald-200',
    badgeBorder: 'border-emerald-300 dark:border-emerald-800',
    active: true,
    isWorkDay: false,
    calendarEventConfig: {
      isAllDay: true,
      titlePrefix: 'LEAVE —',
    },
  },
  {
    code: 'Short Leave',
    displayName: 'Short Leave',
    description: 'Short Leave',
    color: '#15803d', // Green
    badgeBg: 'bg-green-100 dark:bg-green-950/80',
    badgeText: 'text-green-800 dark:text-green-200',
    badgeBorder: 'border-green-300 dark:border-green-800',
    active: true,
    isWorkDay: true,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '10:15',
      endTime: '12:15',
      titlePrefix: 'SHORT LEAVE —',
    },
  },
  {
    code: 'Leave(Half)',
    displayName: 'Leave (Half Day)',
    description: 'Half day leave',
    color: '#22c55e', // Green
    badgeBg: 'bg-teal-100 dark:bg-teal-950/80',
    badgeText: 'text-teal-800 dark:text-teal-200',
    badgeBorder: 'border-teal-300 dark:border-teal-800',
    active: true,
    isWorkDay: false,
    calendarEventConfig: {
      isAllDay: false,
      startTime: '10:15',
      endTime: '14:45',
      titlePrefix: 'HALF DAY LEAVE —',
    },
  },
  {
    code: 'ML',
    displayName: 'ML - Maternity Leave',
    description: 'Maternity Leave',
    color: '#0284c7', // Light Blue
    badgeBg: 'bg-sky-100 dark:bg-sky-950/80',
    badgeText: 'text-sky-800 dark:text-sky-200',
    badgeBorder: 'border-sky-300 dark:border-sky-800',
    active: true,
    isWorkDay: false,
    calendarEventConfig: {
      isAllDay: true,
      titlePrefix: 'MATERNITY LEAVE —',
    },
  },
];
