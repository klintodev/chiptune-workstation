import { useMemo, type CSSProperties } from "react";

import { firstEntity, orderedEntities } from "../../app/entity-collection";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { editorViewChanged, workspaceSelectionChanged } from "../../app/workspace-slice";
import type { Clip } from "../../project";
import { PanelHeading } from "../workspace/PanelHeading";
import styles from "./EditorPanel.module.css";

const PIANO_ROWS = ["C6", "B5", "A5", "G5", "F5", "E5", "D5", "C5"];
const RULER_BARS = Array.from({ length: 8 }, (_, index) => index + 1);

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
  const notes = useMemo(() => orderedEntities(project.notes), [project.notes]);
  const selectedPattern =
    (selection?.kind === "pattern" ? project.patterns.byId[selection.id] : undefined) ??
    firstEntity(project.patterns);
  const selectedNotes = useMemo(
    () => (selectedPattern ? notes.filter((note) => note.patternId === selectedPattern.id) : []),
    [notes, selectedPattern],
  );

  if (!selectedPattern) {
    return <div className={styles.blankState}>Create a pattern to open the editor.</div>;
  }

  return (
    <div className={styles.surface}>
      <div className={styles.contextBar}>
        <div>
          <span>Editing pattern</span>
          <strong>{selectedPattern.name}</strong>
        </div>
        <div className={styles.contextMeta}>
          <span>{selectedNotes.length === 1 ? "1 note" : `${selectedNotes.length} notes`}</span>
        </div>
      </div>

      <div className={styles.ruler}>
        <div className={styles.rulerCorner}>Note</div>
        <div className={styles.rulerTicks}>
          {RULER_BARS.map((bar) => (
            <span key={bar}>{bar}</span>
          ))}
        </div>
      </div>

      <div className={styles.pianoRoll}>
        <div className={styles.keys}>
          {PIANO_ROWS.map((pitch) => (
            <span key={pitch}>{pitch}</span>
          ))}
        </div>
        <div className={styles.noteGrid}>
          {selectedNotes.map((note) => {
            const left = (note.startTick / selectedPattern.lengthTicks) * 100;
            const width = Math.max((note.durationTicks / selectedPattern.lengthTicks) * 100, 0.9);
            const top = Math.max(2, Math.min(92, ((84 - note.pitch) / 36) * 100));
            const noteStyle: CSSProperties = {
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
            };

            return (
              <span
                className={styles.note}
                key={note.id}
                style={noteStyle}
                title={`MIDI ${note.pitch}`}
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
  const arrangementLength = project.transport.ppq * 4 * 16;
  const tracks = useMemo(() => orderedEntities(project.tracks), [project.tracks]);
  const clipsByTrack = useMemo(() => {
    const result = new Map<string, Clip[]>();

    for (const clip of orderedEntities(project.clips)) {
      const trackClips = result.get(clip.trackId);
      if (trackClips) {
        trackClips.push(clip);
      } else {
        result.set(clip.trackId, [clip]);
      }
    }

    return result;
  }, [project.clips]);

  return (
    <div className={styles.surface}>
      <div className={styles.contextBar}>
        <div>
          <span>Song timeline</span>
          <strong>Arrangement</strong>
        </div>
        <div className={styles.contextMeta}>
          <span>{tracks.length === 1 ? "1 track" : `${tracks.length} tracks`}</span>
        </div>
      </div>

      <div className={styles.ruler}>
        <div className={styles.rulerCorner}>Track</div>
        <div className={styles.rulerTicks}>
          {RULER_BARS.map((bar) => (
            <span key={bar}>{bar}</span>
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
                const pattern = project.patterns.byId[clip.patternId];
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
