import {
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  TICKS_PER_QUARTER,
  type Project,
  type ProjectFile,
} from "./project";
import { parseProject, parseProjectFile } from "./project-schema";

interface NewProjectIds {
  project: string;
  pattern: string;
  track: string;
  instrument: string;
}

export interface CreateProjectOptions {
  name?: string;
  timestamp?: string;
  ids?: Partial<NewProjectIds>;
}

export function createProject(options: CreateProjectOptions = {}): Project {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const ids: NewProjectIds = {
    project: options.ids?.project ?? createId("project"),
    pattern: options.ids?.pattern ?? createId("pattern"),
    track: options.ids?.track ?? createId("track"),
    instrument: options.ids?.instrument ?? createId("instrument"),
  };

  return parseProject({
    id: ids.project,
    name: options.name ?? "Untitled chiptune",
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    transport: {
      bpm: 120,
      ppq: TICKS_PER_QUARTER,
      loop: {
        enabled: false,
        startTick: 0,
        endTick: TICKS_PER_QUARTER * 4,
      },
    },
    instruments: {
      byId: {
        [ids.instrument]: {
          id: ids.instrument,
          name: "Pulse",
          kind: "pulse",
          parameters: {
            pulseWidth: 0.5,
            octave: 0,
            attackSeconds: 0.005,
            decaySeconds: 0.08,
            sustainLevel: 0.7,
            releaseSeconds: 0.08,
          },
        },
      },
      order: [ids.instrument],
    },
    patterns: {
      byId: {
        [ids.pattern]: {
          id: ids.pattern,
          name: "Pattern 1",
          lengthTicks: TICKS_PER_QUARTER * 4,
        },
      },
      order: [ids.pattern],
    },
    notes: { byId: {}, order: [] },
    tracks: {
      byId: {
        [ids.track]: {
          id: ids.track,
          name: "Pulse 1",
          instrumentId: ids.instrument,
          volume: 1,
          pan: 0,
          muted: false,
          solo: false,
        },
      },
      order: [ids.track],
    },
    clips: { byId: {}, order: [] },
    master: {
      volume: 0.8,
    },
  });
}

export function createProjectFile(project: Project): ProjectFile {
  return parseProjectFile({
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    project,
  });
}

function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID();
  if (!uuid) {
    throw new Error("Secure random UUID generation is unavailable. Supply explicit project IDs.");
  }
  return `${prefix}-${uuid}`;
}
