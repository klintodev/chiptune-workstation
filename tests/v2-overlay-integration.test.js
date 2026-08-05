import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Studio coordinates Playlist, Piano, and device layers across focus and mobile transitions", async () => {
  const [studio, deviceWindow, workspaceCss] = await Promise.all([
    readFile(new URL("../src/v2/studio-app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/ui/device-window.js", import.meta.url), "utf8"),
    readFile(new URL("../src/v2/styles/workspace.css", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /matchMedia\?\.\("\(max-width: 700px\)"\)/);
  assert.doesNotMatch(workspaceCss, /max-width: 700px\), \(max-height: 640px/);
  assert.match(studio, /setLayerExposed\(dom\.primaryHost, !pianoOpen && !deviceOpen\)/);
  assert.match(studio, /setLayerExposed\(dom\.editorHost, pianoOpen && !deviceOpen\)/);
  assert.match(studio, /setLayerExposed\(dom\.deviceHost, deviceOpen\)/);
  assert.match(studio, /host\.inert = !exposed/);
  assert.match(studio, /host\.setAttribute\("aria-hidden", "true"\)/);

  assert.match(studio, /synchronizePianoOverlay\(workspaceState\.getState\(\), projectState\.getState\(\), \{\s*focusEntry: true/s);
  assert.match(studio, /const focusPiano = state\.activePrimary === "piano-roll" && \(\s*replacingProject/s);
  assert.match(studio, /function suspendPrimaryOwner\(\)/);
  assert.match(studio, /owner\.dispose\(\);\s*} finally \{\s*dom\.primaryHost\.replaceChildren\(\)/s);
  assert.match(studio, /synchronizeMobileSurfaceOwnership\(state, project/);
  assert.match(studio, /if \(state\.device\) \{\s*closePianoOverlay\(\)/s);
  assert.match(studio, /primaryOwnerSuspended \|\| !surfaceHost\.getPrimaryOwner\(\)/);
  assert.match(studio, /focusTarget: pianoFocusTarget/);
  assert.match(studio, /activeDeviceWindow\?\.syncLayout\(event\.matches\)/);
  assert.match(deviceWindow, /dragController\.setDisabled\(currentMobile \|\| !dragTarget\)/);

  const openDevice = studio.slice(
    studio.indexOf("function openDevice"),
    studio.indexOf("function selectorId"),
  );
  assert.match(openDevice, /const changed = workspaceState\.openDevice/);
  assert.match(openDevice, /if \(changed\) return true/);
  assert.match(openDevice, /pendingDeviceOpener = null/);
  assert.match(openDevice, /surfaceHost\.openDevice\(descriptor, \{\s*focusEntry: true/s);
  assert.match(openDevice, /activePrimary === "mixer"\) workspaceState\.activatePlaylist\(\)/);
  assert.match(openDevice, /function openEffect\(instanceId, opener\)/);
  assert.match(openDevice, /return openDevice\("effect", instanceId, opener\)/);

  const escapeHandler = studio.slice(
    studio.indexOf('documentLike.addEventListener("keydown"'),
    studio.indexOf("function handleProjectChange"),
  );
  assert.ok(escapeHandler.indexOf("if (state.device)") < escapeHandler.indexOf('state.activePrimary !== "piano-roll"'));
  assert.match(escapeHandler, /if \(!surfaceHost\.getSnapshot\(\)\.device\)/);
  assert.match(escapeHandler, /if \(restorePiano\) queueMicrotask\(focusPianoOverlay\)/);
});
