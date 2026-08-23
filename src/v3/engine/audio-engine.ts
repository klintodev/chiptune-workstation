import type { PlaybackPlan } from "../playback";

export type AudioEnginePhase = "idle" | "ready" | "playing" | "paused" | "error" | "disposed";

export type AudioRuntimeState = "unavailable" | "suspended" | "running" | "closed";

export interface AudioEngineSnapshot {
  readonly phase: AudioEnginePhase;
  readonly runtimeState: AudioRuntimeState;
  readonly projectId: string | null;
  readonly projectRevision: number | null;
  readonly currentTick: number;
  readonly activeVoiceCount: number;
}

export interface AudioEngineFailure {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export type AudioEngineEvent =
  | {
      readonly type: "state-changed";
      readonly snapshot: AudioEngineSnapshot;
    }
  | {
      readonly type: "playback-ended";
      readonly projectId: string;
      readonly projectRevision: number;
      readonly tick: number;
    }
  | {
      readonly type: "error";
      readonly failure: AudioEngineFailure;
      readonly snapshot: AudioEngineSnapshot;
    };

export interface PlayOptions {
  readonly fromTick?: number;
}

export type AudioEngineListener = (event: AudioEngineEvent) => void;

/**
 * Stateful runtime boundary implemented by the first-party audio package.
 * Consumers receive data-only plans and snapshots; no Web Audio objects cross it.
 */
export interface AudioEngine {
  load(plan: PlaybackPlan): Promise<void>;
  play(options?: PlayOptions): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(tick: number): Promise<void>;
  getSnapshot(): AudioEngineSnapshot;
  subscribe(listener: AudioEngineListener): () => void;
  dispose(): Promise<void>;
}
