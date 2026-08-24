-- ============================================================
-- TASK MANAGEMENT — SUPABASE MIGRATION
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard
-- (SQL Editor → New query → paste → Run)
--
-- Creates the three Task Manager tables (tasks, task_groups,
-- task_templates), enables RLS with public access policies to
-- match the existing roster tables, and adds lookup indexes.
-- Safe to run multiple times (idempotent).
-- ============================================================

-- 1. Tasks table (mirrors the app's Task shape 1:1)
CREATE TABLE IF NOT EXISTS public.tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'todo',            -- todo | in_progress | blocked | done
    priority TEXT NOT NULL DEFAULT 'medium',        -- low | medium | high | urgent
    "dueDate" TEXT,                                 -- YYYY-MM-DD
    tags JSONB DEFAULT '[]'::jsonb,
    "user" TEXT DEFAULT 'User',
    "createdAt" TEXT NOT NULL,                      -- ISO string
    "updatedAt" TEXT NOT NULL,                      -- ISO string
    "completedAt" TEXT,                             -- ISO string | null
    "groupId" TEXT,                                 -- FK-like ref to task_groups.id (no hard FK: groups are optional containers)
    sequence INTEGER,
    "dependsOn" JSONB DEFAULT '[]'::jsonb,          -- array of task ids
    category TEXT NOT NULL DEFAULT 'work'           -- work | personal | projects
);

CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON public.tasks("groupId");
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks("dueDate");

-- 2. Task groups (runtime container objects)
CREATE TABLE IF NOT EXISTS public.task_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    "createdAt" TEXT NOT NULL
);

-- 3. Task templates (definition stage; variables/children are structured JSON)
CREATE TABLE IF NOT EXISTS public.task_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    "titleTemplate" TEXT NOT NULL DEFAULT '',
    "notesTemplate" TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    tags JSONB DEFAULT '[]'::jsonb,
    category TEXT NOT NULL DEFAULT 'work',
    variables JSONB DEFAULT '[]'::jsonb,
    children JSONB,                                 -- null => single-task template
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
);

-- 4. Row Level Security (same model as the roster tables)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

-- 5. Public read/write policies (drop-first keeps re-runs clean)
DROP POLICY IF EXISTS "Allow public select" ON public.tasks;
DROP POLICY IF EXISTS "Allow public insert" ON public.tasks;
DROP POLICY IF EXISTS "Allow public update" ON public.tasks;
DROP POLICY IF EXISTS "Allow public delete" ON public.tasks;
CREATE POLICY "Allow public select" ON public.tasks FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.tasks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.tasks FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.task_groups;
DROP POLICY IF EXISTS "Allow public insert" ON public.task_groups;
DROP POLICY IF EXISTS "Allow public update" ON public.task_groups;
DROP POLICY IF EXISTS "Allow public delete" ON public.task_groups;
CREATE POLICY "Allow public select" ON public.task_groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.task_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.task_groups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.task_groups FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public select" ON public.task_templates;
DROP POLICY IF EXISTS "Allow public insert" ON public.task_templates;
DROP POLICY IF EXISTS "Allow public update" ON public.task_templates;
DROP POLICY IF EXISTS "Allow public delete" ON public.task_templates;
CREATE POLICY "Allow public select" ON public.task_templates FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.task_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.task_templates FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.task_templates FOR DELETE USING (true);

-- Done. The server auto-seeds these tables from the local JSON store
-- (data/tasks.json, data/task-groups.json, data/task-templates.json)
-- the first time it reads them, so no manual data migration is needed.
