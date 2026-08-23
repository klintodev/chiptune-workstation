import { firstEntity, orderedEntities } from "../../app/entity-collection";
import { useAppSelector } from "../../app/hooks";
import { PanelHeading } from "../workspace/PanelHeading";
import styles from "./InspectorPanel.module.css";

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.valueRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function InspectorPanel() {
  const project = useAppSelector((state) => state.project.document);
  const selection = useAppSelector((state) => state.workspace.selection);

  const defaultTrack = firstEntity(project.tracks);
  const selectedTrack =
    selection?.kind === "track"
      ? project.tracks.byId[selection.id]
      : selection === null
        ? defaultTrack
        : undefined;
  const selectedPattern =
    selection?.kind === "pattern" ? project.patterns.byId[selection.id] : undefined;
  const selectedInstrument =
    selection?.kind === "instrument"
      ? project.instruments.byId[selection.id]
      : selectedTrack
        ? project.instruments.byId[selectedTrack.instrumentId]
        : undefined;
  const selectedNoteCount = selectedPattern
    ? orderedEntities(project.notes).filter((note) => note.patternId === selectedPattern.id).length
    : 0;
  const selectedClipCount = selectedTrack
    ? orderedEntities(project.clips).filter((clip) => clip.trackId === selectedTrack.id).length
    : 0;
  const waveform = selectedInstrument?.parameters.waveform;

  const selectionTitle =
    selectedPattern?.name ??
    (selection?.kind === "instrument" ? selectedInstrument?.name : undefined) ??
    selectedTrack?.name ??
    "Nothing selected";
  const selectionKind = selectedPattern
    ? "Pattern"
    : selection?.kind === "instrument" && selectedInstrument
      ? "Instrument"
      : selectedTrack
        ? "Track"
        : "Selection";

  return (
    <section className={styles.panel}>
      <PanelHeading kicker="Properties" title="Inspector" />

      <div className={styles.scrollArea}>
        <section className={styles.selectionCard}>
          <span className={styles.selectionKind}>{selectionKind}</span>
          <h3>{selectionTitle}</h3>
          <p>
            {selectedPattern
              ? "Pattern data"
              : selectedInstrument
                ? "Klinto Chip"
                : "Project channel"}
          </p>
        </section>

        {selectedPattern ? (
          <section className={styles.section}>
            <h4>Pattern</h4>
            <ValueRow label="Length" value={`${selectedPattern.lengthTicks} ticks`} />
            <ValueRow label="Notes" value={String(selectedNoteCount)} />
            <ValueRow label="PPQ" value={String(project.transport.ppq)} />
          </section>
        ) : null}

        {selectedInstrument ? (
          <section className={styles.section}>
            <h4>Instrument</h4>
            <ValueRow label="Type" value={selectedInstrument.kind} />
            <ValueRow
              label="Wave"
              value={typeof waveform === "string" ? waveform : "Engine-defined"}
            />
            <ValueRow
              label="Parameters"
              value={String(Object.keys(selectedInstrument.parameters).length)}
            />
            <div className={styles.waveform} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </section>
        ) : null}

        {selectedTrack ? (
          <section className={styles.section}>
            <h4>Channel</h4>
            <ValueRow label="Volume" value={`${Math.round(selectedTrack.volume * 100)}%`} />
            <ValueRow
              label="Pan"
              value={selectedTrack.pan === 0 ? "Centre" : selectedTrack.pan.toFixed(2)}
            />
            <ValueRow label="Clips" value={String(selectedClipCount)} />
            <div className={styles.meter} aria-label="Channel level, inactive">
              <span />
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <h4>Project</h4>
          <ValueRow label="Tempo" value={`${project.transport.bpm} BPM`} />
          <ValueRow label="Tracks" value={String(project.tracks.order.length)} />
          <ValueRow label="Revision" value={String(project.revision)} />
        </section>
      </div>

      <footer className={styles.footer}>
        <span>Changes become project commands</span>
      </footer>
    </section>
  );
}
