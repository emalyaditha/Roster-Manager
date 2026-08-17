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
      } else if (upperRoster.startsWith('DOS(') || upperRoster.startsWith('DOS')) {
        // e.g. DOS(10.00) or DOS
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full md:max-h-[85vh] max-h-[90vh] flex flex-col overflow-hidden transition-all my-8">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-600 text-white shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-purple-950 dark:text-purple-100 flex items-center gap-2">
                Import Original Office Roster
              </h3>
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Official Excel spreadsheet import with automatic detection & protection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download Template Button */}
            <button
              onClick={handleDownloadTemplate}
              title="Download Excel Roster Template"
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Excel Template</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Tab Toggle: Import Wizard vs Import History */}
        <div className="px-6 pt-3 bg-slate-50/60 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 font-bold rounded-t-xl transition-all border-b-2 ${
                activeTab === 'import'
                  ? 'border-purple-600 text-purple-700 dark:text-purple-300 bg-white dark:bg-slate-900 shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Import Roster Wizard
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-purple-600 text-purple-700 dark:text-purple-300 bg-white dark:bg-slate-900 shadow-2xs'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Import History
            </button>
          </div>

          {/* Stepper Progress Bar */}
          {activeTab === 'import' && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
              <span className={step === 'upload' ? 'text-purple-600' : ''}>1. Upload</span>
              <span>→</span>
              <span className={step === 'column_map' ? 'text-purple-600' : ''}>2. Map Columns</span>
              <span>→</span>
              <span className={step === 'preview' ? 'text-purple-600' : ''}>3. Preview</span>
              <span>→</span>
              <span className={step === 'result' ? 'text-purple-600' : ''}>4. Complete</span>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {/* TAB 1: IMPORT WIZARD */}
          {activeTab === 'import' && (
            <>
              {/* STEP: UPLOAD */}
              {step === 'upload' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-purple-300 dark:border-purple-800/80 rounded-3xl p-10 text-center bg-purple-50/20 dark:bg-purple-950/10 hover:bg-purple-50/50 transition-all cursor-pointer relative shadow-2xs group">
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
                    <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-xs">
                      <Upload className="w-7 h-7" />
                    </div>
                    <h4 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
                      Drag & Drop Official Office Excel Roster Here
                    </h4>
                    <p className="text-slate-500 mb-4 font-medium">
                      or click to browse your computer (.xlsx, .xls, .csv)
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      <span>Supports: XLSX • XLS • CSV</span>
                    </div>
                  </div>

                  {/* Highlights Callout */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                      Smart Office Import Guarantees
                    </span>
                    <ul className="grid sm:grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 text-[11px] list-disc list-inside">
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
                  <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                    <h4 className="font-bold text-purple-950 dark:text-purple-100 text-sm mb-1">
                      Multiple Roster Sheets Detected
                    </h4>
                    <p className="text-purple-700 dark:text-purple-300">
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
                        className={`p-4 rounded-2xl border text-left transition-all font-bold flex items-center justify-between ${
                          selectedSheet === s
                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-950 dark:text-purple-100 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-purple-600" />
                          {s}
                        </span>
                        {selectedSheet === s && <Check className="w-4 h-4 text-purple-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP: EMPLOYEE SELECTION */}
              {step === 'employee_select' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                    <h4 className="font-bold text-purple-950 dark:text-purple-100 text-sm mb-1">
                      Select Employee Roster
                    </h4>
                    <p className="text-purple-700 dark:text-purple-300">
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
                        className={`p-3 rounded-2xl border text-left font-bold flex items-center gap-2.5 transition-all ${
                          selectedEmployee === emp
                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-900 dark:text-purple-100'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                      >
                        <User className="w-4 h-4 text-purple-600" />
                        <span>{emp}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP: COLUMN MAPPING */}
              {step === 'column_map' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-purple-950 dark:text-purple-100 text-sm">
                        Confirm Excel Column Mapping
                      </h4>
                      <p className="text-purple-700 dark:text-purple-300">
                        File: <strong>{file?.name}</strong> | Sheet: <strong>{selectedSheet}</strong>
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200 font-extrabold text-[10px]">
                      Auto-Detected
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Date Column <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={columnMap.dateCol}
                        onChange={(e) => setColumnMap({ ...columnMap, dateCol: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                      >
                        {sheetHeaders.map((h, i) => (
                          <option key={`dateCol-${h}-${i}`} value={h}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Day Column (Optional)
                      </label>
                      <select
                        value={columnMap.dayCol}
                        onChange={(e) => setColumnMap({ ...columnMap, dayCol: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
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
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Original Roster Status Column <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={columnMap.rosterCol}
                        onChange={(e) => setColumnMap({ ...columnMap, rosterCol: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-purple-600 dark:text-purple-400"
                      >
                        {sheetHeaders.map((h, i) => (
                          <option key={`rosterCol-${h}-${i}`} value={h}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Action / Shift Title Column
                      </label>
                      <select
                        value={columnMap.actionCol}
                        onChange={(e) => setColumnMap({ ...columnMap, actionCol: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
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
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
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
                    <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between">
                      <span className="font-bold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        This roster file was previously imported on{' '}
                        {new Date(duplicateNotice.previousImport?.uploadTimestamp || '').toLocaleDateString()}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-200 dark:bg-amber-900 font-extrabold text-[10px]">
                        Duplicate File Detected
                      </span>
                    </div>
                  )}

                  {/* Missing Dates Auto-Filled Notice */}
                  {autoFilledMissingDates.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/80 border border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold flex items-center gap-2 text-xs">
                          <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                          {autoFilledMissingDates.length} Missing Date(s) Auto-Detected & Included as Normal Holiday (HOL)
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-sky-200 dark:bg-sky-900 font-extrabold text-[10px] text-sky-900 dark:text-sky-100">
                          Date Continuity Verified
                        </span>
                      </div>
                      <p className="text-[11px] text-sky-700 dark:text-sky-300">
                        The uploaded Excel file skipped the following date(s): <strong>{autoFilledMissingDates.join(', ')}</strong>.
                        To ensure your roster is 100% complete without missing days, they have been automatically inserted as <strong>Normal Holiday (HOL)</strong> before saving.
                      </p>
                    </div>
                  )}

                  {/* Summary Bar */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
                        Original Roster Import Preview
                      </h4>
                      <p className="text-slate-500 text-xs">
                        File: {file?.name} | Employee: {selectedEmployee}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">
                        {previewRows.length} Valid Rows
                      </div>
                      <div className="px-3 py-1 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-bold">
                        Protected User Changes
                      </div>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                    <table className="w-full table-fixed text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="p-2.5 w-[20%]">Date</th>
                          <th className="p-2.5 w-[13%]">Day</th>
                          <th className="p-2.5 w-[20%]">Original Roster</th>
                          <th className="p-2.5 w-[32%]">Action / Shift Title</th>
                          <th className="p-2.5 w-[15%]">OT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                        {previewRows.map((r, i) => (
                          <tr key={r.date || `row-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-2.5 font-bold font-mono text-slate-900 dark:text-white break-words">
                              {r.date}
                            </td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-400">{r.day}</td>
                            <td className="p-2.5 font-extrabold text-purple-700 dark:text-purple-300 flex items-center gap-2 break-words">
                              <span>{r.originalStatus}</span>
                              {r.isAutoFilled && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 text-[9px] font-bold">
                                  Auto-Filled
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-700 dark:text-slate-300 break-words">{r.action}</td>
                            <td className="p-2.5">
                              {r.ot ? (
                                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 font-bold text-[10px]">
                                  OT
                                </span>
                              ) : (
                                'NO'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-2 text-xs">
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                      Original roster values will be saved without overwriting your manual changes.
                    </span>

                    <button
                      onClick={handleConfirmImport}
                      disabled={isSubmitting}
                      className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-sm flex items-center gap-1.5"
                    >
                      {isSubmitting ? 'Importing...' : 'Confirm & Import Original Roster'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP: RESULT REPORT */}
              {step === 'result' && importResult && (
                <div className="space-y-6">
                  <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h4 className="text-lg font-extrabold text-emerald-950 dark:text-emerald-100">
                      Original Roster Successfully Imported!
                    </h4>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300">
                      {importResult.successCount} roster entries were processed from{' '}
                      <strong>{file?.name}</strong>.
                    </p>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-2xl font-black text-slate-900 dark:text-white block">
                        {importResult.createdCount}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 uppercase">New Entries</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                      <span className="text-2xl font-black text-purple-700 dark:text-purple-300 block">
                        {importResult.updatedCount}
                      </span>
                      <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase">
                        Updated Entries
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-2xl font-black text-slate-600 dark:text-slate-400 block">
                        0
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 uppercase">Errors</span>
                    </div>
                  </div>

                  {/* Google Calendar Action Banner */}
                  <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-indigo-950 dark:text-indigo-100 text-xs">
                        Google Calendar Synchronization
                      </h5>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                        Synchronize your new roster schedule directly to Google Calendar
                      </p>
                    </div>

                    <button
                      onClick={handleSyncCalendarPostImport}
                      disabled={calendarSynced}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${calendarSynced ? '' : 'animate-spin'}`} />
                      {calendarSynced ? 'Synced to Google Calendar ✓' : 'Sync to Google Calendar'}
                    </button>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={onClose}
                      className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-sm"
                    >
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
                  <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    Past Original Roster Imports
                  </h4>
                  <p className="text-slate-500 text-xs">
                    Audit log of all imported official office spreadsheets
                  </p>
                </div>
              </div>

              {loadingHistory ? (
                <div className="py-12 text-center text-slate-400">Loading import history...</div>
              ) : importHistoryList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 border border-dashed rounded-2xl">
                  No past imports found.
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {importHistoryList.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="font-extrabold text-slate-900 dark:text-white text-xs">
                            {item.filename}
                          </h5>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {new Date(item.uploadTimestamp).toLocaleString()}
                            </span>
                            <span>•</span>
                            <span>Employee: {item.employeeName || item.user}</span>
                            <span>•</span>
                            <span>Range: {item.dateRange}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-[10px]">
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
  </div>
);
};
