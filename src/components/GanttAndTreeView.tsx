import React, { useMemo, useState } from 'react';
import {
  GanttChart,
  GitFork,
  Filter,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Calendar,
  UserCheck,
  Target,
  FolderKanban,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  PlayCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { Dossier, GanttTimeScale, CurrencyCode, LanguageCode, Task } from '../types';
import {
  STANDARD_PHASES,
  computeTaskMetrics,
  getTodayISO,
  addDaysISO
} from '../pertUtils';
import { formatCurrency } from '../i18n';

interface GanttAndTreeViewProps {
  dossier: Dossier;
  currency: CurrencyCode;
  language: LanguageCode;
  filterAxeId: string;
  setFilterAxeId: (id: string) => void;
  filterProjectId: string;
  setFilterProjectId: (id: string) => void;
  onUpdateTask?: (projectId: string, taskId: string, patch: Partial<Task>) => void;
}

interface TimeBucket {
  key: string;
  label: string;
  subLabel?: string;
  start: Date;
  end: Date;
}

export const GanttAndTreeView: React.FC<GanttAndTreeViewProps> = ({
  dossier,
  currency,
  language,
  filterAxeId,
  setFilterAxeId,
  filterProjectId,
  setFilterProjectId,
  onUpdateTask
}) => {
  const [viewMode, setViewMode] = useState<'gantt' | 'tree' | 'calendar'>('gantt');
  const [timeScale, setTimeScale] = useState<GanttTimeScale>('month');
  const [filterPhase, setFilterPhase] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [zoom, setZoom] = useState<number>(1);
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});

  const todayISO = getTodayISO();
  const initialDateObj = new Date(todayISO);
  const [calendarYear, setCalendarYear] = useState<number>(
    isNaN(initialDateObj.getTime()) ? new Date().getFullYear() : initialDateObj.getFullYear()
  );
  const [calendarMonth, setCalendarMonth] = useState<number>(
    isNaN(initialDateObj.getTime()) ? new Date().getMonth() : initialDateObj.getMonth()
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(todayISO);
  const [taskToAutoScheduleId, setTaskToAutoScheduleId] = useState<string>('');
  const axes = dossier.axes || [];

  const filteredAxes = useMemo(() => {
    if (filterAxeId === 'ALL') return axes;
    return axes.filter(a => a.id === filterAxeId);
  }, [axes, filterAxeId]);

  const availableProjects = useMemo(() => {
    return filteredAxes.flatMap(a => a.projects || []);
  }, [filteredAxes]);

  // All unique assignees for the Responsable filter
  const allAssignees = useMemo(() => {
    const set = new Set<string>();
    axes.forEach(ax => {
      (ax.projects || []).forEach(pr => {
        (pr.tasks || []).forEach(tk => {
          if (tk.assignee && tk.assignee.trim()) {
            set.add(tk.assignee.trim());
          }
        });
      });
    });
    return Array.from(set).sort();
  }, [axes]);

  const togglePhaseCollapse = (key: string) => {
    setCollapsedPhases(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Collect all filtered tasks for date range calculation
  const allFilteredTasks = useMemo(() => {
    const list: Array<{
      startDate: string;
      endDate: string;
      actualStartDate: string;
      actualEndDate: string;
    }> = [];

    filteredAxes.forEach(ax => {
      (ax.projects || [])
        .filter(pr => filterProjectId === 'ALL' || pr.id === filterProjectId)
        .forEach(pr => {
          (pr.tasks || []).forEach(tk => {
            if (filterPhase !== 'ALL' && tk.phase !== filterPhase) return;
            if (
              filterAssignee !== 'ALL' &&
              (tk.assignee || '').trim() !== filterAssignee
            ) {
              return;
            }
            list.push({
              startDate: tk.startDate,
              endDate: tk.endDate,
              actualStartDate: tk.actualStartDate || '',
              actualEndDate: tk.actualEndDate || ''
            });
          });
        });
    });
    return list;
  }, [filteredAxes, filterProjectId, filterPhase, filterAssignee]);

  // Enriched filtered tasks with codes, project/axe info, and automated metrics for the Calendar view
  const enrichedCalendarTasks = useMemo(() => {
    const items: Array<{
      axeId: string;
      axeName: string;
      projectId: string;
      projectName: string;
      code: string;
      task: Task;
      metrics: ReturnType<typeof computeTaskMetrics>;
    }> = [];

    filteredAxes.forEach(ax => {
      (ax.projects || [])
        .filter(pr => filterProjectId === 'ALL' || pr.id === filterProjectId)
        .forEach(pr => {
          const rawTasks = pr.tasks || [];
          const codeMap = new Map<string, string>();
          STANDARD_PHASES.forEach((pName, pIdx) => {
            rawTasks
              .filter(tk => tk.phase === pName)
              .forEach((tk, tIdx) => {
                codeMap.set(
                  tk.id,
                  `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`
                );
              });
          });

          rawTasks.forEach((tk, idx) => {
            if (filterPhase !== 'ALL' && tk.phase !== filterPhase) return;
            if (
              filterAssignee !== 'ALL' &&
              (tk.assignee || '').trim() !== filterAssignee
            ) {
              return;
            }
            const code =
              codeMap.get(tk.id) ||
              `${tk.type === 'jalon' ? 'J' : 'T'}.1.${idx + 1}`;
            items.push({
              axeId: ax.id,
              axeName: ax.name,
              projectId: pr.id,
              projectName: pr.name,
              code,
              task: tk,
              metrics: computeTaskMetrics(tk, todayISO)
            });
          });
        });
    });

    return items;
  }, [filteredAxes, filterProjectId, filterPhase, filterAssignee, todayISO]);

  // Distinct active months across tasks for quick jump in Calendar view
  const projectActiveMonths = useMemo(() => {
    const map = new Map<string, { year: number; month: number; label: string }>();
    const monthNamesShort =
      language === 'EN'
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        : ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    enrichedCalendarTasks.forEach(({ task }) => {
      [task.startDate, task.endDate].forEach(dStr => {
        if (!dStr) return;
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const m = d.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (!map.has(key)) {
          map.set(key, {
            year: y,
            month: m,
            label: `${monthNamesShort[m]} ${y}`
          });
        }
      });
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(entry => entry[1]);
  }, [enrichedCalendarTasks, language]);

  // Dynamic time buckets based on timeScale (day | week | month | quarter | semester | year)
  const timeBuckets = useMemo<TimeBucket[]>(() => {
    const now = new Date();
    let minDate = new Date(now.getFullYear(), 0, 1);
    let maxDate = new Date(now.getFullYear(), 11, 31);

    const validDates: Date[] = [];
    allFilteredTasks.forEach(r => {
      [r.startDate, r.endDate, r.actualStartDate, r.actualEndDate].forEach(dStr => {
        if (dStr) {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) validDates.push(d);
        }
      });
    });

    if (validDates.length > 0) {
      minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
      maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
    }

    const buckets: TimeBucket[] = [];

    if (timeScale === 'day') {
      const start = new Date(
        minDate.getFullYear(),
        minDate.getMonth(),
        minDate.getDate() - 2
      );
      const end = new Date(
        maxDate.getFullYear(),
        maxDate.getMonth(),
        maxDate.getDate() + 5
      );
      const cur = new Date(start);
      let count = 0;
      while (cur <= end && count < 120) {
        const bStart = new Date(
          cur.getFullYear(),
          cur.getMonth(),
          cur.getDate(),
          0,
          0,
          0
        );
        const bEnd = new Date(
          cur.getFullYear(),
          cur.getMonth(),
          cur.getDate(),
          23,
          59,
          59
        );
        buckets.push({
          key: bStart.toISOString().slice(0, 10),
          label: `${String(bStart.getDate()).padStart(2, '0')}/${String(
            bStart.getMonth() + 1
          ).padStart(2, '0')}`,
          subLabel: bStart
            .toLocaleDateString('fr-FR', { weekday: 'short' })
            .slice(0, 2),
          start: bStart,
          end: bEnd
        });
        cur.setDate(cur.getDate() + 1);
        count++;
      }
    } else if (timeScale === 'week') {
      const start = new Date(
        minDate.getFullYear(),
        minDate.getMonth(),
        minDate.getDate() - 7
      );
      const end = new Date(
        maxDate.getFullYear(),
        maxDate.getMonth(),
        maxDate.getDate() + 14
      );
      const cur = new Date(start);
      let weekIdx = 1;
      while (cur <= end && weekIdx <= 60) {
        const bStart = new Date(
          cur.getFullYear(),
          cur.getMonth(),
          cur.getDate(),
          0,
          0,
          0
        );
        const bEnd = new Date(
          cur.getFullYear(),
          cur.getMonth(),
          cur.getDate() + 6,
          23,
          59,
          59
        );
        buckets.push({
          key: `W-${bStart.toISOString().slice(0, 10)}`,
          label: `S${weekIdx}`,
          subLabel: `${String(bStart.getDate()).padStart(2, '0')}/${String(
            bStart.getMonth() + 1
          ).padStart(2, '0')}`,
          start: bStart,
          end: bEnd
        });
        cur.setDate(cur.getDate() + 7);
        weekIdx++;
      }
    } else if (timeScale === 'month') {
      const startYear = minDate.getFullYear();
      const endYear = Math.max(startYear, maxDate.getFullYear());
      const monthNames =
        language === 'EN'
          ? [
              'Jan',
              'Feb',
              'Mar',
              'Apr',
              'May',
              'Jun',
              'Jul',
              'Aug',
              'Sep',
              'Oct',
              'Nov',
              'Dec'
            ]
          : [
              'Jan',
              'Fév',
              'Mar',
              'Avr',
              'Mai',
              'Juin',
              'Juil',
              'Août',
              'Sep',
              'Oct',
              'Nov',
              'Déc'
            ];
      for (let y = startYear; y <= endYear; y++) {
        for (let m = 0; m < 12; m++) {
          buckets.push({
            key: `${y}-${m + 1}`,
            label: monthNames[m],
            subLabel: String(y).slice(-2),
            start: new Date(y, m, 1, 0, 0, 0),
            end: new Date(y, m + 1, 0, 23, 59, 59)
          });
        }
      }
    } else if (timeScale === 'quarter') {
      const startYear = minDate.getFullYear();
      const endYear = Math.max(startYear, maxDate.getFullYear());
      for (let y = startYear; y <= endYear; y++) {
        for (let q = 0; q < 4; q++) {
          buckets.push({
            key: `${y}-T${q + 1}`,
            label: `T${q + 1}`,
            subLabel: String(y),
            start: new Date(y, q * 3, 1, 0, 0, 0),
            end: new Date(y, q * 3 + 3, 0, 23, 59, 59)
          });
        }
      }
    } else if (timeScale === 'semester') {
      const startYear = minDate.getFullYear();
      const endYear = Math.max(startYear, maxDate.getFullYear());
      for (let y = startYear; y <= endYear; y++) {
        for (let s = 0; s < 2; s++) {
          buckets.push({
            key: `${y}-S${s + 1}`,
            label: `Sem. ${s + 1}`,
            subLabel: String(y),
            start: new Date(y, s * 6, 1, 0, 0, 0),
            end: new Date(y, s * 6 + 6, 0, 23, 59, 59)
          });
        }
      }
    } else if (timeScale === 'year') {
      const startYear = Math.min(minDate.getFullYear(), now.getFullYear() - 1);
      const endYear = Math.max(maxDate.getFullYear(), now.getFullYear() + 2);
      for (let y = startYear; y <= endYear; y++) {
        buckets.push({
          key: `${y}`,
          label: `${y}`,
          subLabel: language === 'EN' ? 'Annual' : 'Annuel',
          start: new Date(y, 0, 1, 0, 0, 0),
          end: new Date(y, 11, 31, 23, 59, 59)
        });
      }
    }

    return buckets;
  }, [allFilteredTasks, timeScale, language]);

  const overlapsBucket = (startStr: string, endStr: string, bucket: TimeBucket) => {
    if (!startStr && !endStr) return false;
    const s = new Date(startStr || endStr);
    const e = new Date(endStr || startStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
    return s <= bucket.end && e >= bucket.start;
  };

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Ultra-Compact Top Toolbar: View Switcher + 4 Filters + Time Scales */}
      <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-xl border border-slate-200 dark:border-slate-800 p-1 md:p-2.5 shadow-xs space-y-1 md:space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="min-w-0">
            <h2 className="text-[10px] sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-1 truncate">
              <GanttChart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#ea580c] dark:text-[#fdba74] shrink-0" />
              <span>
                {language === 'EN'
                  ? 'Gantt Chart, WBS Tree & Calendar'
                  : 'Diagramme de Gantt, Arbre WBS & Calendrier'}
              </span>
            </h2>
          </div>

          {/* Switcher: Gantt | Arbre WBS | Calendrier */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md">
            <button
              onClick={() => setViewMode('gantt')}
              className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded text-[9px] sm:text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'gantt'
                  ? 'bg-[#c2410c] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <GanttChart className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>Gantt</span>
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded text-[9px] sm:text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'tree'
                  ? 'bg-[#c2410c] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <GitFork className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>{language === 'EN' ? 'WBS Tree' : 'Arbre WBS'}</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded text-[9px] sm:text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-[#c2410c] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              <span>{language === 'EN' ? 'Calendar' : 'Calendrier'}</span>
            </button>
          </div>
        </div>

        {/* 4 Filter Dropdowns: Axe, Projet, Phase, Responsable (2x size on mobile) */}
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/70 px-1.5 py-1 md:px-2 md:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 md:h-auto">
            <Filter className="hidden md:block w-3 h-3 text-[#ea580c] shrink-0" />
            <div className="flex-1 min-w-0">
              <label className="hidden md:block text-[8px] font-bold uppercase text-slate-400 leading-none">
                {language === 'EN' ? '1. Axis' : '1. Axe'}
              </label>
              <select
                value={filterAxeId}
                onChange={e => {
                  setFilterAxeId(e.target.value);
                  setFilterProjectId('ALL');
                }}
                className="w-full bg-transparent text-[13px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
              >
                <option value="ALL">
                  {language === 'EN' ? `Axis (${axes.length})` : `Axe (${axes.length})`}
                </option>
                {axes.map(ax => (
                  <option key={ax.id} value={ax.id}>
                    {ax.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/70 px-1.5 py-1 md:px-2 md:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 md:h-auto">
            <FolderKanban className="hidden md:block w-3 h-3 text-[#ea580c] shrink-0" />
            <div className="flex-1 min-w-0">
              <label className="hidden md:block text-[8px] font-bold uppercase text-slate-400 leading-none">
                {language === 'EN' ? '2. Project' : '2. Projet'}
              </label>
              <select
                value={filterProjectId}
                onChange={e => setFilterProjectId(e.target.value)}
                className="w-full bg-transparent text-[13px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
              >
                <option value="ALL">
                  {language === 'EN'
                    ? `Project (${availableProjects.length})`
                    : `Projet (${availableProjects.length})`}
                </option>
                {availableProjects.map(pr => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/70 px-1.5 py-1 md:px-2 md:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 md:h-auto">
            <Layers className="hidden md:block w-3 h-3 text-[#ea580c] shrink-0" />
            <div className="flex-1 min-w-0">
              <label className="hidden md:block text-[8px] font-bold uppercase text-slate-400 leading-none">
                3. Phase
              </label>
              <select
                value={filterPhase}
                onChange={e => setFilterPhase(e.target.value)}
                className="w-full bg-transparent text-[13px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
              >
                <option value="ALL">Phases (5)</option>
                {STANDARD_PHASES.map((ph, idx) => (
                  <option key={ph} value={ph}>
                    P{idx + 1}: {ph}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/70 px-1.5 py-1 md:px-2 md:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 md:h-auto">
            <UserCheck className="hidden md:block w-3 h-3 text-[#ea580c] shrink-0" />
            <div className="flex-1 min-w-0">
              <label className="hidden md:block text-[8px] font-bold uppercase text-slate-400 leading-none">
                {language === 'EN' ? '4. Owner' : '4. Responsable'}
              </label>
              <select
                value={filterAssignee}
                onChange={e => setFilterAssignee(e.target.value)}
                className="w-full bg-transparent text-[13px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
              >
                <option value="ALL">
                  {language === 'EN'
                    ? `Owner (${allAssignees.length})`
                    : `Resp. (${allAssignees.length})`}
                </option>
                {allAssignees.map(resp => (
                  <option key={resp} value={resp}>
                    {resp}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ultra-Compact Time Scale Buttons & Zoom */}
        <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5 border-t border-slate-100 dark:border-slate-800">
          {viewMode === 'gantt' ? (
            <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
              <span className="hidden sm:inline-flex text-[9px] font-extrabold uppercase text-slate-500 dark:text-slate-400 mr-0.5 items-center gap-1">
                <Calendar className="w-2.5 h-2.5 text-[#ea580c]" />{' '}
                {language === 'EN' ? 'Scale :' : 'Échelle :'}
              </span>
              {(
                [
                  { id: 'day', label: language === 'EN' ? 'Days' : 'Jours' },
                  { id: 'week', label: language === 'EN' ? 'Weeks' : 'Sem.' },
                  { id: 'month', label: language === 'EN' ? 'Months' : 'Mois' },
                  { id: 'quarter', label: language === 'EN' ? 'Quart.' : 'Trim.' },
                  { id: 'semester', label: language === 'EN' ? 'Semester' : 'Semestre' },
                  { id: 'year', label: language === 'EN' ? 'Year' : 'Année' }
                ] as Array<{ id: GanttTimeScale; label: string }>
              ).map(scale => (
                <button
                  key={scale.id}
                  onClick={() => setTimeScale(scale.id)}
                  className={`px-1 py-0.5 sm:px-2 sm:py-0.5 rounded text-[8px] sm:text-[10px] font-bold transition-all cursor-pointer ${
                    timeScale === scale.id
                      ? 'bg-[#fdba74] text-slate-950 shadow-xs font-black'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {scale.label}
                </button>
              ))}
            </div>
          ) : viewMode === 'tree' ? (
            <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">
              {language === 'EN'
                ? 'WBS Hierarchy : Axes → Projects → Phases → Activities & Milestones'
                : 'Arborescence WBS : Axes → Projets → Phases → Activités & Jalons'}
            </div>
          ) : (
            <div className="text-[10px] font-bold text-[#ea580c] dark:text-[#fdba74] flex items-center gap-1 truncate">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>
                {language === 'EN'
                  ? 'Interactive Calendar with Automated Task Status & Rescheduling'
                  : 'Présentation Calendrier avec Automatisation des Tâches & Statuts'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            <button
              onClick={() => setZoom(z => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
              className="p-0.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Zoom -"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-800 dark:text-slate-200 min-w-[34px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
              className="p-0.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Zoom +"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              title={language === 'EN' ? 'Reset' : 'Réinitialiser'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: DIAGRAMME DE GANTT AVEC AXES, PROJETS ET PHASES DE PROJET */}
      {viewMode === 'gantt' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="w-3 h-2 rounded-xs bg-[#c2410c] inline-block" />
                {language === 'EN'
                  ? 'Phase Summary Bar'
                  : 'Barre Récapitulative de Phase'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="w-3 h-2 rounded-xs bg-[#fdba74] border border-[#ea580c] inline-block" />
                {language === 'EN'
                  ? 'Planned Period (Baseline)'
                  : 'Période Prévue (Planification)'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="w-3 h-2 rounded-xs bg-emerald-500 inline-block" />
                {language === 'EN'
                  ? 'Actual Execution (On Time / Completed)'
                  : 'Exécution Réelle (À temps / Terminé)'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="w-3 h-2 rounded-xs bg-amber-500 inline-block" />
                {language === 'EN'
                  ? 'Delayed Execution'
                  : 'Exécution avec Retard'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="w-2.5 h-2.5 rotate-45 bg-[#c2410c] dark:bg-[#fdba74] inline-block" />
                {language === 'EN' ? 'Milestone (J)' : 'Jalon (J)'}
              </span>
            </div>
            <span className="text-slate-500 dark:text-slate-400">
              {allFilteredTasks.length}{' '}
              {language === 'EN'
                ? 'item(s) • First 2 columns locked and compact'
                : 'élément(s) • 2 premières colonnes bloquées et réduites de moitié'}
            </span>
          </div>

          <div className="overflow-x-auto max-h-[72vh]">
            <div style={{ zoom }}>
              <table className="w-full border-collapse table-compact">
                <thead>
                  <tr className="bg-[#c2410c] text-white">
                    {/* Locked Col 1: Code (Half-width: 44px) */}
                    <th className="sticky left-0 z-30 bg-[#c2410c] w-11 min-w-[44px] max-w-[48px] text-left border-r border-orange-800 px-1.5 py-2 text-[9px] font-black uppercase">
                      Code
                    </th>
                    {/* Locked Col 2: Activité / Jalon (Half-width: 112px, full wrap) */}
                    <th className="sticky left-[44px] z-30 bg-[#c2410c] w-28 min-w-[112px] max-w-[124px] text-left border-r-2 border-[#fdba74] px-1.5 py-2 text-[9px] font-black uppercase shadow-md">
                      {language === 'EN' ? 'Activity / Milestone' : 'Activité / Jalon'}
                    </th>
                    {/* Col 3: Responsable */}
                    <th className="w-20 min-w-[76px] text-left border-r border-orange-800 px-1.5 py-2 text-[9px] font-black uppercase">
                      {language === 'EN' ? 'Owner' : 'Resp.'}
                    </th>
                    {/* Col 4: Durée */}
                    <th className="w-10 min-w-[40px] text-center border-r border-orange-800 px-1 py-2 text-[9px] font-black uppercase">
                      {language === 'EN' ? 'Dur.' : 'Durée'}
                    </th>
                    {/* Time Buckets */}
                    {timeBuckets.map(b => (
                      <th
                        key={b.key}
                        className="min-w-[34px] text-center border-r border-orange-800/70 px-1 py-1.5 text-[9px] font-extrabold"
                      >
                        <div className="leading-tight text-white">{b.label}</div>
                        {b.subLabel && (
                          <div className="text-[8px] font-normal text-[#fdba74] leading-none mt-0.5">
                            {b.subLabel}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredAxes.map((axe, axeIdx) => {
                    const axeProjects = (axe.projects || []).filter(
                      pr => filterProjectId === 'ALL' || pr.id === filterProjectId
                    );
                    const totalCols = 4 + timeBuckets.length;

                    return (
                      <React.Fragment key={axe.id}>
                        {/* AXE STRATÉGIQUE ROW */}
                        <tr className="bg-[#9a3412] text-white">
                          <td
                            colSpan={2}
                            className="sticky left-0 z-20 bg-[#9a3412] border-r-2 border-[#fdba74] px-2 py-1.5 font-black text-[10px] uppercase tracking-wider whitespace-normal break-words"
                          >
                            <span className="px-1.5 py-0.5 rounded bg-[#fdba74] text-slate-950 font-mono text-[9px] mr-1.5">
                              {language === 'EN' ? 'AXIS' : 'AXE'} {axeIdx + 1}
                            </span>
                            {axe.name}
                          </td>
                          <td
                            colSpan={totalCols - 2}
                            className="px-2 py-1.5 text-[10px] font-bold text-[#fdba74]"
                          >
                            {axeProjects.length}{' '}
                            {language === 'EN'
                              ? 'Operational Project(s)'
                              : 'Projet(s) Opérationnel(s)'}
                          </td>
                        </tr>

                        {axeProjects.map((proj, projIdx) => {
                          const rawTasks = proj.tasks || [];
                          const phasesToDisplay =
                            filterPhase === 'ALL'
                              ? STANDARD_PHASES
                              : STANDARD_PHASES.filter(ph => ph === filterPhase);

                          return (
                            <React.Fragment key={proj.id}>
                              {/* PROJECT HEADER ROW */}
                              <tr className="bg-[#c2410c]/90 text-white">
                                <td
                                  colSpan={2}
                                  className="sticky left-0 z-20 bg-[#c2410c] border-r-2 border-[#fdba74] px-2 py-1.5 font-extrabold text-[10px] whitespace-normal break-words"
                                >
                                  <span className="px-1.5 py-0.5 rounded bg-orange-200 text-slate-950 font-mono text-[8px] font-black mr-1">
                                    PRJ {axeIdx + 1}.{projIdx + 1}
                                  </span>
                                  {proj.name}
                                </td>
                                <td
                                  colSpan={totalCols - 2}
                                  className="px-2 py-1.5 text-[10px] font-semibold text-orange-100"
                                >
                                  {language === 'EN' ? 'Project:' : 'Projet :'}{' '}
                                  {proj.name} ({rawTasks.length}{' '}
                                  {language === 'EN'
                                    ? 'task(s)/milestone(s)'
                                    : 'tâche(s)/jalon(s)'}
                                  )
                                </td>
                              </tr>

                              {/* PHASES INSIDE PROJECT */}
                              {phasesToDisplay.map(phaseName => {
                                const pIdx = STANDARD_PHASES.indexOf(phaseName);
                                const collapseKey = `${proj.id}__${phaseName}`;
                                const isCollapsed = Boolean(
                                  collapsedPhases[collapseKey]
                                );

                                const phaseTasksAll = rawTasks.filter(
                                  tk => tk.phase === phaseName
                                );
                                const phaseTasks = phaseTasksAll.filter(
                                  tk =>
                                    filterAssignee === 'ALL' ||
                                    (tk.assignee || '').trim() === filterAssignee
                                );

                                // Phase start & end dates for phase summary bar
                                const phaseStarts = phaseTasks
                                  .map(tk => tk.startDate)
                                  .filter(Boolean)
                                  .sort();
                                const phaseEnds = phaseTasks
                                  .map(tk => tk.endDate)
                                  .filter(Boolean)
                                  .sort();
                                const phaseMinStart = phaseStarts[0] || '';
                                const phaseMaxEnd =
                                  phaseEnds[phaseEnds.length - 1] || '';

                                return (
                                  <React.Fragment key={collapseKey}>
                                    {/* PHASE HEADER ROW IN GANTT */}
                                    <tr className="bg-orange-100 dark:bg-slate-800 border-y border-[#fdba74] dark:border-orange-800">
                                      <td className="sticky left-0 z-20 bg-orange-100 dark:bg-slate-800 w-11 min-w-[44px] max-w-[48px] border-r border-orange-200 dark:border-slate-700 px-1 py-1 text-center">
                                        <button
                                          onClick={() =>
                                            togglePhaseCollapse(collapseKey)
                                          }
                                          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-[#c2410c] text-[#fdba74] font-mono text-[8px] font-black cursor-pointer"
                                          title="Plier / Déplier la phase"
                                        >
                                          {isCollapsed ? (
                                            <ChevronRight className="w-2.5 h-2.5" />
                                          ) : (
                                            <ChevronDown className="w-2.5 h-2.5" />
                                          )}
                                          P{pIdx + 1}
                                        </button>
                                      </td>
                                      <td
                                        onClick={() =>
                                          togglePhaseCollapse(collapseKey)
                                        }
                                        className="sticky left-[44px] z-20 bg-orange-100 dark:bg-slate-800 w-28 min-w-[112px] max-w-[124px] border-r-2 border-[#fdba74] px-1.5 py-1 font-black text-[9px] uppercase text-[#c2410c] dark:text-[#fdba74] whitespace-normal break-words cursor-pointer"
                                      >
                                        PHASE {pIdx + 1} : {phaseName} (
                                        {phaseTasks.length})
                                      </td>
                                      <td className="border-r border-orange-200 dark:border-slate-700 px-1.5 py-1 text-[8px] font-bold text-slate-600 dark:text-slate-300">
                                        Phase {pIdx + 1}
                                      </td>
                                      <td className="border-r border-orange-200 dark:border-slate-700 px-1 py-1 text-center font-mono text-[8px] font-black text-[#c2410c] dark:text-[#fdba74]">
                                        {phaseTasks.length} élém.
                                      </td>
                                      {timeBuckets.map(bucket => {
                                        const isPhaseActive = overlapsBucket(
                                          phaseMinStart,
                                          phaseMaxEnd,
                                          bucket
                                        );
                                        return (
                                          <td
                                            key={bucket.key}
                                            className="border-r border-orange-200/50 dark:border-slate-700/50 px-0.5 py-1 align-middle"
                                          >
                                            {isPhaseActive && (
                                              <div
                                                className="w-full h-1.5 rounded-full bg-[#c2410c] dark:bg-[#fdba74]/70"
                                                title={`Phase ${
                                                  pIdx + 1
                                                } (${phaseName}) : ${phaseMinStart} → ${phaseMaxEnd}`}
                                              />
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>

                                    {/* TASKS & MILESTONES IN THIS PHASE */}
                                    {!isCollapsed &&
                                      phaseTasks.map(tk => {
                                        const tIdxInPhase =
                                          phaseTasksAll.findIndex(
                                            item => item.id === tk.id
                                          );
                                        const code = `${
                                          tk.type === 'jalon' ? 'J' : 'T'
                                        }.${pIdx + 1}.${tIdxInPhase + 1}`;
                                        const metrics = computeTaskMetrics(
                                          tk,
                                          todayISO
                                        );
                                        const isJalon = tk.type === 'jalon';
                                        const hasDelay = metrics.ecartFinDays > 0;

                                        return (
                                          <tr
                                            key={tk.id}
                                            className={`${
                                              isJalon
                                                ? 'bg-orange-50/40 dark:bg-slate-800/40'
                                                : 'bg-white dark:bg-slate-900'
                                            } hover:bg-orange-50/80 dark:hover:bg-slate-800/80 transition-colors`}
                                          >
                                            {/* Locked Col 1: Code */}
                                            <td
                                              className={`sticky left-0 z-20 w-11 min-w-[44px] max-w-[48px] border-r border-slate-200 dark:border-slate-800 px-1.5 py-1.5 align-top whitespace-normal break-words ${
                                                isJalon
                                                  ? 'bg-orange-50 dark:bg-slate-800'
                                                  : 'bg-white dark:bg-slate-900'
                                              }`}
                                            >
                                              <span
                                                className={`inline-block font-mono text-[9px] font-black px-1 py-0.5 rounded leading-tight ${
                                                  isJalon
                                                    ? 'bg-[#fdba74] text-slate-950'
                                                    : 'bg-[#c2410c] text-white'
                                                }`}
                                              >
                                                {code}
                                              </span>
                                            </td>

                                            {/* Locked Col 2: Activité / Jalon (Half-width, full wrap, no truncation) */}
                                            <td
                                              className={`sticky left-[44px] z-20 w-28 min-w-[112px] max-w-[124px] border-r-2 border-[#fdba74]/70 px-1.5 py-1.5 align-top whitespace-normal break-words shadow-xs ${
                                                isJalon
                                                  ? 'bg-orange-50 dark:bg-slate-800'
                                                  : 'bg-white dark:bg-slate-900'
                                              }`}
                                            >
                                              <div
                                                className={`text-[10px] leading-snug whitespace-normal break-words ${
                                                  isJalon
                                                    ? 'font-bold text-slate-700 dark:text-slate-200 italic'
                                                    : 'font-extrabold text-slate-900 dark:text-white'
                                                }`}
                                              >
                                                {isJalon
                                                  ? `◆ ${tk.name}`
                                                  : tk.name}
                                              </div>
                                            </td>

                                            {/* Col 3: Responsable */}
                                            <td className="w-20 min-w-[76px] border-r border-slate-200 dark:border-slate-800 px-1.5 py-1.5 align-top text-[9px] font-semibold text-slate-700 dark:text-slate-300 whitespace-normal break-words">
                                              {tk.assignee || '—'}
                                            </td>

                                            {/* Col 4: Durée */}
                                            <td className="w-10 min-w-[40px] border-r border-slate-200 dark:border-slate-800 px-1 py-1.5 text-center align-middle font-mono font-black text-[9px] text-[#c2410c] dark:text-[#fdba74]">
                                              {metrics.plannedDurationLabel}
                                            </td>

                                            {/* Time Bucket Cells */}
                                            {timeBuckets.map(bucket => {
                                              const isPlanned = overlapsBucket(
                                                tk.startDate,
                                                tk.endDate,
                                                bucket
                                              );
                                              const isActual = overlapsBucket(
                                                tk.actualStartDate || '',
                                                tk.actualEndDate || '',
                                                bucket
                                              );

                                              return (
                                                <td
                                                  key={bucket.key}
                                                  className="border-r border-slate-100 dark:border-slate-800/60 px-0.5 py-1 align-middle text-center"
                                                >
                                                  <div className="flex flex-col gap-0.5 justify-center items-center min-h-[18px]">
                                                    {isPlanned && (
                                                      <div
                                                        className={`${
                                                          isJalon
                                                            ? 'h-2.5 w-2.5 rotate-45 bg-[#c2410c] dark:bg-[#fdba74]'
                                                            : 'w-full h-2 rounded-xs bg-[#fdba74] border border-[#ea580c]/50'
                                                        }`}
                                                        title={`Prévu : ${tk.startDate} → ${tk.endDate}`}
                                                      />
                                                    )}
                                                    {isActual && (
                                                      <div
                                                        className={`w-full h-1.5 rounded-xs ${
                                                          hasDelay
                                                            ? 'bg-amber-500'
                                                            : 'bg-emerald-500'
                                                        }`}
                                                        title={`Exécuté : ${
                                                          tk.actualStartDate || '?'
                                                        } → ${
                                                          tk.actualEndDate || '?'
                                                        }`}
                                                      />
                                                    )}
                                                  </div>
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: ARBRE WBS (AXES -> PROJETS -> 5 PHASES -> ACTIVITÉS & JALONS) */}
      {viewMode === 'tree' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm overflow-x-auto">
          <div style={{ zoom }} className="min-w-[680px] space-y-6">
            {filteredAxes.map((axe, aIdx) => {
              const axeProjects = (axe.projects || []).filter(
                p => filterProjectId === 'ALL' || p.id === filterProjectId
              );

              return (
                <div
                  key={axe.id}
                  className="rounded-xl border-2 border-[#c2410c] dark:border-[#fdba74]/50 bg-slate-50/50 dark:bg-slate-900/50 p-4"
                >
                  {/* Level 1: Axe Stratégique */}
                  <div className="flex items-center justify-between gap-3 bg-[#c2410c] text-white px-4 py-2.5 rounded-lg shadow-xs">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-[#fdba74] shrink-0" />
                      <span className="font-mono text-xs font-black bg-[#fdba74] text-slate-950 px-2 py-0.5 rounded">
                        {language === 'EN' ? 'AXIS' : 'AXE'} {aIdx + 1}
                      </span>
                      <span className="font-black text-xs sm:text-sm uppercase tracking-tight">
                        {axe.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-[#fdba74]">
                      {axeProjects.length}{' '}
                      {language === 'EN' ? 'Project(s)' : 'Projet(s)'}
                    </span>
                  </div>

                  {/* Level 2: Projets Opérationnels */}
                  <div className="mt-4 pl-4 sm:pl-6 border-l-2 border-[#fdba74] space-y-4">
                    {axeProjects.map((proj, pIdx) => {
                      const rawTasks = proj.tasks || [];
                      const projTasks = rawTasks.filter(
                        t =>
                          (filterPhase === 'ALL' || t.phase === filterPhase) &&
                          (filterAssignee === 'ALL' ||
                            (t.assignee || '').trim() === filterAssignee)
                      );
                      const projBudget = projTasks.reduce(
                        (acc, t) => acc + (Number(t.budget) || 0),
                        0
                      );

                      const phasesToDisplay =
                        filterPhase === 'ALL'
                          ? STANDARD_PHASES
                          : STANDARD_PHASES.filter(ph => ph === filterPhase);

                      return (
                        <div
                          key={proj.id}
                          className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 shadow-xs space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-black bg-orange-100 dark:bg-orange-950 text-[#c2410c] dark:text-[#fdba74] px-2 py-0.5 rounded">
                                PRJ {aIdx + 1}.{pIdx + 1}
                              </span>
                              <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                                {proj.name}
                              </span>
                            </div>
                            <span className="text-[11px] font-black text-[#ea580c] dark:text-[#fdba74]">
                              {formatCurrency(projBudget, currency, language)}
                            </span>
                          </div>

                          {/* Level 3: Phases de Projet */}
                          <div className="space-y-3 pl-3 border-l-2 border-orange-200 dark:border-slate-700">
                            {phasesToDisplay.map(phaseName => {
                              const phIdx = STANDARD_PHASES.indexOf(phaseName);
                              const phaseTasks = projTasks.filter(
                                tk => tk.phase === phaseName
                              );
                              if (phaseTasks.length === 0) return null;

                              return (
                                <div
                                  key={phaseName}
                                  className="rounded-lg bg-orange-50/40 dark:bg-slate-900/50 border border-orange-200/70 dark:border-slate-700 p-2.5 space-y-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                                      PHASE {phIdx + 1} : {phaseName}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-500">
                                      {phaseTasks.length}{' '}
                                      {language === 'EN' ? 'item(s)' : 'élément(s)'}
                                    </span>
                                  </div>

                                  {/* Level 4: Tasks & Milestones */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {phaseTasks.map((tk, tIdx) => {
                                      const metrics = computeTaskMetrics(
                                        tk,
                                        todayISO
                                      );
                                      return (
                                        <div
                                          key={tk.id}
                                          className={`rounded-lg border p-2.5 ${
                                            tk.type === 'jalon'
                                              ? 'border-[#fdba74] bg-orange-50/80 dark:bg-orange-950/30'
                                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="text-[11px] font-bold text-slate-900 dark:text-white">
                                              <span className="font-mono text-[10px] font-black text-[#ea580c] dark:text-[#fdba74] mr-1.5">
                                                [
                                                {tk.type === 'jalon' ? 'J' : 'T'}.
                                                {phIdx + 1}.{tIdx + 1}]
                                              </span>
                                              {tk.name}
                                            </div>
                                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#fdba74]/30 text-[#c2410c] dark:text-[#fdba74] shrink-0">
                                              {metrics.effectiveStatus}
                                            </span>
                                          </div>
                                          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                            <span>Resp: {tk.assignee || '—'}</span>
                                            <span>•</span>
                                            <span>
                                              {tk.startDate} → {tk.endDate} (
                                              {metrics.plannedDurationLabel})
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: CALENDRIER (PRÉSENTATION CALENDRIER AVEC AUTOMATISATION DES TÂCHES) */}
      {viewMode === 'calendar' && (() => {
        const monthNamesFull =
          language === 'EN'
            ? [
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December'
              ]
            : [
                'Janvier',
                'Février',
                'Mars',
                'Avril',
                'Mai',
                'Juin',
                'Juillet',
                'Août',
                'Septembre',
                'Octobre',
                'Novembre',
                'Décembre'
              ];

        const weekDaysHeader =
          language === 'EN'
            ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

        const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
        const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
        // Monday-based index (0 = Mon ... 6 = Sun)
        const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

        const calendarCells: Array<{ dateISO: string; dayNum: number } | null> = [];
        for (let i = 0; i < startOffset; i++) {
          calendarCells.push(null);
        }
        for (let d = 1; d <= daysInMonth; d++) {
          const iso = `${calendarYear}-${String(calendarMonth + 1).padStart(
            2,
            '0'
          )}-${String(d).padStart(2, '0')}`;
          calendarCells.push({ dateISO: iso, dayNum: d });
        }
        while (calendarCells.length % 7 !== 0) {
          calendarCells.push(null);
        }

        const monthStartISO = `${calendarYear}-${String(calendarMonth + 1).padStart(
          2,
          '0'
        )}-01`;
        const monthEndISO = `${calendarYear}-${String(calendarMonth + 1).padStart(
          2,
          '0'
        )}-${String(daysInMonth).padStart(2, '0')}`;

        const isTaskOnDate = (
          item: (typeof enrichedCalendarTasks)[number],
          dateISO: string
        ) => {
          const s = item.task.startDate || item.task.endDate;
          const e = item.task.endDate || item.task.startDate;
          if (s && e && dateISO >= s && dateISO <= e) return true;
          const actS = item.metrics.effectiveActualStartDate;
          const actE = item.metrics.effectiveActualEndDate;
          if (actS && actE && dateISO >= actS && dateISO <= actE) return true;
          if (actS && !actE && dateISO === actS) return true;
          return false;
        };

        const tasksInCurrentMonth = enrichedCalendarTasks.filter(item => {
          const s = item.task.startDate || item.task.endDate;
          const e = item.task.endDate || item.task.startDate;
          if (!s || !e) return false;
          return s <= monthEndISO && e >= monthStartISO;
        });

        const selectedDayTasks = enrichedCalendarTasks.filter(item =>
          isTaskOnDate(item, selectedCalendarDate)
        );

        const handlePrevMonth = () => {
          if (calendarMonth === 0) {
            setCalendarYear(y => y - 1);
            setCalendarMonth(11);
          } else {
            setCalendarMonth(m => m - 1);
          }
        };

        const handleNextMonth = () => {
          if (calendarMonth === 11) {
            setCalendarYear(y => y + 1);
            setCalendarMonth(0);
          } else {
            setCalendarMonth(m => m + 1);
          }
        };

        const handleGoToToday = () => {
          const d = new Date(todayISO);
          if (!isNaN(d.getTime())) {
            setCalendarYear(d.getFullYear());
            setCalendarMonth(d.getMonth());
          }
          setSelectedCalendarDate(todayISO);
        };

        return (
          <div style={{ zoom }} className="space-y-3">
            {/* Top Calendar Navigation & Automated Monthly Summary */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#fdba74] text-slate-700 dark:text-slate-200 hover:text-slate-950 transition-colors cursor-pointer"
                    title={language === 'EN' ? 'Previous month' : 'Mois précédent'}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="px-3 py-1 rounded-lg bg-[#c2410c] text-white font-black text-xs sm:text-sm uppercase tracking-wider min-w-[150px] text-center shadow-xs">
                    {monthNamesFull[calendarMonth]} {calendarYear}
                  </div>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#fdba74] text-slate-700 dark:text-slate-200 hover:text-slate-950 transition-colors cursor-pointer"
                    title={language === 'EN' ? 'Next month' : 'Mois suivant'}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToToday}
                    className="px-2.5 py-1 rounded-lg bg-[#fdba74] hover:bg-orange-300 text-slate-950 text-[10px] sm:text-xs font-black uppercase cursor-pointer transition-colors"
                  >
                    {language === 'EN' ? 'Today' : 'Aujourd’hui'} ({todayISO})
                  </button>
                </div>

                {/* Automated Monthly Counters */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-black">
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    {tasksInCurrentMonth.length}{' '}
                    {language === 'EN' ? 'active in month' : 'actives ce mois'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {
                      tasksInCurrentMonth.filter(
                        i => i.metrics.effectiveStatus === 'Terminé'
                      ).length
                    }{' '}
                    {language === 'EN' ? 'Completed' : 'Terminées'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-orange-100 text-[#c2410c] dark:bg-orange-950/60 dark:text-[#fdba74]">
                    {
                      tasksInCurrentMonth.filter(
                        i => i.metrics.effectiveStatus === 'En cours'
                      ).length
                    }{' '}
                    {language === 'EN' ? 'In Progress' : 'En cours'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    {
                      tasksInCurrentMonth.filter(
                        i => i.metrics.effectiveStatus === 'Bloqué'
                      ).length
                    }{' '}
                    {language === 'EN' ? 'Blocked' : 'Bloquées'}
                  </span>
                </div>
              </div>

              {/* Quick Jump to Active Project Months */}
              {projectActiveMonths.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] font-extrabold uppercase text-slate-400 shrink-0">
                    {language === 'EN' ? 'Active Months:' : 'Mois actifs :'}
                  </span>
                  {projectActiveMonths.map(pm => {
                    const isCurrent =
                      pm.year === calendarYear && pm.month === calendarMonth;
                    return (
                      <button
                        key={`${pm.year}-${pm.month}`}
                        type="button"
                        onClick={() => {
                          setCalendarYear(pm.year);
                          setCalendarMonth(pm.month);
                          setSelectedCalendarDate(
                            `${pm.year}-${String(pm.month + 1).padStart(
                              2,
                              '0'
                            )}-01`
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                          isCurrent
                            ? 'bg-[#c2410c] text-[#fdba74] font-black'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#fdba74]/40'
                        }`}
                      >
                        {pm.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 7-Column Calendar Grid */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 bg-[#c2410c] text-white border-b-2 border-[#fdba74]">
                {weekDaysHeader.map(wd => (
                  <div
                    key={wd}
                    className="py-2 text-center text-[10px] sm:text-xs font-black uppercase tracking-wider border-r border-orange-800 last:border-r-0"
                  >
                    {wd}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 divide-x divide-y divide-slate-200 dark:divide-slate-800">
                {calendarCells.map((cell, idx) => {
                  if (!cell) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="min-h-[76px] sm:min-h-[104px] bg-slate-50/50 dark:bg-slate-950/30"
                      />
                    );
                  }

                  const dayItems = enrichedCalendarTasks.filter(item =>
                    isTaskOnDate(item, cell.dateISO)
                  );
                  const isToday = cell.dateISO === todayISO;
                  const isSelected = cell.dateISO === selectedCalendarDate;

                  return (
                    <div
                      key={cell.dateISO}
                      onClick={() => setSelectedCalendarDate(cell.dateISO)}
                      className={`min-h-[76px] sm:min-h-[104px] p-1 sm:p-1.5 flex flex-col justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-orange-50/90 dark:bg-orange-950/40 ring-2 ring-inset ring-[#ea580c]'
                          : isToday
                          ? 'bg-amber-50/40 dark:bg-amber-950/20'
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-black ${
                            isToday
                              ? 'bg-[#ea580c] text-white shadow-xs'
                              : isSelected
                              ? 'bg-[#c2410c] text-[#fdba74]'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {dayItems.length > 0 && (
                          <span className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[8px] font-mono font-black text-[#ea580c] dark:text-[#fdba74]">
                            {dayItems.length}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 space-y-0.5 overflow-hidden">
                        {dayItems.slice(0, 3).map(item => {
                          const st = item.metrics.effectiveStatus;
                          const isMilestone = item.task.type === 'jalon';
                          const pillColor =
                            st === 'Terminé'
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border-emerald-300'
                              : st === 'Bloqué'
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border-amber-400'
                              : st === 'En cours'
                              ? 'bg-orange-100 text-[#c2410c] dark:bg-orange-950/80 dark:text-[#fdba74] border-[#fdba74]'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300';

                          return (
                            <div
                              key={item.task.id}
                              title={`[${item.code}] ${item.task.name} (${st}) — ${item.task.startDate} → ${item.task.endDate}`}
                              className={`px-1 py-0.5 rounded border text-[8px] sm:text-[9px] font-bold truncate leading-tight ${pillColor}`}
                            >
                              <span className="font-mono font-black mr-1">
                                {isMilestone ? `◆ ${item.code}` : item.code}
                              </span>
                              <span>{item.task.name}</span>
                            </div>
                          );
                        })}
                        {dayItems.length > 3 && (
                          <div className="text-[8px] font-black text-[#ea580c] dark:text-[#fdba74] text-center">
                            +{dayItems.length - 3}{' '}
                            {language === 'EN' ? 'more' : 'autres'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Automated Day & Task Control Panel for Selected Date */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-[#fdba74] dark:border-orange-800 p-3 sm:p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#ea580c] dark:text-[#fdba74]" />
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">
                    {language === 'EN'
                      ? `Automated Task Schedule — Date: ${selectedCalendarDate}`
                      : `Automatisation des Tâches du Jour — Date : ${selectedCalendarDate}`}
                  </h3>
                  {selectedCalendarDate === todayISO && (
                    <span className="px-2 py-0.5 rounded bg-[#fdba74] text-slate-950 text-[9px] font-black uppercase">
                      {language === 'EN' ? 'TODAY' : 'AUJOURD’HUI'}
                    </span>
                  )}
                </div>

                {/* Quick Automated Assignment of any Task to Selected Day (Preserves Duration) */}
                {onUpdateTask && enrichedCalendarTasks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={taskToAutoScheduleId}
                      onChange={e => setTaskToAutoScheduleId(e.target.value)}
                      className="h-7 px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-100 max-w-[220px] truncate"
                    >
                      <option value="">
                        {language === 'EN'
                          ? '+ Select a task to schedule on this date...'
                          : '+ Choisir une tâche à planifier ce jour...'}
                      </option>
                      {enrichedCalendarTasks.map(it => (
                        <option key={it.task.id} value={it.task.id}>
                          [{it.code}] {it.task.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!taskToAutoScheduleId}
                      onClick={() => {
                        const target = enrichedCalendarTasks.find(
                          it => it.task.id === taskToAutoScheduleId
                        );
                        if (!target) return;
                        const dur =
                          target.task.type === 'jalon'
                            ? 0
                            : Math.max(1, target.metrics.plannedDurationDays);
                        const newEnd =
                          target.task.type === 'jalon'
                            ? selectedCalendarDate
                            : addDaysISO(selectedCalendarDate, dur);
                        onUpdateTask(target.projectId, target.task.id, {
                          startDate: selectedCalendarDate,
                          endDate: newEnd
                        });
                        setTaskToAutoScheduleId('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#c2410c] disabled:opacity-40 hover:bg-[#9a3412] text-white text-[10px] font-black uppercase cursor-pointer transition-colors"
                    >
                      {language === 'EN'
                        ? 'Auto-Schedule Here'
                        : 'Planifier Auto sur ce jour'}
                    </button>
                  </div>
                )}
              </div>

              {selectedDayTasks.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400 italic">
                  {language === 'EN'
                    ? `No task or milestone scheduled on ${selectedCalendarDate}. Select a task above to auto-schedule it on this date.`
                    : `Aucune activité ou jalon prévu le ${selectedCalendarDate}. Vous pouvez affecter automatiquement une tâche à cette date via le sélecteur ci-dessus.`}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {selectedDayTasks.map(item => {
                    const { task, code, projectId, projectName, metrics } = item;
                    const effSt = metrics.effectiveStatus;
                    const canSetExecOnSelectedDate =
                      selectedCalendarDate <= todayISO;

                    return (
                      <div
                        key={task.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 flex flex-col justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-xs font-black text-slate-900 dark:text-white">
                              <span className="px-1.5 py-0.5 rounded bg-[#c2410c] text-[#fdba74] font-mono text-[10px] mr-1.5">
                                {code}
                              </span>
                              {task.name}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-black shrink-0 ${
                                effSt === 'Terminé'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : effSt === 'Bloqué'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : effSt === 'En cours'
                                  ? 'bg-orange-100 text-[#c2410c] dark:bg-orange-950/60 dark:text-[#fdba74]'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {effSt}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span>
                              <strong>{language === 'EN' ? 'Project:' : 'Projet :'}</strong>{' '}
                              {projectName}
                            </span>
                            <span>
                              <strong>Phase :</strong> {task.phase}
                            </span>
                            <span>
                              <strong>{language === 'EN' ? 'Owner:' : 'Resp. :'}</strong>{' '}
                              {task.assignee || '—'}
                            </span>
                          </div>

                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex flex-wrap gap-3">
                            <span>
                              {language === 'EN' ? 'Planned:' : 'Prévu :'}{' '}
                              <strong>
                                {task.startDate} → {task.endDate} (
                                {metrics.plannedDurationLabel})
                              </strong>
                            </span>
                            {metrics.effectiveActualStartDate && (
                              <span className="text-[#ea580c] dark:text-[#fdba74]">
                                {language === 'EN' ? 'Exec:' : 'Exéc :'}{' '}
                                <strong>
                                  {metrics.effectiveActualStartDate} →{' '}
                                  {metrics.effectiveActualEndDate || '...'}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>

                        {onUpdateTask && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700">
                            {canSetExecOnSelectedDate && effSt !== 'En cours' && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateTask(projectId, task.id, {
                                    actualStartDate: selectedCalendarDate,
                                    actualEndDate: '',
                                    status: 'En cours',
                                    manualBlocked: false
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white text-[9.5px] font-black cursor-pointer"
                              >
                                <PlayCircle className="w-3 h-3" />
                                <span>
                                  {language === 'EN'
                                    ? `Start (${selectedCalendarDate})`
                                    : `Démarrer (${selectedCalendarDate})`}
                                </span>
                              </button>
                            )}

                            {canSetExecOnSelectedDate && effSt !== 'Terminé' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const startExec =
                                    metrics.effectiveActualStartDate &&
                                    metrics.effectiveActualStartDate <=
                                      selectedCalendarDate
                                      ? metrics.effectiveActualStartDate
                                      : selectedCalendarDate;
                                  onUpdateTask(projectId, task.id, {
                                    actualStartDate: startExec,
                                    actualEndDate: selectedCalendarDate,
                                    status: 'Terminé',
                                    manualBlocked: false
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[9.5px] font-black cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>
                                  {language === 'EN'
                                    ? `Mark Completed (${selectedCalendarDate})`
                                    : `Terminer (${selectedCalendarDate})`}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                const dur =
                                  task.type === 'jalon'
                                    ? 0
                                    : Math.max(1, metrics.plannedDurationDays);
                                onUpdateTask(projectId, task.id, {
                                  startDate: selectedCalendarDate,
                                  endDate:
                                    task.type === 'jalon'
                                      ? selectedCalendarDate
                                      : addDaysISO(selectedCalendarDate, dur)
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-[#fdba74] text-slate-800 dark:text-slate-100 hover:text-slate-950 text-[9.5px] font-bold cursor-pointer"
                            >
                              <Clock className="w-3 h-3" />
                              <span>
                                {language === 'EN'
                                  ? 'Set Planned Start Here'
                                  : 'Caler Déb. Prév ce jour'}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
