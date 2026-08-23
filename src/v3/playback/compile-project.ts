import { requireEntityById } from "../project/entities";
import type {
  OrderedEntityCollection,
  InstrumentDefinition,
  JsonValue,
  Project,
} from "../project/project";

import { MAX_PLAYBACK_EVENTS } from "./playback-plan";
import { ProjectCompilationError } from "./compiler-error";
import type {
  PlaybackInstrument,
  PlaybackNoteEvent,
  PlaybackPlan,
  PlaybackTrackPlan,
} from "./playback-plan";

export function compileProject(project: Project): PlaybackPlan {
  const tracksInOrder = requireEntitiesInOrder(project.tracks, "track");
  const notesInOrder = requireEntitiesInOrder(project.notes, "note");
  const clipsInOrder = requireEntitiesInOrder(project.clips, "clip");
  const notesByPattern = groupBy(notesInOrder, (note) => note.patternId);
  const clipsByTrack = groupBy(clipsInOrder, (clip) => clip.trackId);
  const hasSoloTrack = tracksInOrder.some((track) => track.solo && !track.muted);
  let durationTicks = 0;
  let expandedEventCount = 0;

  for (const note of notesInOrder) {
    const pattern = requireEntityById(
      project.patterns,
      note.patternId,
      () =>
        new ProjectCompilationError(
          "NOTE_PATTERN_NOT_FOUND",
          `Note ${note.id} references unknown pattern ${note.patternId}.`,
        ),
    );
    if (note.startTick > pattern.lengthTicks - note.durationTicks) {
      throw new ProjectCompilationError(
        "NOTE_OUTSIDE_PATTERN",
        `Note ${note.id} extends beyond pattern ${pattern.id}.`,
      );
    }
  }

  for (const clip of clipsInOrder) {
    requireEntityById(
      project.tracks,
      clip.trackId,
      () =>
        new ProjectCompilationError(
          "CLIP_TRACK_NOT_FOUND",
          `Clip ${clip.id} references unknown track ${clip.trackId}.`,
        ),
    );
    const pattern = requireEntityById(
      project.patterns,
      clip.patternId,
      () =>
        new ProjectCompilationError(
          "CLIP_PATTERN_NOT_FOUND",
          `Clip ${clip.id} references unknown pattern ${clip.patternId}.`,
        ),
    );
    expandedEventCount += notesByPattern.get(pattern.id)?.length ?? 0;
    if (expandedEventCount > MAX_PLAYBACK_EVENTS) {
      throw new ProjectCompilationError(
        "PLAYBACK_EVENT_LIMIT_EXCEEDED",
        `Project expands beyond the ${MAX_PLAYBACK_EVENTS} playback-event limit.`,
      );
    }
    durationTicks = Math.max(
      durationTicks,
      addTicks(clip.startTick, pattern.lengthTicks, `Clip ${clip.id} endTick`),
    );
  }

  const tracks: PlaybackTrackPlan[] = tracksInOrder.map((track) => {
    const instrument = requireEntityById(
      project.instruments,
      track.instrumentId,
      () =>
        new ProjectCompilationError(
          "TRACK_INSTRUMENT_NOT_FOUND",
          `Track ${track.id} references unknown instrument ${track.instrumentId}.`,
        ),
    );

    const events: PlaybackNoteEvent[] = [];
    for (const clip of clipsByTrack.get(track.id) ?? []) {
      const pattern = requireEntityById(
        project.patterns,
        clip.patternId,
        () =>
          new ProjectCompilationError(
            "CLIP_PATTERN_NOT_FOUND",
            `Clip ${clip.id} references unknown pattern ${clip.patternId}.`,
          ),
      );
      for (const note of notesByPattern.get(pattern.id) ?? []) {
        events.push({
          id: `${track.id}:${clip.id}:${note.id}`,
          trackId: track.id,
          instrumentId: instrument.id,
          patternId: pattern.id,
          clipId: clip.id,
          noteId: note.id,
          startTick: addTicks(
            clip.startTick,
            note.startTick,
            `Event ${clip.id}:${note.id} startTick`,
          ),
          durationTicks: note.durationTicks,
          pitch: note.pitch,
          velocity: note.velocity,
        });
      }
    }

    events.sort(comparePlaybackEvents);

    return {
      id: track.id,
      name: track.name,
      audible: !track.muted && (!hasSoloTrack || track.solo),
      volume: track.volume,
      pan: track.pan,
      instrument: compileInstrument(instrument),
      events,
    };
  });

  return {
    projectId: project.id,
    projectRevision: project.revision,
    bpm: project.transport.bpm,
    ppq: project.transport.ppq,
    loop: { ...project.transport.loop },
    masterVolume: project.master.volume,
    durationTicks,
    tracks,
  };
}

function compileInstrument(instrument: InstrumentDefinition): PlaybackInstrument {
  return {
    id: instrument.id,
    kind: instrument.kind,
    parameters: cloneJsonObject(instrument.parameters),
  };
}

function requireEntitiesInOrder<T extends { id: string }>(
  entities: OrderedEntityCollection<T>,
  entityKind: string,
): T[] {
  return entities.order.map((entityId) =>
    requireEntityById(
      entities,
      entityId,
      () =>
        new ProjectCompilationError(
          "ORDERED_ENTITY_NOT_FOUND",
          `Ordered ${entityKind} ${entityId} is missing.`,
        ),
    ),
  );
}

function addTicks(left: number, right: number, label: string): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    left < 0 ||
    right < 0 ||
    left > Number.MAX_SAFE_INTEGER - right
  ) {
    throw new ProjectCompilationError(
      "TICK_RANGE_EXCEEDED",
      `${label} exceeds the safe integer range.`,
    );
  }
  return left + right;
}

function groupBy<T>(entries: T[], getKey: (entry: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = getKey(entry);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return groups;
}

function cloneJsonObject(value: { [key: string]: JsonValue }): { [key: string]: JsonValue } {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)]),
  );
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value !== null && typeof value === "object") return cloneJsonObject(value);
  return value;
}

function comparePlaybackEvents(left: PlaybackNoteEvent, right: PlaybackNoteEvent): number {
  const musicalOrder = left.startTick - right.startTick || left.pitch - right.pitch;
  if (musicalOrder !== 0 || left.id === right.id) return musicalOrder;
  return left.id < right.id ? -1 : 1;
}
