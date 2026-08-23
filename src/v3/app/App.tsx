import { Group, Panel, Separator } from "react-resizable-panels";

import { useAppSelector } from "./hooks";
import { BrowserPanel } from "../features/browser/BrowserPanel";
import {
  EngineBoundaryStatus,
  type EngineBoundarySnapshot,
} from "../features/engine-status/EngineBoundaryStatus";
import { EditorPanel } from "../features/editor/EditorPanel";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { ProjectNameField } from "../features/transport/ProjectNameField";
import { TransportBar } from "../features/transport/TransportBar";
import styles from "./App.module.css";

// Runtime transport and engine state will enter through the controller boundary.
// It deliberately does not live in the serializable Redux application state.
const detachedEngineSnapshot: EngineBoundarySnapshot = Object.freeze({
  detail: "The first-party audio engine is not mounted in the Part 1 foundation.",
  lifecycle: "detached",
});

export function App() {
  const project = useAppSelector((state) => state.project.document);

  return (
    <div className={styles.app}>
      <header className={styles.topBar}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div className={styles.brand}>
            <strong>Klinto Studio</strong>
            <span>V3 foundation</span>
          </div>
          <div className={styles.projectDivider} />
          <ProjectNameField value={project.name} />
        </div>

        <TransportBar bpm={project.transport.bpm} />

        <div className={styles.runtimeStatus}>
          <EngineBoundaryStatus snapshot={detachedEngineSnapshot} />
        </div>
      </header>

      <main className={styles.workspace}>
        <Group className={styles.panelGroup} id="v3-main-workspace" orientation="horizontal">
          <Panel
            defaultSize={230}
            groupResizeBehavior="preserve-pixel-size"
            id="browser"
            minSize={180}
          >
            <BrowserPanel />
          </Panel>
          <Separator className={styles.separator} id="browser-resize" />
          <Panel id="editor" minSize={420}>
            <EditorPanel />
          </Panel>
          <Separator className={styles.separator} id="inspector-resize" />
          <Panel
            defaultSize={250}
            groupResizeBehavior="preserve-pixel-size"
            id="inspector"
            minSize={210}
          >
            <InspectorPanel />
          </Panel>
        </Group>
      </main>

      <footer className={styles.statusBar}>
        <div>
          <span className={styles.readyDot} aria-hidden="true" />
          UI ready
        </div>
        <span>Audio runtime · outside application state</span>
      </footer>
    </div>
  );
}
