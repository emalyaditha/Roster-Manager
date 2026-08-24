import { Task } from '../types/tasks';

// Client mirrors of server dependency helpers (server stays authoritative).

/** Dependencies that are still unfinished (missing ids count as met). */
export function getUnmetDependencies(task: Task, all: Task[]): Task[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  return (task.dependsOn ?? [])
    .map((id) => byId.get(id))
    .filter((t): t is Task => Boolean(t) && t!.status !== 'done');
}

/** True if making taskId depend on nextDependsOn would close a cycle. */
export function wouldCreateCycle(all: Task[], taskId: string, nextDependsOn: string[]): boolean {
  const edges = new Map<string, string[]>(all.map((t) => [t.id, t.dependsOn ?? []]));
  edges.set(taskId, nextDependsOn);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of edges.get(id) ?? []) {
      if (dfs(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return dfs(taskId);
}
