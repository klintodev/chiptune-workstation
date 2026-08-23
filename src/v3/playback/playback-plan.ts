import type { JsonValue } from "../project";

export const MAX_PLAYBACK_EVENTS = 100_000 as const;

export interface PlaybackInstrument {
  readonly id: string;
  readonly kind: string;
  readonly parameters: Readonly<Record<string, JsonValue>>;
}

export interface PlaybackNoteEvent {
  readonly id: string;
  readonly trackId: string;
  readonly instrumentId: string;
  readonly patternId: string;
  readonly clipId: string;
  readonly noteId: string;
  readonly startTick: number;
  readonly durationTicks: number;
  readonly pitch: number;
  readonly velocity: number;
}

export interface PlaybackTrackPlan {
  readonly id: string;
  readonly name: string;
  readonly audible: boolean;
  readonly volume: number;
  readonly pan: number;
  readonly instrument: PlaybackInstrument;
  readonly events: readonly PlaybackNoteEvent[];
}

export interface PlaybackPlan {
  readonly projectId: string;
  readonly projectRevision: number;
  readonly bpm: number;
  readonly ppq: number;
  readonly loop: {
    readonly enabled: boolean;
    readonly startTick: number;
    readonly endTick: number;
  };
  readonly masterVolume: number;
  readonly durationTicks: number;
  readonly tracks: readonly PlaybackTrackPlan[];
}
