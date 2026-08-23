import { useMemo, type CSSProperties } from "react";

import {
  findEntityById,
  findFirstEntityInOrder,
  listEntitiesInOrder,
  type Clip,
} from "../../project";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { editorViewChanged, workspaceSelectionChanged } from "../../app/workspace-slice";
import { PanelHeading } from "../workspace/PanelHeading";
import styles from "./EditorPanel.module.css";

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const ACCIDENTAL_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BEATS_PER_BAR = 4;
const SIXTEENTH_NOTES_PER_BAR = 16;
const DEFAULT_LOWEST_PITCH = 60;
const DEFAULT_HIGHEST_PITCH = 72;

interface PianoRow {
  accidental: boolean;
  label: string;
  pitch: number;
}

interface RulerBar {
  durationTicks: number;
  label: number;
}

type TimelineStyle = CSSProperties & {
  "--timeline-major-step": string;
  "--timeline-minor-step": string;
};

type PianoRollStyle = CSSProperties & {
  "--piano-row-count": string;
  "--piano-row-step": string;
};

function formatCount(value: number, singular: string): string {
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}

function pitchLabel(pitch: number): string {
  const pitchClass = pitch % NOTE_NAMES.length;
  const noteName = NOTE_NAMES[pitchClass] ?? "?";
  const octave = Math.floor(pitch / NOTE_NAMES.length) - 1;
  return `${noteName}${octave}`;
}

function createPianoRows(pitches: readonly number[]): PianoRow[] {
  const lowestNote = pitches.length > 0 ? Math.min(...pitches) : DEFAULT_LOWEST_PITCH;
  const highestNote = pitches.length > 0 ? Math.max(...pitches) : DEFAULT_HIGHEST_PITCH;
  const lowestPitch = Math.min(
    DEFAULT_LOWEST_PITCH,
    Math.max(0, Math.floor(lowestNote / NOTE_NAMES.length) * NOTE_NAMES.length),
  );
  const highestPitch = Math.max(
    DEFAULT_HIGHEST_PITCH,
    Math.min(127, Math.ceil(highestNote / NOTE_NAMES.length) * NOTE_NAMES.length),
  );

  return Array.from({ length: highestPitch - lowestPitch + 1 }, (_, index) => {
    const pitch = highestPitch - index;
    return {
      accidental: ACCIDENTAL_PITCH_CLASSES.has(pitch % NOTE_NAMES.length),
      label: pitchLabel(pitch),
      pitch,
    };
  });
}

function createRulerBars(lengthTicks: number, ticksPerBar: number): RulerBar[] {
  if (lengthTicks <= 0) return [];

  const barCount = Math.ceil(lengthTicks / ticksPerBar);
  return Array.from({ length: barCount }, (_, index) => ({
    durationTicks: Math.min(ticksPerBar, lengthTicks - index * ticksPerBar),
    label: index + 1,
  }));
}

function createRulerStyle(bars: readonly RulerBar[]): CSSProperties {
  return {
    gridTemplateColumns:
      bars.length > 0 ? bars.map((bar) => `${bar.durationTicks}fr`).join(" ") : "1fr",
  };
}

function createTimelineStyle(
  lengthTicks: number,
  ticksPerBar: number,
  subdivisionsPerBar: number,
): TimelineStyle {
  const safeLength = Math.max(1, lengthTicks);
  return {
    "--timeline-major-step": `${Math.min(100, (ticksPerBar / safeLength) * 100)}%`,
    "--timeline-minor-step": `${Math.min(100, (ticksPerBar / subdivisionsPerBar / safeLength) * 100)}%`,
  };
}

function ViewTabs() {
  const dispatch = useAppDispatch();
  const editorView = useAppSelector((state) => state.workspace.editorView);

  return (
    <div className={styles.viewTabs}>
      <button
        aria-pressed={editorView === "pattern"}
        onClick={() => dispatch(editorViewChanged("pattern"))}
        type="button"
      >
        Pattern
      </button>
      <button
        aria-pressed={editorView === "arrangement"}
        onClick={() => dispatch(editorViewChanged("arrangement"))}
        type="button"
      >
        Arrange
      </button>
    </div>
  );
}

function PatternSurface() {
  const project = useAppSelector((state) => state.project.document);
  const selection = useAppSelector((state) => state.workspace.selection);
  const notes = useMemo(() => listEntitiesInOrder(project.notes), [project.notes]);
  const selectedPattern =
    (selection?.kind === "pattern" ? findEntityById(project.patterns, selection.id) : undefined) ??
    findFirstEntityInOrder(project.patterns);
  const selectedNotes = useMemo(
    () => (selectedPattern ? notes.filter((note) => note.patternId === selectedPattern.id) : []),
    [notes, selectedPattern],
  );

  if (!selectedPattern) {
    return <div className={styles.blankState}>Create a pattern to open the editor.</div>;
  }

  const ticksPerBar = project.transport.ppq * BEATS_PER_BAR;
  const rulerBars = createRulerBars(selectedPattern.lengthTicks, ticksPerBar);
  const rulerStyle = createRulerStyle(rulerBars);
  const timelineStyle = createTimelineStyle(
    selectedPattern.lengthTicks,
    ticksPerBar,
    SIXTEENTH_NOTES_PER_BAR,
  );
  const pianoRows = createPianoRows(selectedNotes.map((note) => note.pitch));
  const highestPitch = pianoRows[0]?.pitch ?? DEFAULT_HIGHEST_PITCH;
  const pianoRollStyle: PianoRollStyle = {
    "--piano-row-count": String(pianoRows.length),
    "--piano-row-step": `${100 / pianoRows.length}%`,
  };

  return (
    <div className={styles.surface} style={timelineStyle}>
      <div className={styles.contextBar}>
        <div>
          <span>Editing pattern</span>
          <strong>{selectedPattern.name}</strong>
        </div>
        <div className={styles.contextMeta}>
          <span>{formatCount(selectedNotes.length, "note")}</span>
          <span>{formatCount(rulerBars.length, "bar")}</span>
        </div>
      </div>

      <div className={styles.ruler}>
        <div className={styles.rulerCorner}>Note</div>
        <div className={styles.rulerTicks} style={rulerStyle}>
          {rulerBars.map((bar) => (
            <span key={bar.label}>{bar.label}</span>
          ))}
        </div>
      </div>

      <div className={styles.pianoRoll} style={pianoRollStyle}>
        <div className={styles.keys}>
          {pianoRows.map((row) => (
            <span data-accidental={row.accidental || undefined} key={row.pitch}>
              {row.label}
            </span>
          ))}
        </div>
        <div className={styles.noteGrid}>
          {selectedNotes.map((note) => {
            const left = (note.startTick / selectedPattern.lengthTicks) * 100;
            const width = Math.max((note.durationTicks / selectedPattern.lengthTicks) * 100, 0.9);
            const rowIndex = highestPitch - note.pitch;
            const noteStyle: CSSProperties = {
              height: `${100 / pianoRows.length}%`,
              left: `${left}%`,
              top: `${(rowIndex / pianoRows.length) * 100}%`,
              width: `${width}%`,
            };

            return (
              <span
                className={styles.note}
                key={note.id}
                style={noteStyle}
                title={`${pitchLabel(note.pitch)} · MIDI ${note.pitch}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ArrangementSurface() {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) => state.project.document);
  const tracks = useMemo(() => listEntitiesInOrder(project.tracks), [project.tracks]);
  const clips = useMemo(() => listEntitiesInOrder(project.clips), [project.clips]);
  const clipsByTrack = useMemo(() => {
    const result = new Map<string, Clip[]>();

    for (const clip of clips) {
      const trackClips = result.get(clip.trackId);
      if (trackClips) {
        trackClips.push(clip);
      } else {
        result.set(clip.trackId, [clip]);
      }
    }

    return result;
  }, [clips]);
  const arrangementEndTick = useMemo(
    () =>
      clips.reduce((endTick, clip) => {
        const patternLength = findEntityById(project.patterns, clip.patternId)?.lengthTicks ?? 0;
        return Math.max(endTick, clip.startTick + Math.max(1, patternLength));
      }, 0),
    [clips, project.patterns],
  );
  const ticksPerBar = project.transport.ppq * BEATS_PER_BAR;
  const arrangementBarCount = Math.ceil(arrangementEndTick / ticksPerBar);
  const arrangementLength = Math.max(ticksPerBar, arrangementBarCount * ticksPerBar);
  const rulerBars = arrangementBarCount > 0 ? createRulerBars(arrangementLength, ticksPerBar) : [];
  const rulerStyle = createRulerStyle(rulerBars);
  const timelineStyle = createTimelineStyle(arrangementLength, ticksPerBar, BEATS_PER_BAR);

  return (
    <div
      className={styles.surface}
      data-empty={clips.length === 0 || undefined}
      style={timelineStyle}
    >
      <div className={styles.contextBar}>
        <div>
          <span>Song timeline</span>
          <strong>Arrangement</strong>
        </div>
        <div className={styles.contextMeta}>
          <span>{formatCount(tracks.length, "track")}</span>
          <span>{formatCount(clips.length, "clip")}</span>
          <span>{formatCount(rulerBars.length, "bar")}</span>
        </div>
      </div>

      <div className={styles.ruler}>
        <div className={styles.rulerCorner}>Track</div>
        <div className={styles.rulerTicks} style={rulerStyle}>
          {rulerBars.map((bar) => (
            <span key={bar.label}>{bar.label}</span>
          ))}
        </div>
      </div>

      <div className={styles.trackList}>
        {tracks.map((track) => (
          <div className={styles.trackRow} key={track.id}>
            <button
              className={styles.trackName}
              onClick={() => dispatch(workspaceSelectionChanged({ id: track.id, kind: "track" }))}
              type="button"
            >
              <span className={styles.trackColour} aria-hidden="true" />
              <span>{track.name}</span>
            </button>
            <div className={styles.clipLane}>
              {(clipsByTrack.get(track.id) ?? []).map((clip) => {
                const pattern = findEntityById(project.patterns, clip.patternId);
                const clipStyle: CSSProperties = {
                  left: `${(clip.startTick / arrangementLength) * 100}%`,
                  width: `${Math.max(((pattern?.lengthTicks ?? 0) / arrangementLength) * 100, 3)}%`,
                };

                return (
                  <span className={styles.clip} key={clip.id} style={clipStyle}>
                    {pattern?.name ?? "Pattern unavailable"}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditorPanel() {
  const editorView = useAppSelector((state) => state.workspace.editorView);

  return (
    <section className={styles.panel}>
      <PanelHeading kicker="Workspace" title="Editor" trailing={<ViewTabs />} />
      {editorView === "pattern" ? <PatternSurface /> : <ArrangementSurface />}
    </section>
  );
}
