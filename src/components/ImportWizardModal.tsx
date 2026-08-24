import React, { useState, useEffect } from 'react';
import type { WorkBook } from 'xlsx';
import Papa from 'papaparse';
import { RosterStatusConfig, ImportHistoryRecord } from '../types/roster';
import { api } from '../services/api';
import { formatDateDisplay } from '../utils/date';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowRight,
  RefreshCw,
  Info,
  Clock,
  Layers,
  User,
  ShieldCheck,
  Calendar,
  Sparkles,
  History,
  Check,
  AlertCircle,
} from 'lucide-react';

interface ImportWizardModalProps {
  isOpen: boolean;
  statuses: RosterStatusConfig[];
  onClose: () => void;
  onImportComplete: () => void;
}

// Normalized status code map
const STATUS_ALIASES: Record<string, string> = {
  '': 'HOL',
  'HOL': 'HOL',
  'HOLIDAY': 'HOL',
  'NORMAL HOLIDAY': 'HOL',
  'PUBLIC HOLIDAY': 'HOL',
  'NORMAL PUBLIC HOLIDAY': 'HOL',
  'NWD': 'NWD',
  'NORMAL WORKING DAY': 'NWD',
  'WORK FROM HOME': 'WFH',
  'WFH': 'WFH',
  'REMOTE': 'WFH',
  'HOME': 'WFH',
  'DAY OFF': 'DOF',
  'DOF': 'DOF',
  'OFF': 'DOF',
  'REST': 'DOF',
  'DAY OFF SPECIAL': 'DOS',
  'DOS': 'DOS',
  'FULL DAY LEAVE': 'LEAVE',
  'LEAVE': 'LEAVE',
  'ANNUAL LEAVE': 'LEAVE',
  'AL': 'LEAVE',
  'HALF DAY LEAVE': 'Leave(Half)',
  'LEAVE(HALF)': 'Leave(Half)',
  'HL': 'Leave(Half)',
  'SHORT LEAVE': 'Short Leave',
  'SL': 'Short Leave',
  'MATERNITY LEAVE': 'ML',
  'MEDICAL LEAVE': 'ML',
  'ML': 'ML',
  'ROSTER TO DUTY': 'RTD',
  'RTD': 'RTD',
  'DUTY': 'RTD',
  'REGULAR': 'RTD',
  'TRAINING': 'Training',
  'TRG': 'Training',
  'OVERTIME': 'OT',
  'OT': 'OT',
};

// Simple color hex to status code mapping
const COLOR_STATUS_MAP: Record<string, string> = {
  '9333EA': 'RTD', // Purple
  'DC2626': 'DOF', // Red
  'EAB308': 'Training', // Yellow
  '3B82F6': 'WFH', // Light Blue / Light Purple
  '16A34A': 'LEAVE', // Green
};

// Date normalization helper (supports ISO, DD/MM/YYYY, MM/DD/YYYY, Excel Serials, Month Names)
function parseExcelDate(raw: any): { isoDate: string; dayName: string } | null {
  if (raw === null || raw === undefined || raw === '') return null;

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Case 1: Excel Serial Number (e.g., 46250 = 2026-08-16)
  if (typeof raw === 'number' && !isNaN(raw)) {
    try {
      // Pure JS Excel serial date conversion (avoids importing xlsx for this)
      const utcDays = raw - 25569;
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      const yyyy = dateInfo.getUTCFullYear();
      const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      return { isoDate, dayName: DAYS[dateInfo.getUTCDay()] || 'Sunday' };
    } catch {
      return null;
    }
  }

  // Case 2: JavaScript Date Object (if SheetJS created one)
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const localHour = raw.getHours();
    const utcHour = raw.getUTCHours();
    let y = raw.getFullYear();
    let m = raw.getMonth() + 1;
    let d = raw.getDate();

    if (utcHour === 0 && localHour !== 0) {
      y = raw.getUTCFullYear();
      m = raw.getUTCMonth() + 1;
      d = raw.getUTCDate();
    }

    const yyyy = y;
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const dayIdx = new Date(yyyy, m - 1, d).getDay();
    return { isoDate, dayName: DAYS[dayIdx] || 'Sunday' };
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Case 3: Formatted date strings (e.g. 8/16/26, 08/16/2026, 16/08/2026, 2026-08-16, 8.16.26, etc.)
  if (/^\d{1,4}[\/\-\.]\d{1,4}[\/\-\.]\d{1,4}$/.test(str)) {
    const parts = str.split(/[\/\-\.]/).map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      let y = 0, m = 0, d = 0;

      // If first part is 4-digit year (YYYY-MM-DD)
      if (parts[0] > 31) {
        y = parts[0] < 100 ? parts[0] + 2000 : parts[0];
        m = parts[1];
        d = parts[2];
      } else {
        // Year is at the end (e.g. MM/DD/YY, M/D/YY, DD/MM/YYYY, etc.)
        y = parts[2] < 100 ? parts[2] + 2000 : parts[2];

        if (parts[0] > 12) {
          // Day first (DD/MM/YY)
          d = parts[0];
          m = parts[1];
        } else if (parts[1] > 12) {
          // Month first (MM/DD/YY)
          m = parts[0];
          d = parts[1];
        } else {
          // Both <= 12. Default to month first as in standard Excel rosters (e.g. 8/9/26 = Aug 9)
          m = parts[0];
          d = parts[1];
        }
      }

      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const yyyy = y;
        const mm = String(m).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        const isoDate = `${yyyy}-${mm}-${dd}`;
        const dayIdx = new Date(yyyy, m - 1, d).getDay();
        return { isoDate, dayName: DAYS[dayIdx] || 'Sunday' };
      }
    }
  }

  // Case 4: Text dates like "16-Aug-2026", "Aug 16, 2026", "16 Aug 2026"
  const monthNames: { [key: string]: number } = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };

  const words = str.toLowerCase().replace(/,/g, ' ').split(/[\s\-]+/);
  if (words.length >= 2) {
    let foundMonth = 0;
    let foundDay = 0;
    let foundYear = 0;

    for (const w of words) {
      if (monthNames[w]) {
        foundMonth = monthNames[w];
      } else {
        const num = Number(w);
        if (!isNaN(num)) {
          if (num > 31) {
            foundYear = num < 100 ? num + 2000 : num;
          } else if (foundDay === 0) {
            foundDay = num;
          } else if (foundYear === 0) {
            foundYear = num < 100 ? num + 2000 : num;
          }
        }
      }
    }

    if (foundMonth > 0 && foundDay > 0) {
      if (foundYear === 0) foundYear = new Date().getFullYear();
      const yyyy = foundYear;
      const mm = String(foundMonth).padStart(2, '0');
      const dd = String(foundDay).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const dayIdx = new Date(yyyy, foundMonth - 1, foundDay).getDay();
      return { isoDate, dayName: DAYS[dayIdx] || 'Sunday' };
    }
  }

  return null;
}

// Calculate simple string hash for file duplicate detection
function computeStringHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'hash-' + Math.abs(hash).toString(16);
}

export const ImportWizardModal: React.FC<ImportWizardModalProps> = ({
  isOpen,
  statuses,
  onClose,
  onImportComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'history'>('import');

  // Wizard Step State
  const [step, setStep] = useState<
    'upload' | 'sheet_select' | 'employee_select' | 'column_map' | 'preview' | 'result'
  >('upload');

  // Workbook & File State
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [duplicateNotice, setDuplicateNotice] = useState<{
    isDuplicate: boolean;
    previousImport?: ImportHistoryRecord;
  } | null>(null);

  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  // Multi-Employee detection
  const [availableEmployees, setAvailableEmployees] = useState<string[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('EMAL');

  // Raw Sheet Data & Headers
  const [rawSheetRows, setRawSheetRows] = useState<any[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);

  // Column Mapping State
  const [columnMap, setColumnMap] = useState<{
    dateCol: string;
    dayCol: string;
    rosterCol: string;
    actionCol: string;
    otCol: string;
  }>({
    dateCol: '',
    dayCol: '',
    rosterCol: '',
    actionCol: '',
    otCol: '',
  });

  // Color & Conflict Warnings
  const [colorMismatches, setColorMismatches] = useState<
    { rowIndex: number; textStatus: string; colorStatus: string; choice: 'text' | 'color' | 'skip' }[]
  >([]);

  // Parsed Preview Rows
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [autoFilledMissingDates, setAutoFilledMissingDates] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import Result
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    successCount: number;
    createdCount: number;
    updatedCount: number;
    failedCount: number;
    failedRows: any[];
    historyRecord?: ImportHistoryRecord;
  } | null>(null);

  const [calendarSynced, setCalendarSynced] = useState(false);

  // Import History Tab Data
  const [importHistoryList, setImportHistoryList] = useState<ImportHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load History on Tab Switch
  useEffect(() => {
    if (activeTab === 'history') {
      setLoadingHistory(true);
      api
        .getImportHistory()
        .then((res) => setImportHistoryList(res))
        .catch(console.error)
        .finally(() => setLoadingHistory(false));
    }
  }, [activeTab]);

  if (!isOpen) return null;

  // Download Sample Excel Template
  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const sampleData = [
      {
        DATE: '10/08/2026',
        DAY: 'Monday',
        'ORIGINAL ROSTER': 'RTD',
        ACTION: 'Work on Roster 10.15 - 7.30',
        NOTES: 'Office Duty',
        OT: 'NO',
      },
      {
        DATE: '11/08/2026',
        DAY: 'Tuesday',
        'ORIGINAL ROSTER': 'WFH',
        ACTION: 'Work From Home',
        NOTES: 'Team Remote Day',
        OT: 'NO',
      },
      {
        DATE: '12/08/2026',
        DAY: 'Wednesday',
        'ORIGINAL ROSTER': 'DOF',
        ACTION: 'Day Off',
        NOTES: '',
        OT: 'NO',
      },
      {
        DATE: '13/08/2026',
        DAY: 'Thursday',
        'ORIGINAL ROSTER': 'LEAVE',
        ACTION: 'Full Day Leave',
        NOTES: 'Annual Leave',
        OT: 'NO',
      },
      {
        DATE: '14/08/2026',
        DAY: 'Friday',
        'ORIGINAL ROSTER': 'Training',
        ACTION: 'Compliance Training',
        NOTES: 'Annual Training',
        OT: 'NO',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Official Roster Template');
    XLSX.writeFile(wb, 'EM_Official_Roster_Template.xlsx');
  };

  // STEP 1: Handle Upload File
  const handleFileUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsAnalyzing(true);

    try {
      const XLSX = await import('xlsx');

      // Calculate simple hash
      const hash = computeStringHash(`${uploadedFile.name}-${uploadedFile.size}-${uploadedFile.lastModified}`);
      setFileHash(hash);

      // Check duplicate import
      const dupRes = await api.checkDuplicateImport(hash);
      setDuplicateNotice(dupRes);

      const buffer = await uploadedFile.arrayBuffer();
      const wb = XLSX.read(buffer, { cellStyles: true, cellFormula: true, cellDates: false });

      setWorkbook(wb);
      setSheetNames(wb.SheetNames);

      if (wb.SheetNames.length > 1) {
        // Recommend best sheet
        const bestSheet =
          wb.SheetNames.find(
            (s) =>
              s.toLowerCase().includes('roster') ||
              s.toLowerCase().includes('schedule') ||
              s.toLowerCase().includes('aug') ||
              s.toLowerCase().includes('sep') ||
              s.toLowerCase().includes('2026')
          ) || wb.SheetNames[0];

        setSelectedSheet(bestSheet);
        setStep('sheet_select');
      } else {
        const firstSheet = wb.SheetNames[0];
        setSelectedSheet(firstSheet);
        processSheetData(wb, firstSheet);
      }
    } catch (err) {
      console.error('Error reading excel:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Process chosen sheet
  const processSheetData = async (wb: WorkBook, sheetName: string) => {
    const XLSX = await import('xlsx');
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
    if (!rawRows || rawRows.length === 0) return;

    // Find Header Row (first non-empty row)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      if (Array.isArray(rawRows[i]) && rawRows[i].some((cell: any) => cell !== '')) {
        headerIdx = i;
        break;
      }
    }

    const headers: string[] = (rawRows[headerIdx] || []).map((h: any) => String(h).trim());
    setSheetHeaders(headers);

    const dataObjectRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerIdx });
    setRawSheetRows(dataObjectRows);

    // Auto-detect employee columns (any column that is not Date or Day)
    const nonEmployeeKeywords = ['DATE', 'DT', 'DAY', 'ACTION', 'SHIFT', 'OT', 'OVERTIME', 'NOTES', 'REMARKS'];
    const empCols = headers.filter(
      (h) => h && !nonEmployeeKeywords.includes(h.toUpperCase())
    );

    const defaultEmp =
      empCols.find((h) => h.toUpperCase().includes('EMAL')) ||
      empCols[0] ||
      'EMAL';

    if (empCols.length > 0) {
      setAvailableEmployees(empCols);
      setSelectedEmployee(defaultEmp);
    } else {
      setAvailableEmployees(['EMAL']);
      setSelectedEmployee('EMAL');
    }

    // Auto Column Mapping
    let detectedDate =
      headers.find((h) => h.toUpperCase().includes('DATE') || h.toUpperCase() === 'DT') || headers[0] || '';
    let detectedDay = headers.find((h) => h.toUpperCase().includes('DAY')) || '';
    let detectedRoster = defaultEmp || headers[2] || headers[1] || '';
    let detectedAction = headers.find((h) => h.toUpperCase().includes('ACTION') || h.toUpperCase().includes('SHIFT')) || '';
    let detectedOt = headers.find((h) => h.toUpperCase().includes('OT') || h.toUpperCase().includes('OVERTIME')) || '';

    setColumnMap({
      dateCol: detectedDate,
      dayCol: detectedDay,
      rosterCol: detectedRoster,
      actionCol: detectedAction,
      otCol: detectedOt,
    });

    if (empCols.length > 1) {
      setStep('employee_select');
    } else {
      setStep('column_map');
    }
  };

  // Convert raw rows using column mapping into normalized preview rows
  const generatePreview = () => {
    const mapped: any[] = [];
    const mismatches: any[] = [];

    rawSheetRows.forEach((row, idx) => {
      const rawDate = row[columnMap.dateCol];
      const parsedDate = parseExcelDate(rawDate);

      if (!parsedDate) return; // Skip invalid date rows

      const dateStr = parsedDate.isoDate;
      const dayStr = columnMap.dayCol && row[columnMap.dayCol] ? String(row[columnMap.dayCol]).trim() : parsedDate.dayName;

      // Raw Roster Value
      const rawRoster = String(row[columnMap.rosterCol] ?? '').trim();
      const upperRoster = rawRoster.toUpperCase();

      // Normalize status code
      let detectedStatus = '';
      if (!upperRoster) {
        // Blank or empty cell in Excel roster means Normal Holiday / Public Holiday (HOL)
        detectedStatus = 'HOL';
      } else if (STATUS_ALIASES[upperRoster]) {
        detectedStatus = STATUS_ALIASES[upperRoster];
      } else if (upperRoster.startsWith('DOF(') || upperRoster.startsWith('DOF')) {
        // e.g. DOF(08/02) or DOF(08/09)
        detectedStatus = 'DOF';
      } else if (/^DOS\s*\(\s*([0-9]+(?:[.:][0-9]+)?)\s*\)/.test(upperRoster)) {
        // e.g. DOS(10.00) or DOS(9.30) — preserve the shift-time variant as its own status code
        const timePart = upperRoster.match(/^DOS\s*\(\s*([0-9]+(?:[.:][0-9]+)?)\s*\)/)![1].replace(':', '.');
        detectedStatus = `DOS(${timePart})`;
      } else if (upperRoster.startsWith('DOS')) {
        detectedStatus = 'DOS';
      } else {
        detectedStatus = rawRoster;
      }

      // Action / Shift title
      let actionTitle =
        columnMap.actionCol && row[columnMap.actionCol]
          ? String(row[columnMap.actionCol]).trim()
          : '';

      if (!actionTitle) {
        if (detectedStatus === 'RTD') {
          actionTitle = 'Work on Roster 10.15 - 7.30';
        } else if (detectedStatus === 'NWD') {
          actionTitle = 'Normal Working Day';
        } else if (detectedStatus === 'HOL') {
          actionTitle = rawRoster ? rawRoster : 'Normal Holiday';
        } else if (detectedStatus === 'DOF') {
          actionTitle = rawRoster ? rawRoster : 'Day Off';
        } else if (detectedStatus === 'DOS') {
          actionTitle = rawRoster ? rawRoster : 'Work with Day Off Settlement';
        } else {
          actionTitle = detectedStatus;
        }
      }

      // OT
      const rawOt = columnMap.otCol ? row[columnMap.otCol] : false;
      const isOt = String(rawOt).toUpperCase() === 'YES' || Boolean(rawOt) || detectedStatus === 'OT';

      mapped.push({
        rowIndex: idx + 1,
        date: dateStr,
        day: dayStr,
        originalStatus: detectedStatus,
        changedStatus: '',
        action: actionTitle,
        ot: isOt,
        isValid: true,
      });
    });

    setPreviewRows(mapped);
    setColorMismatches(mismatches);

    // SORT & AUTOMATIC MISSING DATE VERIFICATION
    mapped.sort((a, b) => a.date.localeCompare(b.date));

    const autoFilledList: string[] = [];
    if (mapped.length > 0) {
      const existingDates = new Set(mapped.map((r) => r.date));
      const minDateStr = mapped[0].date;
      const maxDateStr = mapped[mapped.length - 1].date;

      const startDate = new Date(minDateStr + 'T00:00:00');
      const endDate = new Date(maxDateStr + 'T00:00:00');

      let curr = new Date(startDate);
      while (curr <= endDate) {
        const yyyy = curr.getFullYear();
        const mm = String(curr.getMonth() + 1).padStart(2, '0');
        const dd = String(curr.getDate()).padStart(2, '0');
        const isoCheck = `${yyyy}-${mm}-${dd}`;

        if (!existingDates.has(isoCheck)) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayName = dayNames[curr.getDay()];

          mapped.push({
            rowIndex: -1,
            date: isoCheck,
            day: dayName,
            originalStatus: 'HOL',
            changedStatus: '',
            action: 'Normal Holiday',
            ot: false,
            isValid: true,
            isAutoFilled: true,
          });

          autoFilledList.push(`${isoCheck} (${dayName})`);
        }

        curr.setDate(curr.getDate() + 1);
      }

      // Re-sort chronologically after auto-filling missing dates
      mapped.sort((a, b) => a.date.localeCompare(b.date));
    }

    setAutoFilledMissingDates(autoFilledList);
    setPreviewRows(mapped);
    setStep('preview');
  };

  // Run Final Import
  const handleConfirmImport = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.importRows(previewRows, {
        filename: file?.name || 'Official_Office_Roster.xlsx',
        fileHash,
        employeeName: selectedEmployee,
        sheetName: selectedSheet,
        preserveChangedRoster: true,
      });

      setImportResult(res);
      setStep('result');
      onImportComplete();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sync Google Calendar Post-Import
  const handleSyncCalendarPostImport = async () => {
    try {
      await api.syncAllCalendar();
      setCalendarSynced(true);
    } catch (err) {
      console.error(err);
    }
  };

  const stepDot = (current: boolean, done: boolean) => ({
    dot: current
      ? 'w-2 h-2 rounded-full ring-1 ring-accent'
      : 'w-2 h-2 rounded-full',
    dotColor: current
      ? 'transparent'
      : done
      ? 'var(--success)'
      : 'var(--color-border)',
    label: current ? 'text-accent' : done ? 'text-fg' : 'text-muted',
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4">
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-3xl md:max-h-[85vh] max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn">

        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-accent shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg truncate">
                Import Original Office Roster
              </h3>
              <p className="text-xs text-muted truncate">
                Official Excel spreadsheet import with automatic detection & protection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Download Template Button */}
            <button
              onClick={handleDownloadTemplate}
              title="Download Excel Roster Template"
              className="btn-min btn-secondary text-xs"
            >
              <Download className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline">Excel Template</span>
            </button>

            <button onClick={onClose} className="btn-icon" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Tab Toggle: Import Wizard vs Import History */}
        <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex gap-1 bg-well p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('import')}
              className={`rounded-md px-3 h-8 text-xs font-medium transition-colors ${
                activeTab === 'import'
                  ? 'bg-surface text-fg shadow-[var(--shadow-xs)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Import Roster Wizard
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-surface text-fg shadow-[var(--shadow-xs)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Import History
            </button>
          </div>

          {/* Stepper Progress Bar */}
          {activeTab === 'import' && (() => {
            const stepsDone: Record<string, boolean[]> = {
              upload: [false, false, false, false],
              sheet_select: [true, false, false, false],
              employee_select: [true, false, false, false],
              column_map: [true, true, false, false],
              preview: [true, true, true, false],
              result: [true, true, true, true],
            };
            const flags = stepsDone[step];
            const labels = ['Upload', 'Map Columns', 'Preview', 'Complete'];
            const currents = ['upload', 'column_map', 'preview', 'result'];
            return (
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium">
                {labels.map((label, i) => {
                  const s = stepDot(currents[i] === step, flags[i]);
                  return (
                    <React.Fragment key={label}>
                      {i > 0 && <ArrowRight className="w-3 h-3 text-faint" />}
                      <span className="flex items-center gap-1.5">
                        <span className={s.dot} style={{ backgroundColor: s.dotColor }} />
                        <span className={s.label}>{label}</span>
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Modal Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">

          {/* TAB 1: IMPORT WIZARD */}
          {activeTab === 'import' && (
            <>
              {/* STEP: UPLOAD */}
              {step === 'upload' && (
                <div className="space-y-4">
                  <div className="border border-dashed border-line rounded-lg p-6 text-center hover:border-accent transition-colors cursor-pointer relative group">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-12 h-12 rounded-lg bg-[var(--accent-soft)] text-accent flex items-center justify-center mx-auto mb-3">
                      <Upload className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-semibold text-fg mb-1">
                      Drag & Drop Official Office Excel Roster Here
                    </h4>
                    <p className="text-xs text-muted mb-3">
                      or click to browse your computer (.xlsx, .xls, .csv)
                    </p>
                    <span className="chip chip-neutral">Supports: XLSX • XLS • CSV</span>
                  </div>

                  {/* Highlights Callout */}
                  <div className="card p-4 space-y-2">
                    <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-accent" />
                      Smart Office Import Guarantees
                    </span>
                    <ul className="grid sm:grid-cols-2 gap-2 text-muted text-[11px] list-disc list-inside">
                      <li>Automatic date parsing & status code mapping</li>
                      <li>Preserves your manual roster changes (e.g. WFH)</li>
                      <li>Multi-sheet and multi-employee column auto-detection</li>
                      <li>Duplicate file detection protection</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* STEP: SHEET SELECTION */}
              {step === 'sheet_select' && (
                <div className="space-y-4">
                  <div className="card p-4">
                    <h4 className="text-sm font-medium text-fg mb-1">
                      Multiple Roster Sheets Detected
                    </h4>
                    <p className="text-xs text-muted">
                      Please select the worksheet containing the official office roster data:
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {sheetNames.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSelectedSheet(s);
                          if (workbook) processSheetData(workbook, s);
                        }}
                        className={`p-4 rounded-lg border text-left font-medium flex items-center justify-between transition-colors ${
                          selectedSheet === s
                            ? 'border-accent bg-[var(--accent-soft)] text-fg'
                            : 'border-line bg-surface text-fg hover:border-[var(--color-text-faint)]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-accent" />
                          {s}
                        </span>
                        {selectedSheet === s && <Check className="w-4 h-4 text-accent" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP: EMPLOYEE SELECTION */}
              {step === 'employee_select' && (
                <div className="space-y-4">
                  <div className="card p-4">
                    <h4 className="text-sm font-medium text-fg mb-1">
                      Select Employee Roster
                    </h4>
                    <p className="text-xs text-muted">
                      The uploaded spreadsheet contains roster data for multiple employees. Select your column/profile:
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {availableEmployees.map((emp) => (
                      <button
                        key={emp}
                        type="button"
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setColumnMap((prev) => ({ ...prev, rosterCol: emp }));
                          setStep('column_map');
                        }}
                        className={`p-3 rounded-lg border text-left font-medium flex items-center gap-2.5 transition-colors ${
                          selectedEmployee === emp
                            ? 'border-accent bg-[var(--accent-soft)] text-fg'
                            : 'border-line bg-surface text-fg hover:border-[var(--color-text-faint)]'
                        }`}
                      >
                        <User className="w-4 h-4 text-accent" />
                        <span>{emp}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP: COLUMN MAPPING */}
              {step === 'column_map' && (
                <div className="space-y-4">
                  <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="font-medium text-fg text-sm">
                        Confirm Excel Column Mapping
                      </h4>
                      <p className="text-xs text-muted">
                        File: <strong>{file?.name}</strong> | Sheet: <strong>{selectedSheet}</strong>
                      </p>
                    </div>
                    <span className="chip chip-accent">Auto-Detected</span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-fg mb-1">
                        Date Column <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <select
                        value={columnMap.dateCol}
                        onChange={(e) => setColumnMap({ ...columnMap, dateCol: e.target.value })}
                        className="input-min"
                      >
                        {sheetHeaders.map((h, i) => (
                          <option key={`dateCol-${h}-${i}`} value={h}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-fg mb-1">
                        Day Column (Optional)
                      </label>
                      <select
                        value={columnMap.dayCol}
                        onChange={(e) => setColumnMap({ ...columnMap, dayCol: e.target.value })}
                        className="input-min"
                      >
                        <option value="">-- Calculate Automatically --</option>
                        {sheetHeaders.map((h, i) => (
                          <option key={`dayCol-${h}-${i}`} value={h}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-fg mb-1">
                        Original Roster Status Column <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <select
                        value={columnMap.rosterCol}
                        onChange={(e) => setColumnMap({ ...columnMap, rosterCol: e.target.value })}
                        className="input-min"
                      >
                        {sheetHeaders.map((h, i) => (
                          <option key={`rosterCol-${h}-${i}`} value={h}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-fg mb-1">
                        Action / Shift Title Column
                      </label>
                      <select
                        value={columnMap.actionCol}
                        onChange={(e) => setColumnMap({ ...columnMap, actionCol: e.target.value })}
                        className="input-min"
                      >
                        <option value="">-- Default Duty Description --</option>
                        {sheetHeaders.map((h, i) => (
                          <option key={`actionCol-${h}-${i}`} value={h}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={generatePreview}
                      className="btn-min btn-primary"
                    >
                      <span>Generate Roster Preview</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: PREVIEW */}
              {step === 'preview' && (
                <div className="space-y-4">
                  {/* Duplicate Notice Warning */}
                  {duplicateNotice?.isDuplicate && (
                    <div
                      className="p-3.5 rounded-lg flex items-center justify-between gap-3 flex-wrap"
                      style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
                    >
                      <span className="text-xs font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        This roster file was previously imported on{' '}
                        {new Date(duplicateNotice.previousImport?.uploadTimestamp || '').toLocaleDateString()}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded font-semibold text-[10px]"
                        style={{ background: 'var(--warning)', color: 'var(--on-accent)' }}
                      >
                        Duplicate File Detected
                      </span>
                    </div>
                  )}

                  {/* Missing Dates Auto-Filled Notice */}
                  {autoFilledMissingDates.length > 0 && (
                    <div
                      className="p-3.5 rounded-lg"
                      style={{ background: 'var(--info-bg)', color: 'var(--info)' }}
                    >
                      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
                        <span className="font-semibold flex items-center gap-2 text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          {autoFilledMissingDates.length} Missing Date(s) Auto-Detected & Included as Normal Holiday (HOL)
                        </span>
                        <span
                          className="px-2 py-0.5 rounded font-semibold text-[10px]"
                          style={{ background: 'var(--info)', color: 'var(--on-accent)' }}
                        >
                          Date Continuity Verified
                        </span>
                      </div>
                      <p className="text-[11px]">
                        The uploaded Excel file skipped the following date(s): <strong>{autoFilledMissingDates.join(', ')}</strong>.
                        To ensure your roster is 100% complete without missing days, they have been automatically inserted as <strong>Normal Holiday (HOL)</strong> before saving.
                      </p>
                    </div>
                  )}

                  {/* Summary Bar */}
                  <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-medium text-fg text-sm">
                        Original Roster Import Preview
                      </h4>
                      <p className="text-xs text-muted">
                        File: {file?.name} | Employee: {selectedEmployee}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="chip chip-success">
                        {previewRows.length} Valid Rows
                      </span>
                      <span className="chip chip-accent">
                        Protected User Changes
                      </span>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="max-h-64 overflow-y-auto border border-line rounded-lg">
                    <table className="w-full table-fixed text-left border-collapse">
                      <thead>
                        <tr className="bg-well">
                          <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line px-3 py-2 w-[20%]">Date</th>
                          <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line px-3 py-2 w-[13%]">Day</th>
                          <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line px-3 py-2 w-[20%]">Original Roster</th>
                          <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line px-3 py-2 w-[32%]">Action / Shift Title</th>
                          <th className="text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line px-3 py-2 w-[15%]">OT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => (
                          <tr key={r.date || `row-${i}`} className="hover:bg-well">
                            <td className="px-3 py-2 text-sm border-b border-line font-mono text-fg break-words">
                              {r.date}
                            </td>
                            <td className="px-3 py-2 text-sm border-b border-line text-muted">{r.day}</td>
                            <td className="px-3 py-2 text-sm border-b border-line break-words">
                              <span className="flex items-center gap-2 font-semibold text-accent">
                                <span>{r.originalStatus}</span>
                                {r.isAutoFilled && (
                                  <span className="chip chip-accent">Auto-Filled</span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm border-b border-line text-fg break-words">{r.action}</td>
                            <td className="px-3 py-2 text-sm border-b border-line">
                              {r.ot ? (
                                <span className="chip chip-warning">OT</span>
                              ) : (
                                'NO'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div
                    className="p-3.5 rounded-lg flex items-center justify-between gap-3 flex-wrap"
                    style={{ background: 'var(--accent-soft)', color: 'var(--color-primary)' }}
                  >
                    <span className="font-medium flex items-center gap-2 text-xs">
                      <ShieldCheck className="w-4 h-4" />
                      Original roster values will be saved without overwriting your manual changes.
                    </span>

                    <button
                      onClick={handleConfirmImport}
                      disabled={isSubmitting}
                      className="btn-min btn-primary"
                    >
                      {isSubmitting ? 'Importing...' : 'Confirm & Import Original Roster'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: RESULT REPORT */}
              {step === 'result' && importResult && (
                <div className="space-y-4">
                  <div
                    className="p-6 rounded-lg text-center space-y-3"
                    style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                  >
                    <CheckCircle2 className="w-10 h-10 mx-auto" />
                    <h4 className="text-base font-semibold">
                      Original Roster Successfully Imported!
                    </h4>
                    <p className="text-xs">
                      {importResult.successCount} roster entries were processed from{' '}
                      <strong>{file?.name}</strong>.
                    </p>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="stat-tile">
                      <div className="stat-tile-value">{importResult.createdCount}</div>
                      <div className="stat-tile-label">New Entries</div>
                    </div>

                    <div className="stat-tile">
                      <div className="stat-tile-value" style={{ color: 'var(--color-primary)' }}>
                        {importResult.updatedCount}
                      </div>
                      <div className="stat-tile-label">Updated Entries</div>
                    </div>

                    <div className="stat-tile">
                      <div className="stat-tile-value text-muted">0</div>
                      <div className="stat-tile-label">Errors</div>
                    </div>
                  </div>

                  {/* Google Calendar Action Banner */}
                  <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h5 className="text-xs font-semibold text-fg">
                        Google Calendar Synchronization
                      </h5>
                      <p className="text-[11px] text-muted">
                        Synchronize your new roster schedule directly to Google Calendar
                      </p>
                    </div>

                    <button
                      onClick={handleSyncCalendarPostImport}
                      disabled={calendarSynced}
                      className="btn-min btn-primary text-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${calendarSynced ? '' : 'animate-spin'}`} />
                      {calendarSynced ? 'Synced to Google Calendar ✓' : 'Sync to Google Calendar'}
                    </button>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button onClick={onClose} className="btn-min btn-primary">
                      Done & View Roster
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: IMPORT HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-fg text-sm">
                    Past Original Roster Imports
                  </h4>
                  <p className="text-xs text-muted">
                    Audit log of all imported official office spreadsheets
                  </p>
                </div>
              </div>

              {loadingHistory ? (
                <div className="py-12 text-center text-muted">Loading import history...</div>
              ) : importHistoryList.length === 0 ? (
                <div className="py-12 text-center text-muted border border-dashed border-line rounded-lg">
                  No past imports found.
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {importHistoryList.map((item) => (
                    <div
                      key={item.id}
                      className="card p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-accent shrink-0">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-semibold text-fg text-xs truncate">
                            {item.filename}
                          </h5>
                          <div className="flex items-center gap-3 text-[11px] text-muted mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-faint" />
                              {new Date(item.uploadTimestamp).toLocaleString()}
                            </span>
                            <span>•</span>
                            <span>Employee: {item.employeeName || item.user}</span>
                            <span>•</span>
                            <span>Range: {item.dateRange}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="chip chip-success">
                          ✓ {item.rowCount} Records
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
