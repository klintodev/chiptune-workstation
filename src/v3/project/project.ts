export const PROJECT_FORMAT = "chiptune-workstation-v3" as const;
export const PROJECT_FORMAT_VERSION = 1 as const;
export const TICKS_PER_QUARTER = 96 as const;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface EntityCollection<T extends { id: string }> {
  byId: Record<string, T>;
  order: string[];
}

export interface Note {
  id: string;
  patternId: string;
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

export interface Pattern {
  id: string;
  name: string;
  lengthTicks: number;
}

export interface Clip {
  id: string;
  trackId: string;
  patternId: string;
  startTick: number;
}

export interface InstrumentDefinition {
  id: string;
  name: string;
  kind: string;
  parameters: { [key: string]: JsonValue };
}

export interface Track {
  id: string;
  name: string;
  instrumentId: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export interface TransportSettings {
  bpm: number;
  ppq: typeof TICKS_PER_QUARTER;
  loop: {
    enabled: boolean;
    startTick: number;
    endTick: number;
  };
}

export interface Project {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  transport: TransportSettings;
  instruments: EntityCollection<InstrumentDefinition>;
  patterns: EntityCollection<Pattern>;
  notes: EntityCollection<Note>;
  tracks: EntityCollection<Track>;
  clips: EntityCollection<Clip>;
  master: {
    volume: number;
  };
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  formatVersion: typeof PROJECT_FORMAT_VERSION;
  project: Project;
}
