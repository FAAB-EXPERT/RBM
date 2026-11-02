import React, { useMemo, useState } from 'react';
import { Calendar, FolderKanban, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { CurrencyCode, Dossier, GanttTimeScale, Project, Task } from '../types';
import { computeTaskMetrics, getTodayISO, STANDARD_PHASES } from '../pertUtils';
import { formatCurrencyValue } from '../i18n';

interface GanttWbsViewProps {
  activeDossier: Dossier;
  currency: CurrencyCode;
  filterAxeId: string;
  setFilterAxeId: (id: string) => void;
  filterProjectId: string;
  setFilterProjectId: (id: string) => void;
  filterAssignee: string;
  setFilterAssignee: (assignee: string) => void;
}

interface TimeBucket {
  key: string;
  label: string;
  subLabel?: string;
  startMs: number;
  endMs: number;
}

function buildTimeBuckets(minMs: number, maxMs: number, scale: GanttTimeScale): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  const startDate = new Date(minMs);
  const endDate = new Date(maxMs);

  if (scale === 'day') {
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    // Cap at 120 days max for performance if horizon is huge, or cover the task range
    let count = 0;
    while (cur.getTime() <= endDate.getTime() && count < 180) {
      const s = cur.getTime();
      const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      const e = next.getTime() - 1;
      buckets.push({
        key: `d-${s}`,
        label: cur.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        subLabel: cur.toLocaleDateString('fr-FR', { weekday: 'short' }),
        startMs: s,
        endMs: e
      });
      cur.setDate(cur.getDate() + 1);
      count++;
    }
  } else if (scale === 'week') {
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    let weekIndex = 1;
    while (cur.getTime() <= endDate.getTime() && weekIndex <= 104) {
      const s = cur.getTime();
      const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
      const e = next.getTime() - 1;
      buckets.push({
        key: `w-${s}`,
        label: `S${weekIndex}`,
        subLabel: cur.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        startMs: s,
        endMs: e
      });
      cur.setDate(cur.getDate() + 7);
      weekIndex++;
    }
  } else if (scale === 'month') {
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    let safety = 0;
    while (cur.getTime() <= endDate.getTime() && safety < 72) {
      const s = cur.getTime();
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const e = next.getTime() - 1;
      buckets.push({
        key: `m-${cur.getFullYear()}-${cur.getMonth()}`,
        label: cur.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase(),
        subLabel: String(cur.getFullYear()),
        startMs: s,
        endMs: e
      });
      cur.setMonth(cur.getMonth() + 1);
      safety++;
    }
  } else if (scale === 'quarter') {
    const startQMonth = Math.floor(startDate.getMonth() / 3) * 3;
    const cur = new Date(startDate.getFullYear(), startQMonth, 1);
    let safety = 0;
    while (cur.getTime() <= endDate.getTime() && safety < 32) {
      const qNum = Math.floor(cur.getMonth() / 3) + 1;
      const s = cur.getTime();
      const next = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
      const e = next.getTime() - 1;
      buckets.push({
        key: `q-${cur.getFullYear()}-T${qNum}`,
        label: `T${qNum}`,
        subLabel: String(cur.getFullYear()),
        startMs: s,
        endMs: e
      });
      cur.setMonth(cur.getMonth() + 3);
      safety++;
    }
  } else if (scale === 'semester') {
    const startSMonth = startDate.getMonth() < 6 ? 0 : 6;
    const cur = new Date(startDate.getFullYear(), startSMonth, 1);
    let safety = 0;
    while (cur.getTime() <= endDate.getTime() && safety < 20) {
      const sNum = cur.getMonth() < 6 ? 1 : 2;
      const s = cur.getTime();
      const next = new Date(cur.getFullYear(), cur.getMonth() + 6, 1);
      const e = next.getTime() - 1;
      buckets.push({
        key: `sem-${cur.getFullYear()}-S${sNum}`,
        label: `Sem. ${sNum}`,
        subLabel: String(cur.getFullYear()),
        startMs: s,
        endMs: e
      });
      cur.setMonth(cur.getMonth() + 6);
      safety++;
    }
  } else {
    // year
    const cur = new Date(startDate.getFullYear(), 0, 1);
    let safety = 0;
    while (cur.getTime() <= endDate.getTime() && safety < 15) {
      const s = cur.getTime();
      const next = new Date(cur.getFullYear() + 1, 0, 1);
      const e = next.getTime() - 1;
      buckets.push({
        key: `y-${cur.getFullYear()}`,
        label: String(cur.getFullYear()),
        subLabel: 'Année',
        startMs: s,
        endMs: e
      });
      cur.setFullYear(cur.getFullYear() + 1);
      safety++;
    }
  }

  return buckets;
}

export const GanttWbsView: React.FC<GanttWbsViewProps> = ({
  activeDossier,
  currency,
  filterAxeId,
  setFilterAxeId,
  filterProjectId,
  setFilterProjectId,
  filterAssignee,
  setFilterAssignee
}) => {
  const [displayMode, setDisplayMode] = useState<'gantt' | 'wbs'>('gantt');
  const [timeScale, setTimeScale] = useState<GanttTimeScale>('month');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const todayISO = getTodayISO();

  const axes = activeDossier.axes || [];

  // Projects filtered by Axe
  const projectsForAxe = useMemo(() => {
    const list: (Project & { axeId: string; axeName: string })[] = [];
    axes.forEach(ax => {
      if (filterAxeId !== 'ALL' && ax.id !== filterAxeId) return;
      (ax.projects || []).forEach(pr => {
        list.push({ ...pr, axeId: ax.id, axeName: ax.name });
      });
    });
    return list;
  }, [axes, filterAxeId]);

  // Unique assignees across all tasks in the dossier
  const allAssignees = useMemo(() => {
    const set = new Set<string>();
    axes.forEach(ax => {
      (ax.projects || []).forEach(pr => {
        (pr.tasks || []).forEach(tk => {
          if (tk.assignee && tk.assignee.trim() !== '') {
            set.add(tk.assignee.trim());
          }
        });
      });
    });
    return Array.from(set).sort();
  }, [axes]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projectsForAxe.filter(pr => filterProjectId === 'ALL' || pr.id === filterProjectId);
  }, [projectsForAxe, filterProjectId]);

  // Gather ordered rows with exact WBS code (matching Planification) and filtered by Responsable
  const ganttGroups = useMemo(() => {
    return filteredProjects.map(proj => {
      const rawTasks = proj.tasks || [];
      const phaseBlocks = STANDARD_PHASES.map((phaseName, pIdx) => {
        const phaseTasksAll = rawTasks.filter(t => t.phase === phaseName);
        const rows = phaseTasksAll
          .map((tk, tIdx) => {
            const code = `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`;
            return { task: tk, code };
          })
          .filter(({ task }) => {
            if (filterAssignee === 'ALL') return true;
            return (task.assignee || '').trim() === filterAssignee;
          });

        return {
          phaseName,
          phaseIndex: pIdx + 1,
          rows
        };
      }).filter(pb => pb.rows.length > 0);

      return {
        project: proj,
        phaseBlocks
      };
    }).filter(g => g.phaseBlocks.length > 0);
  }, [filteredProjects, filterAssignee]);

  // Compute global min/max dates across visible tasks
  const { minMs, maxMs } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    ganttGroups.forEach(g => {
      g.phaseBlocks.forEach(pb => {
        pb.rows.forEach(({ task }) => {
          const s = new Date(task.startDate).getTime();
          const e = new Date(task.endDate).getTime();
          if (!isNaN(s) && s < min) min = s;
          if (!isNaN(e) && e > max) max = e;
        });
      });
    });
    if (!isFinite(min) || !isFinite(max) || max < min) {
      const y = activeDossier.psdYear || new Date().getFullYear();
      min = new Date(`${y}-01-01`).getTime();
      max = new Date(`${y}-12-31`).getTime();
    }
    return { minMs: min, maxMs: max };
  }, [ganttGroups, activeDossier.psdYear]);

  const timeBuckets = useMemo(
    () => buildTimeBuckets(minMs, maxMs, timeScale),
    [minMs, maxMs, timeScale]
  );

  const timelineStartMs = timeBuckets.length > 0 ? timeBuckets[0].startMs : minMs;
  const timelineEndMs =
    timeBuckets.length > 0 ? timeBuckets[timeBuckets.length - 1].endMs : maxMs;
  const totalSpanMs = Math.max(86400000, timelineEndMs - timelineStartMs);

  const scaleOptions: { id: GanttTimeScale; label: string }[] = [
    { id: 'day', label: 'Jour' },
    { id: 'week', label: 'Semaine' },
    { id: 'month', label: 'Mois' },
    { id: 'quarter', label: 'Trimestre' },
    { id: 'semester', label: 'Semestre' },
    { id: 'year', label: 'Année' }
  ];

  const colMinWidth =
    timeScale === 'day'
      ? 42
      : timeScale === 'week'
      ? 52
      : timeScale === 'month'
      ? 62
      : timeScale === 'quarter'
      ? 76
      : timeScale === 'semester'
      ? 96
      : 110;

  return (
    <div className="space-y-4">
      {/* BARRE DE CONTRÔLE : BASCULE GANTT / ARBRE WBS + ÉCHELLES DE TEMPS + FILTRES (AXE, PROJET, RESPONSABLE) */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Bascule Vue Diagramme de Gantt vs Vue Arbre WBS (sans Vue Liste / Tableau) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDisplayMode('gantt')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                displayMode === 'gantt'
                  ? 'bg-[#fdba74] text-slate-950 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Diagramme de Gantt
            </button>
            <button
              onClick={() => setDisplayMode('wbs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                displayMode === 'wbs'
                  ? 'bg-[#fdba74] text-slate-950 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" /> Arbre WBS
            </button>
          </div>

          {/* Boutons d'échelle temporelle : Jour, Semaine, Mois, Trimestre, Semestre, Année */}
          {displayMode === 'gantt' && (
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 px-2">
                Échelle :
              </span>
              {scaleOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setTimeScale(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition cursor-pointer ${
                    timeScale === opt.id
                      ? 'bg-[#c2410c] text-[#fdba74] shadow-xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Contrôle de Zoom */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setZoomLevel(z => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Zoom -"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-black px-2 text-slate-800 dark:text-slate-200">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(z => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Zoom +"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Réinitialiser"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filtres : 1. Axe Stratégique, 2. Projet, 3. Responsable */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
              1. Axe Stratégique
            </label>
            <select
              value={filterAxeId}
              onChange={e => {
                setFilterAxeId(e.target.value);
                setFilterProjectId('ALL');
              }}
              className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="ALL">Tous les axes ({axes.length})</option>
              {axes.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
              2. Projet
            </label>
            <select
              value={filterProjectId}
              onChange={e => setFilterProjectId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="ALL">Tous les projets ({projectsForAxe.length})</option>
              {projectsForAxe.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
              3. Responsable
            </label>
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="ALL">Tous les responsables ({allAssignees.length})</option>
              {allAssignees.map(resp => (
                <option key={resp} value={resp}>
                  {resp}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* MODE 1 : DIAGRAMME DE GANTT AVEC LES 2 PREMIÈRES COLONNES DE LA PLANIFICATION BLOQUÉES & RÉDUITES DE MOITIÉ */}
      {displayMode === 'gantt' ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top left',
                width: `${100 / zoomLevel}%`
              }}
            >
              <table className="w-full text-left border-collapse table-compact">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[9px] font-black">
                    {/* Colonne 1 bloquée et réduite de moitié : Code */}
                    <th className="sticky left-0 z-20 bg-slate-900 border-r border-slate-800 w-11 min-w-[44px] max-w-[48px] text-center">
                      Code
                    </th>
                    {/* Colonne 2 bloquée et réduite de moitié : Activité / Jalon */}
                    <th className="sticky left-[44px] z-20 bg-slate-900 border-r-2 border-[#fdba74] w-28 min-w-[110px] max-w-[125px]">
                      Activité / Jalon
                    </th>
                    {/* Colonnes de l'échelle de temps choisie */}
                    {timeBuckets.map(b => (
                      <th
                        key={b.key}
                        style={{ minWidth: `${colMinWidth}px` }}
                        className="text-center border-r border-slate-800 px-1 py-1.5"
                      >
                        <div className="text-[9px] font-black text-[#fdba74] leading-tight">{b.label}</div>
                        {b.subLabel && (
                          <div className="text-[8px] font-semibold text-slate-400 leading-tight">
                            {b.subLabel}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {ganttGroups.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2 + timeBuckets.length}
                        className="p-6 text-center text-xs font-bold text-slate-400"
                      >
                        Aucune activité trouvée pour les filtres sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    ganttGroups.map(({ project, phaseBlocks }) => (
                      <React.Fragment key={project.id}>
                        {/* Bandeau Projet */}
                        <tr className="bg-[#c2410c] text-white">
                          <td
                            colSpan={2 + timeBuckets.length}
                            className="py-1.5 px-3 text-[10px] font-black uppercase tracking-wider"
                          >
                            PROJET : {project.name}{' '}
                            <span className="text-[#fdba74] ml-2 font-bold">({project.axeName})</span>
                          </td>
                        </tr>

                        {phaseBlocks.map(pb => (
                          <React.Fragment key={`${project.id}-${pb.phaseName}`}>
                            {/* Bandeau Phase */}
                            <tr className="bg-[#fff7ed] dark:bg-orange-950/50">
                              <td
                                colSpan={2 + timeBuckets.length}
                                className="py-1 px-3 text-[9px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]"
                              >
                                PHASE {pb.phaseIndex} — {pb.phaseName}
                              </td>
                            </tr>

                            {/* Lignes Tâches / Jalons */}
                            {pb.rows.map(({ task, code }) => {
                              const m = computeTaskMetrics(task, todayISO);
                              const sMs = new Date(task.startDate).getTime();
                              const eMs = new Date(task.endDate).getTime();

                              const barColor =
                                m.effectiveStatus === 'Terminé'
                                  ? 'bg-emerald-500'
                                  : m.effectiveStatus === 'Bloqué'
                                  ? 'bg-red-500'
                                  : m.effectiveStatus === 'En cours'
                                  ? 'bg-[#ea580c]'
                                  : 'bg-slate-400';

                              return (
                                <tr
                                  key={task.id}
                                  className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition"
                                >
                                  {/* Colonne 1 bloquée & réduite de moitié : Code */}
                                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-11 min-w-[44px] max-w-[48px] text-center font-black text-[10px] text-[#c2410c] dark:text-[#fdba74] whitespace-normal break-words">
                                    {code}
                                  </td>

                                  {/* Colonne 2 bloquée & réduite de moitié avec retour à la ligne intégral : Activité / Jalon */}
                                  <td className="sticky left-[44px] z-10 bg-white dark:bg-slate-900 border-r-2 border-[#fdba74] w-28 min-w-[110px] max-w-[125px] whitespace-normal break-words leading-tight py-1.5 px-1.5">
                                    <div className="flex flex-col gap-0.5">
                                      <span
                                        className={`inline-block w-fit text-[8px] font-black px-1 py-0.2 rounded uppercase ${
                                          task.type === 'jalon'
                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                            : 'bg-[#fff7ed] text-[#ea580c] dark:bg-orange-950/60 dark:text-[#fdba74]'
                                        }`}
                                      >
                                        {task.type === 'jalon' ? 'Jalon' : 'Tâche'}
                                      </span>
                                      <span className="font-bold text-[10px] text-slate-900 dark:text-white whitespace-normal break-words leading-snug">
                                        {task.name}
                                      </span>
                                      <span className="text-[8px] font-semibold text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                                        Resp: {task.assignee || '—'} • {m.plannedDurationLabel}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Cellules temporelles du Gantt */}
                                  {timeBuckets.map(bucket => {
                                    const overlaps =
                                      !isNaN(sMs) &&
                                      !isNaN(eMs) &&
                                      sMs <= bucket.endMs &&
                                      eMs >= bucket.startMs;

                                    // Compute relative bar inside bucket if overlapping
                                    let leftInBucket = 0;
                                    let widthInBucket = 100;
                                    if (overlaps) {
                                      const bucketSpan = Math.max(1, bucket.endMs - bucket.startMs);
                                      const clampedStart = Math.max(bucket.startMs, sMs);
                                      const clampedEnd = Math.min(bucket.endMs, eMs);
                                      leftInBucket = Math.max(
                                        0,
                                        Math.min(90, ((clampedStart - bucket.startMs) / bucketSpan) * 100)
                                      );
                                      widthInBucket = Math.max(
                                        14,
                                        Math.min(
                                          100 - leftInBucket,
                                          ((clampedEnd - clampedStart) / bucketSpan) * 100
                                        )
                                      );
                                    }

                                    return (
                                      <td
                                        key={bucket.key}
                                        className="border-r border-slate-100 dark:border-slate-800/70 p-0.5 relative h-10 align-middle"
                                      >
                                        {overlaps && (
                                          <div className="relative w-full h-5 flex items-center">
                                            {task.type === 'jalon' ? (
                                              <div
                                                className="w-3.5 h-3.5 bg-amber-500 rotate-45 shadow-xs border border-white mx-auto"
                                                title={`${code} - ${task.name} (${task.startDate})`}
                                              />
                                            ) : (
                                              <div
                                                className={`h-3.5 rounded ${barColor} shadow-xs`}
                                                style={{
                                                  marginLeft: `${leftInBucket}%`,
                                                  width: `${widthInBucket}%`
                                                }}
                                                title={`${code} - ${task.name} (${task.startDate} → ${task.endDate}) • ${m.effectiveStatus}`}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Légende du Diagramme de Gantt */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[10px] font-bold text-slate-600 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Terminé
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#ea580c] inline-block" /> En cours
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-400 inline-block" /> À faire
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-500 inline-block" /> Bloqué
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-500 rotate-45 inline-block" /> Jalon
              </span>
            </div>
            <span>
              Horizon affiché : {new Date(timelineStartMs).toLocaleDateString('fr-FR')} →{' '}
              {new Date(timelineEndMs).toLocaleDateString('fr-FR')} (
              {Math.round(totalSpanMs / 86400000)} jours)
            </span>
          </div>
        </div>
      ) : (
        /* MODE 2 : ARBRE WBS HIÉRARCHIQUE */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 overflow-x-auto shadow-sm">
          <div
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top left',
              width: `${100 / zoomLevel}%`
            }}
            className="min-w-[680px]"
          >
            <div className="flex flex-col items-center">
              <div className="px-5 py-2.5 rounded-xl bg-[#c2410c] text-white font-black text-xs uppercase tracking-wider shadow-md border-2 border-[#fdba74]">
                {activeDossier.name}
              </div>
              <div className="w-0.5 h-6 bg-[#fdba74]" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                {axes
                  .filter(ax => filterAxeId === 'ALL' || ax.id === filterAxeId)
                  .map(axe => (
                    <div
                      key={axe.id}
                      className="border-2 border-[#fdba74]/60 dark:border-orange-900/50 rounded-xl p-3 bg-[#fff7ed]/30 dark:bg-orange-950/10"
                    >
                      <div className="px-3 py-2 rounded-lg bg-[#fdba74] text-slate-950 font-black text-xs uppercase mb-3 shadow-xs">
                        {axe.name}
                      </div>
                      <div className="space-y-3 pl-3 border-l-2 border-[#fdba74] dark:border-orange-800">
                        {(axe.projects || [])
                          .filter(pr => filterProjectId === 'ALL' || pr.id === filterProjectId)
                          .map(proj => {
                            const visibleTasks = (proj.tasks || []).filter(
                              tk =>
                                filterAssignee === 'ALL' ||
                                (tk.assignee || '').trim() === filterAssignee
                            );
                            return (
                              <div
                                key={proj.id}
                                className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs"
                              >
                                <div className="font-black text-xs text-slate-900 dark:text-white mb-2 flex justify-between items-center">
                                  <span>{proj.name}</span>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[#ea580c] dark:text-[#fdba74]">
                                    {visibleTasks.length} éléments
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {visibleTasks.map(tk => {
                                    const m = computeTaskMetrics(tk, todayISO);
                                    return (
                                      <div
                                        key={tk.id}
                                        className="text-[10px] p-1.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex flex-col justify-between gap-1"
                                      >
                                        <div className="flex items-start justify-between gap-1.5">
                                          <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-normal break-words leading-snug">
                                            {tk.name}
                                          </span>
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[8px] font-black shrink-0 ${
                                              m.effectiveStatus === 'Terminé'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : m.effectiveStatus === 'Bloqué'
                                                ? 'bg-red-100 text-red-700'
                                                : m.effectiveStatus === 'En cours'
                                                ? 'bg-[#fdba74]/40 text-[#c2410c]'
                                                : 'bg-slate-200 text-slate-700'
                                            }`}
                                          >
                                            {m.effectiveStatus}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[8.5px] font-semibold text-slate-500">
                                          <span>Resp: {tk.assignee || '—'}</span>
                                          <span>{formatCurrencyValue(tk.budget || 0, currency)}</span>
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
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
