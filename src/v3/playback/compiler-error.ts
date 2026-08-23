export type ProjectCompilationErrorCode =
  | "CLIP_PATTERN_NOT_FOUND"
  | "CLIP_TRACK_NOT_FOUND"
  | "NOTE_OUTSIDE_PATTERN"
  | "NOTE_PATTERN_NOT_FOUND"
  | "ORDERED_ENTITY_NOT_FOUND"
  | "PLAYBACK_EVENT_LIMIT_EXCEEDED"
  | "TICK_RANGE_EXCEEDED"
  | "TRACK_INSTRUMENT_NOT_FOUND";

export class ProjectCompilationError extends Error {
  constructor(
    readonly code: ProjectCompilationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectCompilationError";
  }
}
