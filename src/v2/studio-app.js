import {
  createAudioEngine,
  createAudioEngineError,
  isAudioEngineError,
} from "../audio/audio-engine.js";
import { createAudioStatusFeature } from "../features/audio-status/audio-status.js";
import { createProjectLibraryFeature } from "../features/project-library/project-library.js";
import { createLocalRemixProvenanceRepository } from "../persistence/remix-provenance-repository.js";
import { createSessionState } from "../state/session-state.js";
import { createDeviceRuntimeRegistry } from "./audio/runtime-registry.js";
import { createKlintoChipSynthRuntime } from "./audio/klinto-chip-synth.js";
import { createV2Scheduler } from "./audio/occurrence-scheduler.js";
import { createV2ProjectState } from "./domain/project-state.js";
import { normalizeV2Project } from "./domain/schema.js";
import {
  createV2ProjectPersistence,
  loadInitialV2ProjectDocument,
} from "./persistence/project-persistence.js";
import {
  createV2IndexedDbProjectRepository,
  createV2MemoryProjectRepository,
  createV2ProjectPreferences,
} from "./persistence/project-repository.js";
import {
  createV2UpgradeDisclosure,
  createV2UpgradeDisclosurePreference,
} from "./persistence/upgrade-disclosure.js";
import { createWorkspaceState } from "./state/workspace-state.js";
import { createDeviceWindow } from "./ui/device-window.js";
import { createV2HelpDialog } from "./ui/help-dialog.js";
import { createMixerSurface } from "./ui/mixer.js";
import { createPianoRollSurface } from "./ui/piano-roll.js";
import { createPlaylistSurface } from "./ui/playlist.js";
import { createStudioShell } from "./ui/studio-shell.js";
import { createSurfaceHost } from "./ui/surface-host.js";
import { createV2ThemeController } from "./ui/theme-controller.js";

function prepareDocument(documentLike) {
  const legacyMain = documentLike.querySelector("main.shell");
  const audioDialog = documentLike.querySelector("#audio-setup");
  if (audioDialog && legacyMain?.contains(audioDialog)) {
    documentLike.body.insertBefore(audioDialog, legacyMain.nextSibling);
  }
  legacyMain?.remove();
  for (const selector of [
    "#pattern-undo-toast",
    "#pattern-delete-dialog",
    "#mobile-mix-dialog",
  ]) documentLike.querySelector(selector)?.remove();

  const root = documentLike.createElement("div");
  root.className = "v2-workspace";
  root.dataset.schemaVersion = "7";
  const shellContainer = documentLike.createElement("div");
  shellContainer.className = "v2-workspace-shell";
  const content = documentLike.createElement("main");
  content.className = "v2-workspace-content";
  content.id = "v2-workspace-content";
  const primaryHost = documentLike.createElement("div");
  primaryHost.className = "v2-primary-host";
  primaryHost.id = "v2-primary-host";
  const deviceHost = documentLike.createElement("div");
  deviceHost.className = "v2-device-host";
  deviceHost.id = "v2-device-host";
  deviceHost.hidden = true;
  content.append(primaryHost, deviceHost);
  root.append(shellContainer, content);
  const firstDialog = documentLike.querySelector("dialog");
  documentLike.body.insertBefore(root, firstDialog ?? null);
  return Object.freeze({ content, deviceHost, primaryHost, root, shellContainer });
}

function createSilentSynthRuntime() {
  return Object.freeze({
    trigger() {
      let ended = false;
      return Object.freeze({
        get ended() { return ended; },
        addEndedListener() { return () => {}; },
        retire() { ended = true; return true; },
        stop() { ended = true; return true; },
      });
    },
  });
}

function effectName(effect) {
  return effect.type === "klinto-filter" ? "Klinto Filter" : "Klinto Delay";
}

function findEffect(project, instanceId) {
  for (const track of project.tracks) {
    const effect = track.mixer.effects.find((candidate) => candidate.instanceId === instanceId);
    if (effect) return { effect, ownerName: track.name };
  }
  const effect = project.mixer.master.effects.find((candidate) => candidate.instanceId === instanceId);
  return effect ? { effect, ownerName: "Master" } : null;
}

function createMeterReader(getRuntimeRegistry) {
  const buffers = new WeakMap();
  return (channelId) => {
    const registry = getRuntimeRegistry();
    const meter = channelId === "master"
      ? registry?.getMasterRuntime?.()?.meter
      : registry?.getTrackRuntime?.(channelId)?.meter;
    if (!meter?.getFloatTimeDomainData) return 0;
    let values = buffers.get(meter);
    if (!values || values.length !== meter.fftSize) {
      values = new Float32Array(meter.fftSize);
      buffers.set(meter, values);
    }
    meter.getFloatTimeDomainData(values);
    let sum = 0;
    for (const value of values) sum += value * value;
    return Math.sqrt(sum / values.length);
  };
}

function surfaceDescriptor(workspace, project) {
  if (workspace.activePrimary === "piano-roll") {
    const pattern = project.patterns.find(({ id }) => id === workspace.activePatternId)
      ?? project.patterns[0];
    return {
      kind: "piano-roll",
      patternId: pattern.id,
      name: `${pattern.name}, Piano Roll`,
    };
  }
  return {
    kind: workspace.activePrimary,
    projectId: workspace.projectId,
    name: workspace.activePrimary === "playlist" ? "Playlist" : "Mixer",
  };
}

function deviceDescriptor(device, project) {
  if (!device) return null;
  if (device.kind === "instrument") {
    const track = project.tracks.find(({ instrument }) => instrument.instanceId === device.instanceId);
    return {
      ...device,
      name: `${track?.name ?? "Track"}, Klinto Chip`,
    };
  }
  const record = findEffect(project, device.instanceId);
  return {
    ...device,
    name: record ? `${record.ownerName}, ${effectName(record.effect)}` : "Effect",
  };
}

export async function createV2StudioApp({ document: documentLike = document } = {}) {
  const lifecycle = new AbortController();
  const projectPreferences = createV2ProjectPreferences();
  const upgradeDisclosurePreference = createV2UpgradeDisclosurePreference();
  let initialSourceSchemaVersion = null;
  const captureSourceSchema = ({ sourceSchemaVersion }) => {
    initialSourceSchemaVersion = sourceSchemaVersion;
  };
  let projectRepository;
  let initialProjectDocument;
  let projectStorageError = null;
  let projectStoragePersistent = true;
  try {
    projectRepository = createV2IndexedDbProjectRepository();
    initialProjectDocument = await loadInitialV2ProjectDocument({
      onSourceSchema: captureSourceSchema,
      preferences: projectPreferences,
      repository: projectRepository,
    });
  } catch (error) {
    projectStorageError = error;
    projectStoragePersistent = false;
    initialSourceSchemaVersion = null;
    projectRepository = createV2MemoryProjectRepository();
    initialProjectDocument = await loadInitialV2ProjectDocument({
      onSourceSchema: captureSourceSchema,
      preferences: projectPreferences,
      repository: projectRepository,
    });
  }

  const projectState = createV2ProjectState(initialProjectDocument.project);
  const projectPersistence = createV2ProjectPersistence({
    initialDocument: initialProjectDocument,
    initialError: projectStorageError,
    initialSourceSchemaVersion,
    onProjectUpgrade: upgradeDisclosurePreference.queue,
    persistent: projectStoragePersistent,
    preferences: projectPreferences,
    projectState,
    repository: projectRepository,
  });
  const workspaceState = createWorkspaceState(projectState, {
    projectId: initialProjectDocument.id,
    validateProject: normalizeV2Project,
  });
  const remixProvenanceRepository = createLocalRemixProvenanceRepository();
  const audioEngine = createAudioEngine();
  const sessionState = createSessionState();
  const dom = prepareDocument(documentLike);
  const upgradeDisclosure = createV2UpgradeDisclosure({
    document: documentLike,
    persistence: projectPersistence,
    preference: upgradeDisclosurePreference,
    root: dom.root,
  });
  const helpDialog = createV2HelpDialog({ root: documentLike });
  const silentSynth = createSilentSynthRuntime();
  let runtimeRegistry = null;
  let synthRuntime = null;
  let audioStatusFeature = null;
  let surfaceHost = null;
  let pendingDeviceOpener = null;
  let disposed = false;
  let synchronizingPatternContext = false;
  let synchronizingProject = false;

  function disposeAudioGraph() {
    synthRuntime?.dispose();
    runtimeRegistry?.dispose();
    synthRuntime = null;
    runtimeRegistry = null;
  }

  function ensureAudioGraph() {
    if (!audioEngine.isReady()) return false;
    if (!runtimeRegistry) {
      const destination = audioEngine.getInputNode();
      const context = destination.context;
      audioEngine.setMasterVolume(1);
      runtimeRegistry = createDeviceRuntimeRegistry({ context, destination });
      synthRuntime = createKlintoChipSynthRuntime({
        context,
        getOutputNode(trackId) {
          const output = runtimeRegistry.getTrackInputNode(trackId);
          if (!output) throw new RangeError(`Unknown audio Track: ${trackId}.`);
          return output;
        },
      });
    }
    runtimeRegistry.sync(projectState.getState());
    return true;
  }

  const silentClockOrigin = globalThis.performance?.now?.() ?? Date.now();
  const scheduler = createV2Scheduler({
    getAudioTime: () => audioEngine.isReady()
      ? audioEngine.getCurrentTime()
      : ((globalThis.performance?.now?.() ?? Date.now()) - silentClockOrigin) / 1000,
    getPatternId: () => workspaceState.getState().activePatternId,
    getProject: projectState.getState,
    getSynthRuntime: () => synthRuntime ?? silentSynth,
    getTrackId: () => workspaceState.getState().patternSurfaces[
      workspaceState.getState().activePatternId
    ]?.auditionTrackId ?? projectState.getState().tracks[0].id,
    onTrackInput: (trackId, event) => (
      runtimeRegistry?.markTrackInput(trackId, event.releaseEndTime)
    ),
  });

  function announce(message) {
    studioShell.announce(message);
  }

  function showAudioSetup() {
    const dialog = documentLike.querySelector("#audio-setup");
    if (!dialog?.open) dialog?.showModal();
    documentLike.querySelector("#audio-action")?.focus();
  }

  function workspacePlayheadTick(mode, workspace = workspaceState.getState()) {
    return mode === "song"
      ? workspace.playback.songPlayheadTick
      : workspace.playback.patternPlayheadTick;
  }

  function playbackStartTick(mode) {
    const transportState = scheduler.getState();
    if (transportState.status === "paused"
      && transportState.mode === mode
      && Number.isInteger(transportState.retainedTick)) {
      return transportState.retainedTick;
    }
    return workspacePlayheadTick(mode);
  }

  function toggleTransport() {
    if (!audioEngine.isReady()) {
      showAudioSetup();
      return false;
    }
    try {
      const status = scheduler.getState().status;
      if (status === "playing") return scheduler.pause();
      const mode = workspaceState.getState().playback.mode;
      return scheduler.play({ mode, startTick: playbackStartTick(mode) });
    } catch (error) {
      announce(error.message);
      return false;
    }
  }

  let themeController = null;
  const studioShell = createStudioShell({
    audioEngine,
    onOpenAudio: showAudioSetup,
    onOpenHelp: (event) => helpDialog.show(event?.currentTarget),
    onOpenProjectLibrary: undefined,
    onToggleTheme: () => themeController?.toggle(),
    persistence: projectPersistence,
    projectState,
    scheduler,
    workspaceState,
  });
  dom.shellContainer.append(studioShell.root);

  function synchronizeTransportSession(event) {
    const transportState = scheduler.getState();
    const mode = transportState.mode;
    const rawTick = scheduler.getPlayheadTick();
    const tick = Number.isFinite(rawTick) ? Math.max(0, Math.floor(rawTick)) : 0;
    const workspace = workspaceState.getState();
    const tickKey = mode === "song" ? "songPlayheadTick" : "patternPlayheadTick";
    if (workspace.playback.mode !== mode || workspace.playback[tickKey] !== tick) {
      workspaceState.setPlayback({ mode, [tickKey]: tick });
    }
    if (event?.detail?.error) announce(event.detail.error.message);
  }
  scheduler.addEventListener("statechange", synchronizeTransportSession);

  themeController = createV2ThemeController({ document: documentLike });
  themeController.render();

  function openDevice(kind, instanceId, opener) {
    pendingDeviceOpener = opener ?? null;
    workspaceState.openDevice(kind, instanceId);
  }

  function selectorId(value) {
    return globalThis.CSS?.escape?.(value) ?? String(value).replaceAll('"', '\\"');
  }

  function resolveSurfaceDeviceLauncher(surfaceNode, device) {
    if (!surfaceNode || !device) return null;
    const instanceId = selectorId(device.id);
    if (device.kind === "effect") {
      return surfaceNode.querySelector(
        `[data-effect-id="${instanceId}"][data-effect-action="open"]`,
      );
    }
    const track = projectState.getState().tracks.find(
      ({ instrument }) => instrument.instanceId === device.id,
    );
    if (!track) return null;
    const trackId = selectorId(track.id);
    return surfaceNode.querySelector(
      `[data-channel-id="${trackId}"][data-mixer-control="instrument"], `
      + `.v2-playlist-instrument[data-track-id="${trackId}"], `
      + ".v2-device-launcher",
    );
  }

  function renderPrimary(surface) {
    let owner;
    if (surface.kind === "piano-roll") {
      owner = createPianoRollSurface({
        announce,
        confirmPatternDelete: async (pattern) => globalThis.confirm?.(
          `Delete ${pattern.name} and every Playlist clip that uses it?`,
        ) ?? false,
        confirmPatternResize: async (pattern, lengthTicks) => {
          const impact = projectState.getPatternResizeImpact(pattern.id, lengthTicks);
          return !impact.requiresConfirmation || (globalThis.confirm?.(
            `Shortening ${pattern.name} will remove or truncate notes. Continue?`,
          ) ?? false);
        },
        onAddToPlaylist(patternId, trackId, snapTicks) {
          try {
            const result = projectState.addPatternToPlaylist(
              patternId,
              trackId,
              workspaceState.getState().playlist.cursorTick,
              { snapTicks },
            );
            workspaceState.setPlaylist({
              cursorTick: result.playlistCursorTick,
              destinationTrackId: trackId,
              selectedClipId: result.clipId,
            });
            if (scheduler.getState().status !== "stopped") scheduler.stop();
            scheduler.setMode("song");
            workspaceState.setPlayback({ mode: "song", songPlayheadTick: result.startTick });
            workspaceState.activatePlaylist();
            announce(`Added Pattern to ${projectState.getTrack(trackId).name} at tick ${result.startTick}.`);
          } catch (error) {
            announce(error.message);
          }
        },
        onOpenInstrument(trackId, opener) {
          const track = projectState.getTrack(trackId);
          openDevice("instrument", track.instrument.instanceId, opener);
        },
        onTransportToggle: toggleTransport,
        projectState,
        getTransportFrame: studioShell.getTransportFrame,
        transportFrameSource: studioShell.root,
        workspaceState,
      });
      return {
        element: owner.node,
        focusEntry: owner.node.querySelector(".v2-piano-canvas"),
        dispose: owner.dispose,
        getLauncher: (device) => resolveSurfaceDeviceLauncher(owner.node, device),
      };
    }
    if (surface.kind === "playlist") {
      owner = createPlaylistSurface({
        announce,
        confirmTrackRemoval: async (track) => track.clips.length === 0 || (globalThis.confirm?.(
          `Remove ${track.name} and its ${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}?`,
        ) ?? false),
        onOpenInstrument(trackId, opener) {
          const track = projectState.getTrack(trackId);
          openDevice("instrument", track.instrument.instanceId, opener);
        },
        onOpenPattern(patternId, trackId) {
          workspaceState.activatePianoRoll(patternId, { auditionTrackId: trackId });
          workspaceState.setAuditionTrack(patternId, trackId);
        },
        onSeek(tick) {
          const arrangementEndTick = projectState.getArrangementEndTick();
          if (arrangementEndTick <= 0) {
            throw new RangeError("Add a clip before seeking the Song.");
          }
          const resolvedTick = Math.min(tick, arrangementEndTick - 1);
          scheduler.setMode("song");
          scheduler.seek(resolvedTick);
          workspaceState.seekSong(resolvedTick);
          return resolvedTick;
        },
        onTransportToggle: toggleTransport,
        projectState,
        getTransportFrame: studioShell.getTransportFrame,
        transportFrameSource: studioShell.root,
        workspaceState,
      });
      return {
        element: owner.node,
        focusEntry: owner.node.querySelector(".v2-playlist-timeline"),
        dispose: owner.dispose,
        getLauncher: (device) => resolveSurfaceDeviceLauncher(owner.node, device),
      };
    }
    owner = createMixerSurface({
      announce,
      getMeterLevel: createMeterReader(() => runtimeRegistry),
      onOpenEffect: (_owner, instanceId, opener) => openDevice("effect", instanceId, opener),
      onOpenInstrument: (trackId, opener) => {
        const track = projectState.getTrack(trackId);
        openDevice("instrument", track.instrument.instanceId, opener);
      },
      projectState,
      workspaceState,
    });
    return {
      element: owner.node,
      focusEntry: owner.node.querySelector(".v2-surface-title"),
      dispose: owner.dispose,
      getLauncher: (device) => resolveSurfaceDeviceLauncher(owner.node, device),
    };
  }

  function renderDevice(surface) {
    const owner = createDeviceWindow({
      device: surface,
      mobile: mobileQuery?.matches ?? false,
      onClose: () => workspaceState.closeDevice(),
      onInvalid: () => workspaceState.closeDevice(),
      projectState,
    });
    return {
      element: owner.node,
      focusEntry: owner.node.querySelector(".v2-device-title"),
      dispose: owner.dispose,
    };
  }

  const mobileQuery = globalThis.matchMedia?.("(max-width: 700px), (max-height: 640px)");
  surfaceHost = createSurfaceHost({
    deviceContainer: dom.deviceHost,
    document: documentLike,
    initialPrimary: surfaceDescriptor(workspaceState.getState(), projectState.getState()),
    mobile: mobileQuery?.matches ?? false,
    primaryContainer: dom.primaryHost,
    renderDevice,
    renderPrimary,
    resolveLauncher(device) {
      return documentLike.querySelector(`[data-effect-id="${device.id}"] button, [data-device-id="${device.id}"]`);
    },
    surfaceSwitcher: () => studioShell.root.querySelector(".v2-surface-switcher [aria-current='page']"),
  });

  function synchronizePatternPlaybackContext() {
    if (synchronizingProject || synchronizingPatternContext) return false;
    const transportState = scheduler.getState();
    const workspace = workspaceState.getState();
    if (transportState.status !== "playing"
      || transportState.mode !== "pattern"
      || workspace.playback.mode !== "pattern") return false;
    const patternId = workspace.activePatternId;
    const trackId = workspace.patternSurfaces[patternId]?.auditionTrackId;
    if (transportState.patternId === patternId && transportState.trackId === trackId) return false;
    const project = projectState.getState();
    const pattern = project.patterns.find(({ id }) => id === patternId);
    if (!pattern || !project.tracks.some(({ id }) => id === trackId)) return false;
    const playhead = scheduler.getPlayheadTick();
    const sourceTick = Number.isFinite(playhead) ? Math.floor(playhead) : 0;
    const startTick = ((sourceTick % pattern.lengthTicks) + pattern.lengthTicks) % pattern.lengthTicks;
    synchronizingPatternContext = true;
    try {
      scheduler.stop();
      return scheduler.play({ mode: "pattern", patternId, startTick, trackId });
    } catch (error) {
      announce(error.message);
      return false;
    } finally {
      synchronizingPatternContext = false;
    }
  }

  function synchronizeHost(event) {
    const state = workspaceState.getState();
    const project = projectState.getState();
    const actionType = event?.detail?.action?.type ?? "";
    const primaryDescriptor = surfaceDescriptor(state, project);
    const replacingProject = ["project/new", "project/reload", "project/replace"].includes(actionType);
    if (replacingProject) {
      surfaceHost.replacePrimary(primaryDescriptor, { focusEntry: true });
    } else {
      surfaceHost.activatePrimary(primaryDescriptor, {
        focusEntry: actionType === "primary/activate"
          || actionType === "pattern/open-from-clip"
          || actionType === "delete-pattern/repair",
        deliberate: true,
      });
    }
    const descriptor = deviceDescriptor(state.device, project);
    if (descriptor) {
      surfaceHost.openDevice(descriptor, {
        focusEntry: actionType === "device/open",
        opener: pendingDeviceOpener,
      });
      pendingDeviceOpener = null;
    } else if (surfaceHost.getSnapshot().device) {
      surfaceHost.closeDevice({
        restoreFocus: actionType === "device/close"
          || actionType === "remove-effect/repair"
          || actionType === "remove-track/repair",
      });
    }
    synchronizePatternPlaybackContext();
  }
  workspaceState.addEventListener("change", synchronizeHost);

  mobileQuery?.addEventListener?.("change", (event) => surfaceHost.syncLayout(event.matches), {
    signal: lifecycle.signal,
  });
  documentLike.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.defaultPrevented && workspaceState.getState().device) {
      workspaceState.closeDevice();
    }
  }, { signal: lifecycle.signal });

  function handleProjectChange(event) {
    const project = projectState.getState();
    const operation = event.detail?.operation;
    const replacingProject = ["open-project", "replace", "create-project-from-template"].includes(operation);
    synchronizingProject = true;
    try {
      if (replacingProject) {
        workspaceState.replaceProject(projectState, {
          projectId: event.detail?.projectId ?? projectPersistence.getActiveDocument().id,
        });
      } else {
        workspaceState.repairProject(projectState, { reason: `${operation ?? "project"}/repair` });
      }
      if (replacingProject) {
        scheduler.stop();
        disposeAudioGraph();
      }
      if (audioEngine.isReady()) {
        try {
          ensureAudioGraph();
        } catch (error) {
          scheduler.stop();
          announce(`Audio routing error: ${error.message}`);
        }
      }
      scheduler.setMode(workspaceState.getState().playback.mode);
      scheduler.setBpm(project.transport.bpm);
      scheduler.syncProject(project);
    } finally {
      synchronizingProject = false;
    }
  }
  projectState.addEventListener("change", handleProjectChange);
  audioEngine.addEventListener("statechange", () => {
    if (!audioEngine.isReady()) return;
    try {
      ensureAudioGraph();
    } catch (error) {
      announce(`Audio routing error: ${error.message}`);
    }
  }, { signal: lifecycle.signal });

  const projectLibraryFeature = createProjectLibraryFeature({
    onBeforeProjectChange: () => scheduler.stop(),
    onProjectDeleted: (projectId) => remixProvenanceRepository.delete(projectId),
    persistence: projectPersistence,
    projectState,
    root: documentLike,
  });
  audioStatusFeature = createAudioStatusFeature({
    audioEngine,
    createUnexpectedError: (error) => createAudioEngineError(
      "unexpected",
      "An unexpected audio error occurred.",
      error,
    ),
    isAudioEngineError,
    onRenderDependants: ensureAudioGraph,
    root: documentLike,
    sessionState,
  });
  audioStatusFeature.render();

  function stopAllSound() {
    scheduler.stop();
  }

  function pauseForInterruption() {
    scheduler.pause();
  }
  documentLike.addEventListener("visibilitychange", () => {
    if (!documentLike.hidden) return;
    pauseForInterruption();
    void projectPersistence.saveNow().catch(() => {});
  }, { signal: lifecycle.signal });
  globalThis.addEventListener?.("blur", pauseForInterruption, { signal: lifecycle.signal });
  globalThis.addEventListener?.("pagehide", () => {
    pauseForInterruption();
    void projectPersistence.saveNow().catch(() => {});
  }, { signal: lifecycle.signal });

  async function dispose() {
    if (disposed) return false;
    disposed = true;
    lifecycle.abort();
    workspaceState.removeEventListener("change", synchronizeHost);
    scheduler.removeEventListener("statechange", synchronizeTransportSession);
    projectState.removeEventListener("change", handleProjectChange);
    audioStatusFeature?.dispose();
    projectLibraryFeature.dispose();
    upgradeDisclosure.dispose();
    surfaceHost.dispose();
    studioShell.dispose();
    helpDialog.dispose();
    workspaceState.dispose();
    scheduler.dispose();
    disposeAudioGraph();
    try {
      await projectPersistence.dispose();
    } catch {
      // Page teardown cannot display a recovery prompt; save status already records the failure.
    }
    try {
      await projectRepository.dispose?.();
    } catch {
      // Repository shutdown is best effort after the final save has settled.
    }
    try {
      await audioEngine.dispose();
    } catch {
      // Audio teardown is also best effort during unload.
    }
    dom.root.remove();
    return true;
  }
  globalThis.addEventListener?.("unload", dispose, { once: true, signal: lifecycle.signal });

  return Object.freeze({
    audioEngine,
    dispose,
    projectPersistence,
    projectPreferences,
    projectRepository,
    projectState,
    remixProvenanceRepository,
    scheduler,
    sessionState,
    stopAllSound,
    workspaceState,
  });
}
