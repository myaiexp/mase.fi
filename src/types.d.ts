// Shared JSDoc type shapes: updates.json rows, normalized UI data, channels
//
// Type-only: nothing imports this at runtime. JS files pull a shape in with
// `/** @import { Entry, AppData } from './types.js' */`.

/** One raw row of updates.json `entries` as a writer script leaves it. */
export interface RawEntry {
  project?: string | null;
  category?: string;
  date?: string;
  text?: string;
  summary?: string;
  [key: string]: unknown;
}

/** One raw row of updates.json `projects` (written by mase-fi-projects). */
export interface RawProject {
  channel: string;
  slug?: unknown;
  name?: string;
  desc?: string;
  url?: unknown;
  [key: string]: unknown;
}

/** A normalized feed entry (normalizeEntry in data-normalize.js). */
export interface Entry {
  channel: string;
  category: string | undefined;
  date: string;
  nick: string;
  text: string;
  projectSlug: string | undefined;
  projectChannel: string | undefined;
}

/** A project link chip (projectLink in project-link.js). */
export interface ProjectLink {
  label: string;
  href: string;
}

/** A normalized project (normalizeProjects in data.js). */
export interface Project {
  name: string | undefined;
  channel: string;
  slug: string;
  description: string;
  links: ProjectLink[];
  heat: number;
  lastActivity: number;
}

/** Writer-side aggregates from updates.json `stats` (normalizeStats in data.js). */
export interface Stats {
  totalCommits?: number;
  totalEntries?: number;
  archivedLogs?: number;
  logFirst?: string;
  logLast?: string;
  commitsByProject?: Record<string, number>;
  archivedByProject?: Record<string, number>;
  archive?: boolean;
}

/** The whole normalized data object fetchData returns and loadArchive mutates. */
export interface AppData {
  meta: { server: string; bootTime: number };
  projects: Project[];
  entries: Entry[];
  demos: string[];
  stats: Stats;
  hasArchive: boolean;
  archiveLoaded: boolean;
  loadFailed: boolean;
  archiveFailed: boolean;
  /** Set only when the demos manifest lost the startup grace race. */
  pendingDemos?: Promise<string[]>;
}

/** One registry channel (buildRegistry in registry.js). */
export interface Channel {
  id: string;
  group: 'system' | 'projects';
  /** The address: hash, data-ch, the "/" token. */
  label: string;
  /** The visible heading. */
  name: string;
  topic: string;
  project?: Project;
}

declare global {
  interface Window {
    /** The toast service the base-components bundle publishes for consumers (toast.js). */
    BaseToast?: typeof import('./components/toast/toast.js').BaseToast;
  }
}
