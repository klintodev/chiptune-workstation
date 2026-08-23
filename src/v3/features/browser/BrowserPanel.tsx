import { useMemo, useState } from "react";

import { orderedEntities } from "../../app/entity-collection";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { browserViewChanged, workspaceSelectionChanged } from "../../app/workspace-slice";
import { PanelHeading } from "../workspace/PanelHeading";
import styles from "./BrowserPanel.module.css";

export function BrowserPanel() {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) => state.project.document);
  const { browserView, selection } = useAppSelector((state) => state.workspace);
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const candidates =
      browserView === "patterns"
        ? orderedEntities(project.patterns)
        : orderedEntities(project.instruments);
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) return candidates;
    return candidates.filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [browserView, project.instruments, project.patterns, query]);

  const itemKind = browserView === "patterns" ? "pattern" : "instrument";

  return (
    <section className={styles.panel}>
      <PanelHeading
        kicker="Library"
        title="Browser"
        trailing={<span className={styles.count}>{items.length}</span>}
      />

      <div className={styles.tabs}>
        <button
          aria-pressed={browserView === "patterns"}
          onClick={() => dispatch(browserViewChanged("patterns"))}
          type="button"
        >
          Patterns
        </button>
        <button
          aria-pressed={browserView === "instruments"}
          onClick={() => dispatch(browserViewChanged("instruments"))}
          type="button"
        >
          Instruments
        </button>
      </div>

      <label className={styles.search}>
        <span aria-hidden="true">⌕</span>
        <input
          aria-label={`Filter ${browserView}`}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Filter ${browserView}`}
          spellCheck="false"
          type="search"
          value={query}
        />
      </label>

      <div className={styles.list}>
        {items.map((item, index) => {
          const active = selection?.kind === itemKind && selection.id === item.id;

          return (
            <button
              className={styles.item}
              data-active={active || undefined}
              key={item.id}
              onClick={() => dispatch(workspaceSelectionChanged({ id: item.id, kind: itemKind }))}
              type="button"
            >
              <span className={styles.itemIcon} aria-hidden="true">
                {itemKind === "pattern" ? "P" : "I"}
              </span>
              <span className={styles.itemCopy}>
                <strong>{item.name}</strong>
                <small>{itemKind === "pattern" ? `Pattern ${index + 1}` : "Chip instrument"}</small>
              </span>
            </button>
          );
        })}

        {items.length === 0 ? <p className={styles.empty}>No matching {browserView}.</p> : null}
      </div>

      <footer className={styles.footer}>Local project · Unsaved</footer>
    </section>
  );
}
