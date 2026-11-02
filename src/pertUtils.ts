import { Dossier, PertNode, Project, Task } from './types';

export const STANDARD_PHASES = [
  'AVANT PROJET',
  'CONCEPTION',
  'PLANIFICATION',
  'EXÉCUTION & SUIVI',
  'CLÔTURE'
];

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(dateStr: string, days: number): string {
  const base = new Date(dateStr);
  if (isNaN(base.getTime())) return getTodayISO();
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Normalise les dates d'exécution réelles (Déb. Exéc et Fin Exéc) en fonction de la date d'aujourd'hui :
 * - Aucune date d'exécution ne peut être postérieure à todayISO.
 * - Dès que Déb. Exéc et Fin Exéc sont renseignées (<= todayISO), la tâche a le statut "Terminé".
 * - Si la tâche est "Bloqué", Déb. Exéc peut s'afficher mais Fin Exéc ne doit pas s'afficher.
 * - Si la tâche est "En cours", Déb. Exéc peut s'afficher mais Fin Exéc ne peut pas s'afficher.
 * - Si la tâche a pour statut "À faire", aucune date ne peut s'afficher dans Déb. Exéc et Fin Exéc.
 */
export function getNormalizedExecutionDates(
  task: Task,
  todayISO: string = getTodayISO()
): { actualStart: string; actualEnd: string } {
  const rawStart =
    task.actualStartDate &&
    task.actualStartDate.trim() !== '' &&
    task.actualStartDate.trim() <= todayISO
      ? task.actualStartDate.trim()
      : '';
  const rawEnd =
    task.actualEndDate &&
    task.actualEndDate.trim() !== '' &&
    task.actualEndDate.trim() <= todayISO
      ? task.actualEndDate.trim()
      : '';

  const fallbackStartedByToday =
    task.startDate &&
    task.startDate.trim() !== '' &&
    task.startDate.trim() <= todayISO &&
    task.status !== 'À faire'
      ? task.startDate.trim()
      : '';

  const effectiveStart = rawStart || fallbackStartedByToday;

  // Dès que Déb. Exéc et Fin Exéc sont toutes deux renseignées (<= todayISO), la tâche est Terminée
  if (effectiveStart && rawEnd) {
    return {
      actualStart: effectiveStart,
      actualEnd: rawEnd >= effectiveStart ? rawEnd : effectiveStart
    };
  }

  // Si la tâche est bloquée, Déb. Exéc peut s'afficher mais Fin Exéc ne doit pas s'afficher
  if (task.manualBlocked || task.status === 'Bloqué') {
    return {
      actualStart: effectiveStart,
      actualEnd: ''
    };
  }

  // Si la tâche est En cours (commencée mais pas encore terminée), Déb. Exéc s'affiche mais Fin Exéc ne s'affiche pas
  if (effectiveStart) {
    return {
      actualStart: effectiveStart,
      actualEnd: ''
    };
  }

  // Si la tâche a pour statut "À faire", aucune date ne s'affiche dans Déb. Exéc et Fin Exéc
  return {
    actualStart: '',
    actualEnd: ''
  };
}

/**
 * Statut automatique fonction de la date d'aujourd'hui et des dates d'exécution (Déb. Exéc / Fin Exéc).
 */
export function computeEffectiveStatus(task: Task, todayISO: string = getTodayISO()): Task['status'] {
  const { actualStart, actualEnd } = getNormalizedExecutionDates(task, todayISO);

  // Dès que Déb. Exéc et Fin Exéc d'une tâche sont renseignées (<= todayISO), la tâche marque le statut "Terminé"
  if (actualStart && actualEnd) {
    return 'Terminé';
  }

  if (task.manualBlocked || task.status === 'Bloqué') {
    return 'Bloqué';
  }

  if (actualStart) {
    return 'En cours';
  }

  if (task.startDate && todayISO >= task.startDate && task.status !== 'À faire') {
    return 'En cours';
  }

  return 'À faire';
}

export interface TaskComputedMetrics {
  plannedDurationDays: number;
  plannedDurationLabel: string;
  realDurationDays: number | null;
  realDurationLabel: string;
  ecartDebutDays: number;
  ecartDebutLabel: string;
  ecartFinDays: number;
  ecartFinLabel: string;
  effectiveStatus: Task['status'];
  effectiveActualStartDate: string;
  effectiveActualEndDate: string;
}

export function computeTaskMetrics(task: Task, todayISO: string = getTodayISO()): TaskComputedMetrics {
  const effectiveStatus = computeEffectiveStatus(task, todayISO);
  const { actualStart, actualEnd } = getNormalizedExecutionDates(task, todayISO);

  // Règles d'affichage strictes selon le statut effectif :
  // - "À faire" : ni Déb. Exéc ni Fin Exéc ne peuvent s'afficher
  // - "En cours" : Déb. Exéc peut s'afficher, Fin Exéc ne peut pas s'afficher
  // - "Bloqué" : Déb. Exéc peut s'afficher, Fin Exéc ne doit pas s'afficher
  // - "Terminé" : Déb. Exéc et Fin Exéc s'affichent (<= todayISO)
  const effectiveActualStartDate =
    effectiveStatus === 'À faire' ? '' : actualStart;
  const effectiveActualEndDate =
    effectiveStatus === 'Terminé' ? actualEnd : '';

  const todayMs = new Date(todayISO).getTime();
  const startPrevMs = new Date(task.startDate).getTime();
  const endPrevMs = new Date(task.endDate).getTime();

  const plannedDurationDays =
    task.type === 'jalon'
      ? 0
      : !isNaN(startPrevMs) && !isNaN(endPrevMs)
      ? Math.max(1, Math.round((endPrevMs - startPrevMs) / 86400000))
      : 1;

  const plannedDurationLabel = `${plannedDurationDays}j`;

  const actStartMs = effectiveActualStartDate
    ? new Date(effectiveActualStartDate).getTime()
    : NaN;
  const actEndMs = effectiveActualEndDate
    ? new Date(effectiveActualEndDate).getTime()
    : NaN;

  // Durée réelle d'exécution
  let realDurationDays: number | null = null;
  let realDurationLabel = '—';
  if (task.type === 'jalon') {
    if (!isNaN(actEndMs) || !isNaN(actStartMs)) {
      realDurationDays = 0;
      realDurationLabel = '0j';
    }
  } else if (!isNaN(actStartMs) && !isNaN(actEndMs)) {
    realDurationDays = Math.max(1, Math.round((actEndMs - actStartMs) / 86400000));
    realDurationLabel = `${realDurationDays}j`;
  } else if (!isNaN(actStartMs) && todayMs >= actStartMs) {
    realDurationDays = Math.max(1, Math.round((todayMs - actStartMs) / 86400000));
    realDurationLabel = `${realDurationDays}j`;
  }

  // Écart début : différence entre Déb. Exéc (ou aujourd'hui si non démarré et en retard) et Déb. Prév
  let ecartDebutDays = 0;
  if (!isNaN(startPrevMs)) {
    if (!isNaN(actStartMs)) {
      ecartDebutDays = Math.round((actStartMs - startPrevMs) / 86400000);
    } else if (todayMs > startPrevMs && effectiveStatus !== 'Terminé') {
      ecartDebutDays = Math.round((todayMs - startPrevMs) / 86400000);
    }
  }

  // Écart fin : différence entre Fin Exéc (ou aujourd'hui si non terminé et échéance dépassée) et Fin Prév
  let ecartFinDays = 0;
  if (!isNaN(endPrevMs)) {
    if (!isNaN(actEndMs)) {
      ecartFinDays = Math.round((actEndMs - endPrevMs) / 86400000);
    } else if (todayMs > endPrevMs && effectiveStatus !== 'Terminé') {
      ecartFinDays = Math.round((todayMs - endPrevMs) / 86400000);
    }
  }

  const formatEcart = (days: number): string => {
    if (days > 0) return `+${days}j (Retard)`;
    if (days < 0) return `${days}j (Avance)`;
    return '0j (À temps)';
  };

  return {
    plannedDurationDays,
    plannedDurationLabel,
    realDurationDays,
    realDurationLabel,
    ecartDebutDays,
    ecartDebutLabel: formatEcart(ecartDebutDays),
    ecartFinDays,
    ecartFinLabel: formatEcart(ecartFinDays),
    effectiveStatus,
    effectiveActualStartDate,
    effectiveActualEndDate
  };
}

/**
 * Recalcule automatiquement les dates prévues d'une tâche lors d'un changement de statut Kanban
 * en conservant sa durée et la logique des dépendances (cascade sur les tâches suivantes).
 */
export function recalculateProjectTasksOnKanbanMove(
  tasks: Task[],
  movedTaskId: string,
  newStatus: Task['status'],
  todayISO: string = getTodayISO()
): Task[] {
  const cloned: Task[] = tasks.map(t => ({ ...t }));
  const target = cloned.find(t => t.id === movedTaskId);
  if (!target) return cloned;

  const metrics = computeTaskMetrics(target, todayISO);
  const duration = target.type === 'jalon' ? 0 : Math.max(1, metrics.plannedDurationDays);

  target.status = newStatus;
  target.manualBlocked = newStatus === 'Bloqué';

  if (newStatus === 'En cours') {
    const execStart = target.actualStartDate || todayISO;
    target.actualStartDate = execStart;
    target.actualEndDate = '';
    // Recalculate planned dates around current execution start while preserving duration
    target.startDate = execStart;
    target.endDate = target.type === 'jalon' ? execStart : addDaysISO(execStart, duration);
  } else if (newStatus === 'Terminé') {
    const execEnd = target.actualEndDate || todayISO;
    const execStart = target.actualStartDate || (target.type === 'jalon' ? execEnd : addDaysISO(execEnd, -duration));
    target.actualStartDate = execStart;
    target.actualEndDate = execEnd;
    target.startDate = execStart;
    target.endDate = execEnd;
  } else if (newStatus === 'À faire') {
    target.actualStartDate = '';
    target.actualEndDate = '';
    // Shift planned start to tomorrow if it was in the past, preserving duration
    const baseStart = target.startDate > todayISO ? target.startDate : addDaysISO(todayISO, 1);
    target.startDate = baseStart;
    target.endDate = target.type === 'jalon' ? baseStart : addDaysISO(baseStart, duration);
  } else if (newStatus === 'Bloqué') {
    // Keep actualEndDate empty and shift planned end if already passed, preserving duration
    target.actualEndDate = '';
    if (target.endDate < todayISO) {
      target.startDate = todayISO;
      target.endDate = target.type === 'jalon' ? todayISO : addDaysISO(todayISO, duration);
    }
  }

  // Cascade logical dependencies to all successor tasks while preserving each successor's duration
  const visited = new Set<string>([target.id]);
  const queue: string[] = [target.id];

  while (queue.length > 0) {
    const predId = queue.shift()!;
    const predTask = cloned.find(t => t.id === predId);
    if (!predTask) continue;

    const successors = cloned.filter(t => t.antecedent === predId && !visited.has(t.id));
    for (const succ of successors) {
      visited.add(succ.id);
      const succMetrics = computeTaskMetrics(succ, todayISO);
      const succDur = succ.type === 'jalon' ? 0 : Math.max(1, succMetrics.plannedDurationDays);
      const nextStart = addDaysISO(predTask.endDate, succ.type === 'jalon' ? 0 : 1);
      succ.startDate = nextStart;
      succ.endDate = succ.type === 'jalon' ? nextStart : addDaysISO(nextStart, succDur);
      queue.push(succ.id);
    }
  }

  return cloned;
}

export interface ProjectPertResult {
  projectId: string;
  projectName: string;
  nodes: PertNode[];
  projectDuration: number;
  criticalPathNodes: PertNode[];
  criticalPathCodes: string[];
  blockedCriticalNodes: PertNode[];
  delayedCriticalNodes: PertNode[];
  slackNodes: PertNode[];
  interpretation: {
    criticalPathSummary: string;
    slackSummary: string;
    riskAndSteeringSummary: string;
  };
}

export function computePertForProject(project: Project, todayISO: string = getTodayISO()): ProjectPertResult {
  const rawTasks = Array.isArray(project.tasks) ? project.tasks : [];

  // Order tasks by standard phases so numbering matches Planification & Suivi des tâches
  const orderedTasks: { task: Task; code: string }[] = [];
  STANDARD_PHASES.forEach((phaseName, pIdx) => {
    const phaseTasks = rawTasks.filter(t => t.phase === phaseName);
    phaseTasks.forEach((tk, tIdx) => {
      const prefix = tk.type === 'jalon' ? 'J' : 'T';
      orderedTasks.push({
        task: tk,
        code: `${prefix}.${pIdx + 1}.${tIdx + 1}`
      });
    });
  });

  // Include any task whose phase is custom
  rawTasks
    .filter(t => !STANDARD_PHASES.includes(t.phase))
    .forEach((tk, idx) => {
      const prefix = tk.type === 'jalon' ? 'J' : 'T';
      orderedTasks.push({
        task: tk,
        code: `${prefix}.X.${idx + 1}`
      });
    });

  const codeById = new Map<string, string>();
  const taskById = new Map<string, Task>();
  orderedTasks.forEach(({ task, code }) => {
    codeById.set(task.id, code);
    taskById.set(task.id, task);
  });

  // Helper to get full chain of preceding task codes (Précéd.)
  const getPrecedingChain = (taskId: string): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>([taskId]);
    let curr = taskById.get(taskId);
    while (curr && curr.antecedent && curr.antecedent !== '—' && codeById.has(curr.antecedent)) {
      if (seen.has(curr.antecedent)) break; // prevent cycles
      seen.add(curr.antecedent);
      chain.unshift(codeById.get(curr.antecedent)!);
      curr = taskById.get(curr.antecedent);
    }
    return chain;
  };

  // Initialize PertNodes
  const nodes: PertNode[] = orderedTasks.map(({ task, code }) => {
    const metrics = computeTaskMetrics(task, todayISO);
    const hasValidAnt = Boolean(task.antecedent && task.antecedent !== '—' && codeById.has(task.antecedent));
    const antId = hasValidAnt ? task.antecedent! : '—';
    const antCode = hasValidAnt ? codeById.get(task.antecedent!)! : '—';
    const chain = getPrecedingChain(task.id);

    return {
      id: task.id,
      code,
      name: task.name,
      type: task.type,
      phase: task.phase,
      projectId: project.id,
      projectName: project.name,
      assignee: task.assignee || '—',
      budget: Number(task.budget) || 0,
      startDate: task.startDate,
      endDate: task.endDate,
      actualStartDate: task.actualStartDate,
      actualEndDate: task.actualEndDate,
      status: metrics.effectiveStatus,
      duration: metrics.plannedDurationDays,
      antecedentId: antId,
      antecedentCode: antCode,
      precedingChainCodes: chain.length > 0 ? chain.join(' → ') : '—',
      successorCodes: [],
      es: 0,
      ef: metrics.plannedDurationDays,
      ls: 0,
      lf: metrics.plannedDurationDays,
      totalFloat: 0,
      freeFloat: 0,
      isCritical: false,
      startDelayDays: metrics.ecartDebutDays,
      endDelayDays: metrics.ecartFinDays,
      level: chain.length
    };
  });

  const nodeMap = new Map<string, PertNode>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  // Populate successorCodes
  nodes.forEach(n => {
    if (n.antecedentId !== '—' && nodeMap.has(n.antecedentId)) {
      const pred = nodeMap.get(n.antecedentId)!;
      pred.successorCodes.push(n.code);
    }
  });

  // Forward Pass (ES, EF) sorted by level
  const sortedByLevel = [...nodes].sort((a, b) => a.level - b.level);
  sortedByLevel.forEach(n => {
    if (n.antecedentId !== '—' && nodeMap.has(n.antecedentId)) {
      const pred = nodeMap.get(n.antecedentId)!;
      n.es = pred.ef;
    } else {
      n.es = 0;
    }
    n.ef = n.es + n.duration;
  });

  const projectDuration = nodes.length > 0 ? Math.max(...nodes.map(n => n.ef), 1) : 0;

  // Backward Pass (LF, LS) in reverse level order
  const reverseByLevel = [...sortedByLevel].reverse();
  reverseByLevel.forEach(n => {
    const succs = nodes.filter(s => s.antecedentId === n.id);
    if (succs.length === 0) {
      n.lf = projectDuration;
    } else {
      n.lf = Math.min(...succs.map(s => s.ls));
    }
    n.ls = Math.max(0, n.lf - n.duration);
    n.totalFloat = Math.max(0, n.ls - n.es);
    n.freeFloat = succs.length > 0 ? Math.max(0, Math.min(...succs.map(s => s.es)) - n.ef) : n.totalFloat;
    n.isCritical = n.totalFloat === 0;
  });

  const criticalPathNodes = sortedByLevel.filter(n => n.isCritical);
  const criticalPathCodes = criticalPathNodes.map(n => n.code);
  const blockedCriticalNodes = criticalPathNodes.filter(n => n.status === 'Bloqué');
  const delayedCriticalNodes = criticalPathNodes.filter(n => n.endDelayDays > 0 || n.startDelayDays > 0);
  const slackNodes = nodes.filter(n => n.totalFloat > 0);

  const maxSlipDays = delayedCriticalNodes.length > 0
    ? Math.max(...delayedCriticalNodes.map(n => Math.max(n.endDelayDays, n.startDelayDays)))
    : 0;

  const criticalPathSummary =
    criticalPathNodes.length > 0
      ? `Le chemin critique du projet « ${project.name} » traverse ${criticalPathNodes.length} activité(s)/jalon(s) à marge nulle (${criticalPathCodes.join(' → ')}) pour une durée totale incompressible de ${projectDuration} jour(s). Tout retard sur l’une de ces tâches décale directement la date de fin du projet.`
      : `Aucune activité enregistrée pour calculer le chemin critique.`;

  const slackSummary =
    slackNodes.length > 0
      ? `${slackNodes.length} activité(s) disposent d’une marge totale positive (${slackNodes.map(s => `${s.code}: +${s.totalFloat}j`).join(', ')}), offrant une réserve de souplesse opérationnelle permettant de redéployer ponctuellement des ressources vers le chemin critique sans impacter la livraison finale.`
      : `Toutes les activités de ce projet sont sur le chemin critique (marge totale = 0j). La vigilance doit être maximale sur chaque étape.`;

  const riskAndSteeringSummary =
    blockedCriticalNodes.length > 0 || maxSlipDays > 0
      ? `ALERTE DE PILOTAGE PERT : ${blockedCriticalNodes.length} tâche(s) critique(s) bloquée(s) (${blockedCriticalNodes.map(b => b.code).join(', ') || 'aucune'}) et ${delayedCriticalNodes.length} tâche(s) critique(s) en retard entraînent une tension calendaire estimée à +${maxSlipDays} jour(s). Action recommandée : lever immédiatement les blocages et accélérer l’exécution des maillons critiques.`
      : `TRAJECTOIRE MAÎTRISÉE : Aucun blocage ni dépassement critique n’est constaté sur le chemin critique. Le calendrier prévisionnel de ${projectDuration} jour(s) est respecté.`;

  return {
    projectId: project.id,
    projectName: project.name,
    nodes,
    projectDuration,
    criticalPathNodes,
    criticalPathCodes,
    blockedCriticalNodes,
    delayedCriticalNodes,
    slackNodes,
    interpretation: {
      criticalPathSummary,
      slackSummary,
      riskAndSteeringSummary
    }
  };
}

export function computeDossierPertSummary(dossier?: Dossier, todayISO: string = getTodayISO()): ProjectPertResult[] {
  if (!dossier) return [];
  const results: ProjectPertResult[] = [];
  (dossier.axes || []).forEach(axe => {
    (axe.projects || []).forEach(proj => {
      results.push(computePertForProject(proj, todayISO));
    });
  });
  return results;
}
