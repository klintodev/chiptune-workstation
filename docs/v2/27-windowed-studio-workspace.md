# PRD 27: Focused Studio workspace

Status: Draft  
Release: Klinto Studio V2  
Depends on: PRD 26

## Description

Replace V1's stacked/tabbed workstation with a small surface host: one full-workspace musical surface and, when requested, one focused first-party device window above it.

â€œWindowâ€ means an independently addressable in-app surface with its own title, lifecycle and focus return. It does not mean a freeform operating-system desktop. Patterns receive their own Piano Roll surfaces; instruments and effects receive their own modeless device surfaces.

## Product outcome

A new project opens directly into Pattern 1's Piano Roll. The Pattern owns almost all space below a compact shell. The user may switch to Playlist or Mixer, or open one Instrument/Effect, without accumulating permanent panels or losing transport access.

## Surface model

### 1. Global shell

On desktop the shell is one row with a maximum height of 72 CSS pixels. It contains only:

- compact project identity and save status;
- Return to start, Play/Pause and Stop;
- Pattern/Song mode;
- compact tempo control plus a master readout/launcher; while Mixer is active, master editing lives only on the Master channel and the shell does not expose a duplicate editable popover;
- audio-enable/state control;
- Piano Roll, Playlist and Mixer switcher;
- one secondary menu containing project management, help, share/publish, theme and account actions;
- exactly one `V2 Beta` badge during Beta.

The shell never contains a visualiser, Pattern step grid, arrangement overview, device parameters or per-Track Mixer controls. It remains operable while a modeless device is open.

### 2. Primary surface

Exactly one primary surface fills the content area:

- a Piano Roll for one Pattern;
- Playlist for the current Project; or
- Mixer for the current Project.

Activating another primary hides the previous one from layout, tab order and the accessibility tree. Audio continues. Session state may preserve each Pattern's viewport, selection and audition Track, but hidden surfaces do no animation-frame or measurement work.

Pattern and Track selection use compact contextual controls in Piano Roll, Playlist and Mixer. V2 does not add a Rack or separate Keyboard window. Computer-key audition remains available under the conflict rules in PRD 28; any on-screen audition keyboard is collapsed/absent by default and embedded in the relevant surface.

### 3. Device window

At most one Instrument or Effect editor may be visible above the active primary surface.

- At 1366Ã—768 it is no larger than 720Ã—560 CSS pixels or 60vwÃ—75vh, whichever is smaller, uses product-owned placement, and scrolls internally when required; at least 55% of the primary content area remains visible around it.
- It is modeless: global transport and the shell remain available; there is no focus trap or `aria-modal`.
- Opening a second device closes the first presentation, then opens and focuses the requested device.
- Deliberately switching to a different primary surface closes the visible device presentation. Interacting with the current primary does not close it, so the user can tweak a modeless device while working underneath.
- Close affects presentation only. The device's audio runtime and persisted parameters remain active.
- It cannot be dragged, pinned, minimized, maximized or arbitrarily resized in V2.

Adding an effect does not automatically open its editor. Opening is a separate action.

### 4. Transient and modal UI

Menus, selects, tooltips and parameter popovers are transient UI. Destructive confirmations, incompatible-project recovery choices and other blocking decisions may use true modal dialogs with focus trapping and modal semantics.

Piano Roll, Playlist, Mixer, Instrument and Effect surfaces are never presented as modal dialogs.

## Identity and ownership

Surface identity is derived from stable domain identity:

- Piano Roll: Pattern ID
- Playlist: Project ID
- Mixer: Project ID
- Instrument window: instrument instance ID
- Effect window: effect instance ID; current owner and slot are presentation context, not identity

Opening the already-active identity focuses it without duplicating state. Opening another Pattern activates that Pattern's existing session surface or creates one.

Each Pattern surface owns transient `auditionTrackId` state:

- first open uses the current valid Track, falling back to the first Track;
- opening from a Playlist clip explicitly sets it to that clip's Track;
- merely returning to an existing Pattern preserves it;
- Add to Playlist uses it as the destination Track;
- Track deletion or project replacement repairs it before render;
- it never enters project persistence.

Deleting a Pattern closes its Piano Roll surface. Deleting a Track closes that Track's Instrument and any Track-owned Effect presentation, but keeps Pattern surfaces and rebinds affected audition context to the first surviving Track. The final Pattern and final Track cannot be deleted, so every fallback always has a valid musical object.

## Focus and keyboard model

- Opening a surface moves focus to a programmatically focusable title or editor entry point that announces surface and object context.
- Opening a device records the invoking control.
- Closing a device returns focus to that control only if it is still connected, visible and enabled.
- If the opener is invalid, focus falls back to the same object's visible launcher, then the active primary heading, then the global surface switcher.
- Project switch, Track/Pattern/effect deletion and undo repair focus before the old surface is unmounted.
- Hidden surfaces and the replaced device contain no tabbable or screen-reader-reachable content.
- Escape closes the device only when focus is not inside a subcontrol that owns Escape; it does not close a primary surface.
- Browser Back behaviour is not repurposed for the desktop surface stack in V2.

## Desktop layout and chrome budget

Before shell implementation, Product and Design approve low-fidelity 1366Ã—768 and 1920Ã—1080 wireframes showing the default Piano Roll, Playlist and Mixer plus separate open-device states for Klinto Chip, Filter and Delay. The same three devices receive narrow-screen wireframes.

Visual acceptance at 1366Ã—768 requires:

- shell height no greater than 72 CSS pixels;
- no page-level vertical or horizontal scrolling;
- primary surface reaches the bottom of the viewport;
- at least 75% of the content area belongs to the primary musical surface when no device is open;
- no duplicate project, transport, Pattern, Track or master controls;
- Piano Roll persistent header contains only Pattern identity, audition Track, active tool/snap and Add to Playlist; zoom, history and destructive actions are grouped;
- opening a device does not reveal another permanent navigation rail or panel.

Exact styling is approved in wireframes rather than invented during infrastructure work.

## Narrow-screen behaviour

At the mobile breakpoint, the same domain surfaces become one full-workspace navigation view beneath a compact shell.

- Only the active content surface is mounted/exposed.
- A device replaces the content view but remains non-modal: compact transport and Back/switcher stay reachable, with no focus trap or `aria-modal`.
- Back closes the device and restores its connected, visible, enabled launcher.
- Required V2 mobile behaviour is surface switching, transport, Piano Roll/Playlist viewing, explicit single-note create/select/delete, Instrument/Effect parameter editing, save/reload and safe focus.
- Full touch multi-selection, move/resize gestures, velocity gestures, clip rearrangement, desktop-style geometry and browser-history surface navigation are post-V2.

## Session state and project lifecycle

Surface state is session-local UI state, separate from undoable project state and persistence. It may include active primary kind, active Pattern ID, Pattern viewport/selection, `auditionTrackId`, and current device identity/opener.

- New project: Pattern 1 Piano Roll, no device.
- Reload: one safe Piano Roll for the last valid/current Pattern, no device.
- Project open/switch/import: validate project first, then reset to one safe Piano Roll and repair IDs.
- Project deletion/replacement: dispose all old surface and device owners before rendering the replacement.
- Undo of a deleted object restores data but does not automatically reopen its presentation.

No window state, focus target, geometry or DOM identifier is saved in project JSON, cloud records, publications or browser history.

## Accessibility requirements

- Surface names include object context, for example `Pattern 3, Piano Roll` and `Track 1, Klinto Chip`.
- Active primary and device state are programmatically determinable without announcing every switch as an alert.
- Visual focus is always visible and meets contrast requirements.
- Keyboard operation reaches every launcher and Close control.
- At 200% zoom, the shell, primary title/actions, full device parameter set and Close remain reachable.
- Motion respects `prefers-reduced-motion`.
- Automated checks find no applicable WCAG 2.2 A/AA violation except a documented false positive with manual evidence.

## Acceptance criteria

### Desktop

- A new project at 1366Ã—768 shows only the compact shell and Pattern 1 Piano Roll; no Playlist, Mixer, device, visualiser or empty arrangement is visible.
- Switching Piano Roll â†’ Playlist â†’ Mixer â†’ Piano Roll leaves transport/audio running and restores Pattern viewport/selection.
- Opening Klinto Chip focuses its named editor; opening an Effect replaces it; closing returns to a valid visible origin.
- Interacting with the current primary while a device is open leaves the device available; switching to a different primary closes it and restores valid focus.
- Hidden/replaced surfaces have no focusable or accessibility-tree descendants and perform no continuous visual work.
- Removing an owning Track while its device is open closes it, repairs focus and preserves open Pattern state with a repaired audition Track.
- There are no duplicate surface instances for one stable object ID.

### Narrow screen

- At approximately 390Ã—844, Pattern â†’ Instrument â†’ Back â†’ Pattern and Mixer â†’ Effect â†’ Back â†’ Mixer restore their exact valid launchers.
- Transport and Back/switcher remain reachable on a device view.
- Previous views are absent from layout, tab order and the accessibility tree.

### Modal distinction

- A destructive confirmation traps/restores focus and has modal semantics.
- Instrument and Effect views do neither.

## Automated coverage

- Domain tests for surface reducer identity, opener validation, audition-Track repair and project lifecycle
- Component/browser tests for one-primary/one-device rendering and hidden-tree exclusion
- Keyboard focus journeys for open, replace, close, Track removal, Pattern deletion and project switch
- 1366Ã—768 no-page-scroll, device-occlusion and chrome-budget assertions, including the conditional shell/Mixer master control
- 390Ã—844 navigation/focus smoke journey
- Leak checks for listeners, animation frames and device presentation owners

## Delivery slices

1. **Workbench fixtures:** generic primary and device hosts with fake objects; identity, focus and disposal tests.
2. **Approved wireframes/chrome budget:** desktop and mobile product sign-off before production shell styling.
3. **Shell and primary switcher:** one-row shell and generic Piano Roll/Playlist/Mixer activation behind the V2 flag.
4. **Pattern host:** mount the existing Pattern editor temporarily inside the primary host without redesigning its musical model.
5. **Device host:** fixed product-owned Instrument/Effect presentation, replace/close/focus lifecycle and narrow-screen navigation.
6. **Downstream adoption:** PRDs 28â€“31 populate the hosts; remove old tabs/stacked layout only after equivalent capabilities pass their own gates.

PRD 27 does not build a temporary production Mixer, Playlist or new audio feature.

## Out of scope

- Rack/channel-rack and separate Keyboard window
- Moving, dragging, pinning, minimizing, maximizing, arbitrary resizing or multiple visible devices
- Saved layouts, workspace reset, detachable/browser windows or multi-monitor support
- Browser-history routing for surfaces
- Piano Roll/event schema, Playlist commands, instrument synthesis, Mixer or effects
- Header/account/cloud/share/theme/help redesign beyond compact placement
- Full mobile editing parity

## Resolved decisions

- One primary surface and at most one modeless device are visible.
- Device geometry is product-owned and not user-managed in V2.
- Patterns have independently addressable Piano Roll surfaces, but only one primary is active.
- Effect window identity follows the effect instance, not its insert slot.
- `auditionTrackId` is transient per Pattern surface and never persisted.
- Switching to a different primary closes the visible device; interaction within the current primary does not.
- True modals are reserved for blocking decisions.
- Reload/project switch restores a safe Piano Roll rather than a saved workspace layout.



