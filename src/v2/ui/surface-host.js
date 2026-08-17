const PRIMARY_KINDS = new Set(["piano-roll", "playlist", "mixer"]);
const DEVICE_KINDS = new Set(["instrument", "effect"]);

function callSetAttribute(element, name, value) {
  if (!element) return;
  if (typeof element.setAttribute === "function") element.setAttribute(name, String(value));
  else {
    element.attributes ??= {};
    element.attributes[name] = String(value);
  }
}

function callRemoveAttribute(element, name) {
  if (!element) return;
  if (typeof element.removeAttribute === "function") element.removeAttribute(name);
  else if (element.attributes && typeof element.attributes === "object") delete element.attributes[name];
}

function callGetAttribute(element, name) {
  if (!element) return null;
  if (typeof element.getAttribute === "function") return element.getAttribute(name);
  return element.attributes?.[name] ?? null;
}

export function createSurfaceDomAdapter() {
  return Object.freeze({
    replaceChildren(container, ...children) {
      if (typeof container?.replaceChildren === "function") container.replaceChildren(...children);
      else if (container) container.children = [...children];
    },
    setExposed(container, exposed) {
      if (!container) return;
      container.hidden = !exposed;
      if ("inert" in container) container.inert = !exposed;
      if (exposed) callRemoveAttribute(container, "aria-hidden");
      else callSetAttribute(container, "aria-hidden", "true");
    },
    setPresentation(container, surface, type) {
      callSetAttribute(container, "data-surface-kind", surface.kind);
      callSetAttribute(container, "data-surface-id", surface.id);
      callSetAttribute(container, "data-surface-type", type);
      callSetAttribute(container, "aria-label", surface.name);
      callSetAttribute(container, "role", "region");
      callRemoveAttribute(container, "aria-modal");
    },
    clearPresentation(container) {
      for (const attribute of [
        "data-surface-kind",
        "data-surface-id",
        "data-surface-type",
        "aria-label",
        "role",
        "aria-modal",
      ]) callRemoveAttribute(container, attribute);
    },
    nameFocusEntry(entry, name) {
      if (!entry) return;
      callSetAttribute(entry, "aria-label", name);
      callSetAttribute(entry, "data-surface-entry", "true");
      if (callGetAttribute(entry, "tabindex") === null && !(Number.isInteger(entry.tabIndex))) {
        callSetAttribute(entry, "tabindex", "-1");
      } else if (typeof entry.focus === "function" && entry.tabIndex === undefined) {
        entry.tabIndex = -1;
      }
    },
  });
}

function ancestorIsHidden(element) {
  for (let current = element; current; current = current.parentElement ?? current.parentNode) {
    if (current.hidden || current.inert) return true;
    if (callGetAttribute(current, "aria-hidden") === "true") return true;
    const style = current.style;
    if (style?.display === "none" || style?.visibility === "hidden") return true;
  }
  return false;
}

export function createSurfaceFocusAdapter(documentLike = globalThis.document) {
  return Object.freeze({
    focus(element) {
      if (typeof element?.focus !== "function") return false;
      try {
        element.focus({ preventScroll: false });
      } catch {
        element.focus();
      }
      return true;
    },
    isConnected(element) {
      if (!element) return false;
      if (typeof element.isConnected === "boolean") return element.isConnected;
      return true;
    },
    isVisible(element) {
      if (!element || ancestorIsHidden(element)) return false;
      const view = documentLike?.defaultView;
      if (typeof view?.getComputedStyle === "function") {
        const style = view.getComputedStyle(element);
        if (style?.display === "none" || style?.visibility === "hidden") return false;
      }
      return true;
    },
    isEnabled(element) {
      return Boolean(element)
        && element.disabled !== true
        && callGetAttribute(element, "aria-disabled") !== "true";
    },
  });
}

export function isUsableFocusTarget(element, focusAdapter = createSurfaceFocusAdapter()) {
  return Boolean(element)
    && typeof element.focus === "function"
    && focusAdapter.isConnected(element)
    && focusAdapter.isVisible(element)
    && focusAdapter.isEnabled(element);
}

function surfaceId(surface, type) {
  if (type === "device") return surface.instanceId ?? surface.id;
  if (surface.kind === "piano-roll") return surface.patternId ?? surface.id;
  return surface.projectId ?? surface.id;
}

function normalizeSurface(surface, type) {
  if (!surface || typeof surface !== "object") throw new TypeError(`${type} surface is required.`);
  const allowedKinds = type === "device" ? DEVICE_KINDS : PRIMARY_KINDS;
  if (!allowedKinds.has(surface.kind)) throw new RangeError(`Unknown ${type} surface kind: ${surface.kind}`);
  const id = surfaceId(surface, type);
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError(`${type} surface requires a stable domain ID.`);
  }
  const fallbackName = type === "device"
    ? `${id}, ${surface.kind === "instrument" ? "Instrument" : "Effect"}`
    : surface.kind === "piano-roll"
      ? `${id}, Piano Roll`
      : surface.kind === "playlist"
        ? "Playlist"
        : "Mixer";
  const name = typeof surface.name === "string" && surface.name.trim().length > 0
    ? surface.name.trim()
    : fallbackName;
  return Object.freeze({ ...surface, id, name });
}

export function getSurfaceIdentity(surface, type = DEVICE_KINDS.has(surface?.kind) ? "device" : "primary") {
  const normalized = normalizeSurface(surface, type);
  return `${normalized.kind}:${normalized.id}`;
}

function publicSurface(surface) {
  return surface
    ? Object.freeze({ kind: surface.kind, id: surface.id, name: surface.name })
    : null;
}

function escapeOwnedBySubcontrol(event) {
  const target = event?.target;
  if (typeof target?.closest === "function") {
    return Boolean(target.closest('[data-owns-escape="true"]'));
  }
  return callGetAttribute(target, "data-owns-escape") === "true";
}

export function createSurfaceHost({
  primaryContainer,
  deviceContainer,
  renderPrimary,
  renderDevice,
  mountPrimary,
  mountDevice,
  dom: injectedDom,
  focus: injectedFocus,
  document: documentLike = globalThis.document,
  keyboardTarget = documentLike,
  surfaceSwitcher = null,
  resolveLauncher,
  ownsEscape,
  mobile = false,
  initialPrimary = null,
  initialDevice = null,
} = {}) {
  if (!primaryContainer || !deviceContainer) {
    throw new TypeError("Surface host requires primaryContainer and deviceContainer.");
  }
  const primaryRenderer = renderPrimary ?? mountPrimary;
  const deviceRenderer = renderDevice ?? mountDevice;
  if (typeof primaryRenderer !== "function" || typeof deviceRenderer !== "function") {
    throw new TypeError("Surface host requires primary and device renderers.");
  }

  const dom = Object.freeze({ ...createSurfaceDomAdapter(), ...(injectedDom ?? {}) });
  const focus = Object.freeze({ ...createSurfaceFocusAdapter(documentLike), ...(injectedFocus ?? {}) });
  let primarySurface = null;
  let primaryOwner = null;
  let deviceSurface = null;
  let deviceOwner = null;
  let deviceOpener = null;
  let disposed = false;
  let isMobile = typeof mobile === "function" ? Boolean(mobile()) : Boolean(mobile);

  function currentSnapshot() {
    return Object.freeze({
      primary: publicSurface(primarySurface),
      device: publicSurface(deviceSurface),
      mobile: isMobile,
      disposed,
    });
  }

  function render(surface, type) {
    const renderer = type === "primary" ? primaryRenderer : deviceRenderer;
    const container = type === "primary" ? primaryContainer : deviceContainer;
    const controller = new AbortController();
    let rendered;
    try {
      rendered = renderer(surface, Object.freeze({
        container,
        signal: controller.signal,
        type,
        getSnapshot: currentSnapshot,
      }));
    } catch (error) {
      controller.abort();
      throw error;
    }
    if (rendered && typeof rendered.then === "function") {
      controller.abort();
      throw new TypeError("Surface renderers must return synchronously.");
    }

    const ownerShape = rendered && typeof rendered === "object"
      && ("element" in rendered || "node" in rendered || "focusEntry" in rendered || "dispose" in rendered)
      ? rendered
      : { element: rendered };
    const element = ownerShape.element ?? ownerShape.node;
    const focusEntry = ownerShape.focusEntry ?? ownerShape.entry ?? element;
    if (!element || !focusEntry) {
      controller.abort();
      ownerShape.dispose?.();
      throw new TypeError(`${type} renderer must return an element and a named focus entry.`);
    }

    dom.nameFocusEntry(focusEntry, surface.name);
    if (type === "device") {
      callSetAttribute(element, "role", "region");
      callRemoveAttribute(element, "aria-modal");
    }

    let ownerDisposed = false;
    return {
      surface,
      element,
      focusEntry,
      ownsEscape: ownerShape.ownsEscape,
      getLauncher: ownerShape.getLauncher ?? ownerShape.resolveLauncher,
      dispose() {
        if (ownerDisposed) return false;
        ownerDisposed = true;
        controller.abort();
        ownerShape.dispose?.();
        return true;
      },
    };
  }

  function attach(owner, type) {
    const container = type === "primary" ? primaryContainer : deviceContainer;
    dom.replaceChildren(container, owner.element);
    dom.setPresentation(container, owner.surface, type);
    dom.setExposed(container, true);
  }

  function empty(container) {
    dom.replaceChildren(container);
    dom.clearPresentation(container);
    dom.setExposed(container, false);
  }

  function disposeOwner(owner, container) {
    let disposalError;
    try {
      owner?.dispose();
    } catch (error) {
      disposalError = error;
    } finally {
      empty(container);
    }
    if (disposalError) throw disposalError;
  }

  function tryFocus(element) {
    if (!isUsableFocusTarget(element, focus)) return false;
    return focus.focus(element) !== false;
  }

  function switcherElement() {
    return typeof surfaceSwitcher === "function" ? surfaceSwitcher() : surfaceSwitcher;
  }

  function launcherFor(device, owner) {
    const context = Object.freeze({
      device: publicSurface(device),
      primary: publicSurface(primarySurface),
      primaryOwner: owner,
    });
    const fromOwner = owner?.getLauncher?.(device, context);
    if (fromOwner) return fromOwner;
    return typeof resolveLauncher === "function" ? resolveLauncher(device, context) : null;
  }

  function restoreDeviceFocus({ explicitTarget, device = deviceSurface } = {}) {
    const candidates = [
      explicitTarget,
      deviceOpener,
      launcherFor(device, primaryOwner),
      primaryOwner?.focusEntry,
      switcherElement(),
    ];
    for (const candidate of candidates) {
      if (tryFocus(candidate)) return candidate;
    }
    return null;
  }

  function mountRememberedPrimary() {
    if (!primarySurface || primaryOwner) return primaryOwner;
    const candidate = render(primarySurface, "primary");
    primaryOwner = candidate;
    attach(candidate, "primary");
    return candidate;
  }

  function removeDevice({ restoreFocus = true, explicitTarget, remountPrimary = true } = {}) {
    if (!deviceOwner) return false;
    const closingDevice = deviceSurface;
    let pendingPrimary = null;
    if (isMobile && remountPrimary && !primaryOwner && primarySurface) {
      pendingPrimary = render(primarySurface, "primary");
    }

    if (!isMobile && restoreFocus) restoreDeviceFocus({ explicitTarget, device: closingDevice });
    const oldOwner = deviceOwner;
    deviceOwner = null;
    try {
      disposeOwner(oldOwner, deviceContainer);
    } finally {
      if (pendingPrimary) {
        primaryOwner = pendingPrimary;
        attach(pendingPrimary, "primary");
      } else if (isMobile && remountPrimary) {
        mountRememberedPrimary();
      }
      if (isMobile && restoreFocus) {
        restoreDeviceFocus({ explicitTarget, device: closingDevice });
      }
      deviceSurface = null;
      deviceOpener = null;
    }
    return true;
  }

  function assertActive() {
    if (disposed) throw new Error("Surface host has been disposed.");
  }

  function activatePrimary(surface, {
    focusEntry = true,
    interaction = false,
    deliberate = true,
  } = {}) {
    assertActive();
    const nextSurface = normalizeSurface(surface, "primary");
    const nextIdentity = getSurfaceIdentity(nextSurface, "primary");
    const currentIdentity = primarySurface ? getSurfaceIdentity(primarySurface, "primary") : null;

    if (nextIdentity === currentIdentity) {
      primarySurface = nextSurface;
      if (primaryOwner) {
        primaryOwner.surface = nextSurface;
        dom.setPresentation(primaryContainer, nextSurface, "primary");
        dom.nameFocusEntry(primaryOwner.focusEntry, nextSurface.name);
      }
      if (!interaction && focusEntry && primaryOwner) tryFocus(primaryOwner.focusEntry);
      return false;
    }

    const candidate = render(nextSurface, "primary");
    if (deviceOwner && deliberate) {
      removeDevice({
        restoreFocus: !isMobile,
        remountPrimary: false,
      });
    }
    if (primaryOwner) {
      const oldOwner = primaryOwner;
      primaryOwner = null;
      disposeOwner(oldOwner, primaryContainer);
    }
    primarySurface = nextSurface;
    primaryOwner = candidate;
    attach(candidate, "primary");
    if (focusEntry) tryFocus(candidate.focusEntry);
    return true;
  }

  function replacePrimary(surface, { focusEntry = true } = {}) {
    assertActive();
    const nextSurface = normalizeSurface(surface, "primary");
    if (deviceOwner) removeDevice({ restoreFocus: !isMobile, remountPrimary: false });
    if (primaryOwner) {
      const oldOwner = primaryOwner;
      primaryOwner = null;
      disposeOwner(oldOwner, primaryContainer);
    }
    primarySurface = null;
    const candidate = render(nextSurface, "primary");
    primarySurface = nextSurface;
    primaryOwner = candidate;
    attach(candidate, "primary");
    if (focusEntry) tryFocus(candidate.focusEntry);
    return true;
  }

  function openDevice(surface, { opener = null, focusEntry = true } = {}) {
    assertActive();
    if (!primarySurface) throw new Error("A primary surface must be active before opening a device.");
    const nextSurface = normalizeSurface(surface, "device");
    const nextIdentity = getSurfaceIdentity(nextSurface, "device");
    const currentIdentity = deviceSurface ? getSurfaceIdentity(deviceSurface, "device") : null;

    if (nextIdentity === currentIdentity) {
      deviceSurface = nextSurface;
      deviceOwner.surface = nextSurface;
      if (opener) deviceOpener = opener;
      dom.setPresentation(deviceContainer, nextSurface, "device");
      dom.nameFocusEntry(deviceOwner.focusEntry, nextSurface.name);
      if (focusEntry) tryFocus(deviceOwner.focusEntry);
      return false;
    }

    const candidate = render(nextSurface, "device");
    if (deviceOwner) removeDevice({ restoreFocus: false, remountPrimary: false });
    if (isMobile && primaryOwner) {
      const oldPrimary = primaryOwner;
      primaryOwner = null;
      disposeOwner(oldPrimary, primaryContainer);
    }
    deviceSurface = nextSurface;
    deviceOwner = candidate;
    deviceOpener = opener;
    attach(candidate, "device");
    if (focusEntry) tryFocus(candidate.focusEntry);
    return true;
  }

  function closeDevice(options = {}) {
    assertActive();
    return removeDevice({
      restoreFocus: options.restoreFocus !== false,
      explicitTarget: options.focusTarget,
      remountPrimary: options.remountPrimary !== false,
    });
  }

  function handleKeyDown(event) {
    if (disposed || !deviceOwner || event?.key !== "Escape" || event.defaultPrevented) return false;
    const ownerClaimsEscape = typeof deviceOwner.ownsEscape === "function"
      && deviceOwner.ownsEscape(event) === true;
    const hostHookClaimsEscape = typeof ownsEscape === "function"
      && ownsEscape(event, Object.freeze({
        device: publicSurface(deviceSurface),
        owner: deviceOwner,
      })) === true;
    if (ownerClaimsEscape || hostHookClaimsEscape || escapeOwnedBySubcontrol(event)) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    closeDevice();
    return true;
  }

  function syncLayout(nextMobile = typeof mobile === "function" ? Boolean(mobile()) : isMobile) {
    assertActive();
    const requestedMobile = Boolean(nextMobile);
    if (requestedMobile === isMobile) return false;

    if (deviceOwner && requestedMobile && primaryOwner) {
      const oldPrimary = primaryOwner;
      primaryOwner = null;
      disposeOwner(oldPrimary, primaryContainer);
    } else if (deviceOwner && !requestedMobile && !primaryOwner && primarySurface) {
      const candidate = render(primarySurface, "primary");
      primaryOwner = candidate;
      attach(candidate, "primary");
    }
    isMobile = requestedMobile;
    return true;
  }

  function interactWithPrimary() {
    assertActive();
    return false;
  }

  function focusPrimaryEntry() {
    assertActive();
    return tryFocus(primaryOwner?.focusEntry);
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    keyboardTarget?.removeEventListener?.("keydown", handleKeyDown);
    let firstError;
    if (deviceOwner) {
      const owner = deviceOwner;
      deviceOwner = null;
      try {
        disposeOwner(owner, deviceContainer);
      } catch (error) {
        firstError = error;
      }
    } else empty(deviceContainer);
    if (primaryOwner) {
      const owner = primaryOwner;
      primaryOwner = null;
      try {
        disposeOwner(owner, primaryContainer);
      } catch (error) {
        firstError ??= error;
      }
    } else empty(primaryContainer);
    deviceSurface = null;
    primarySurface = null;
    deviceOpener = null;
    if (firstError) throw firstError;
    return true;
  }

  const api = Object.freeze({
    activatePrimary,
    replacePrimary,
    reset: replacePrimary,
    interactWithPrimary,
    openDevice,
    closeDevice,
    focusPrimaryEntry,
    handleKeyDown,
    syncLayout,
    getSnapshot: currentSnapshot,
    getPrimaryOwner: () => primaryOwner,
    getDeviceOwner: () => deviceOwner,
    dispose,
  });

  keyboardTarget?.addEventListener?.("keydown", handleKeyDown);
  try {
    if (initialPrimary) activatePrimary(initialPrimary);
    if (initialDevice) openDevice(initialDevice.surface ?? initialDevice, {
      opener: initialDevice.opener ?? null,
    });
  } catch (error) {
    dispose();
    throw error;
  }
  return api;
}
