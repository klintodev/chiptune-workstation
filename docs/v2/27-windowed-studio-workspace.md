# PRD 27: Focused Studio workspace

Status: Draft  
Release: Klinto Studio V2  
Depends on: PRD 26

## Description

Replace V1's stacked/tabbed workstation with a bounded desktop composition stack: persistent Playlist beneath one draggable modeless Piano Roll and at most one draggable modeless first-party device, with Mixer retained as the exclusive primary surface.

â€œWindowâ€ means an independently addressable in-app surface with its own title, lifecycle and focus return. It does not mean a freeform operating-system desktop. Patterns receive their own Piano Roll surfaces; instruments and effects receive their own modeless device surfaces.

## Product outcome

A new desktop project opens Playlist with its inline Pattern-library `<details>` expanded and Pattern 1's Piano Roll above it. The user may move the fixed-size Piano Roll, open/move one Instrument or Effect, or enter exclusive Mixer without losing transport access or accumulating unbounded panels.

## Surface model

### 1. Global shell

On desktop the shell is one row with a maximum height of 72 CSS pixels. It contains only:

- compact project identity and save status;
- Return to start, Play/Pause, two-stage Stop (return to the playback cue, then return to tick 0) and the direct contextual V1 `↻` whole-Pattern/whole-Song loop toggle;
- Pattern/Song mode;
- compact tempo control plus the always-inline V1 Master slider and readout;
- audio setup appears when playback requires it, without a persistent Ready/status button;
- controls to focus/open Piano Roll, return to Playlist and enter/leave exclusive Mixer;
- the working direct dark/light toggle and recognisable V1 Klinto visual identity;
- a compact account control plus one secondary menu containing project management, help and share/publish actions;
- exactly one `V2 Beta` badge during Beta.

The shell never contains a visualiser, Pattern step grid, arrangement overview, device parameters or per-Track Mixer controls. It remains operable while a modeless device is open.

### 2. Desktop composition stack and exclusive Mixer

On desktop, Playlist fills the content area as the persistent base and contains a default-expanded, collapsible Pattern-library `<details>` section. Only one Piano Roll and at most one Instrument or Effect may appear as bounded modeless windows above it.

- The inline Pattern library may remain expanded while the Piano Roll and one device window coexist above Playlist.
- Their approved sizes are fixed; title-bar dragging changes only bounded session position and never musical data.
- Mixer is the only exclusive primary surface. Activating it removes Playlist and every modeless window from layout, tab order and the accessibility tree.
- Leaving Mixer restores a safe Playlist composition stack without stopping audio. Session state preserves valid Pattern viewport, selection and audition Track context.
- Composition windows hidden by exclusive Mixer perform no animation-frame or measurement work.

Pattern and Track selection use compact contextual controls in Piano Roll, Playlist and Mixer. V2 does not add a Rack or separate Keyboard window. Computer-key audition remains available under the conflict rules in PRD 28; any on-screen audition keyboard is collapsed/absent by default and embedded in the relevant surface.

### 3. Piano Roll window

At most one Piano Roll is visible above Playlist. It is modeless, fixed-size and non-resizable. Its visible Pattern title is an explicit rename control: pointer activation or Enter invokes the canonical Pattern rename command, while Space retains its global transport meaning. The remaining title bar is the bounded window drag handle. Opening a Pattern from the library or a clip reuses the window for that stable Pattern identity and focuses its editor. Close hides presentation only; it does not delete the Pattern.

The Piano Roll may remain open while the user edits Playlist or a device. It closes when its Pattern is deleted or when exclusive Mixer is activated; returning from Mixer restores the safe composition context rather than persisted geometry.

### 4. Device window

At most one Instrument or Effect editor may be visible above Playlist and may coexist with the Piano Roll.

- At 1366Ã—768 it is no larger than 720Ã—560 CSS pixels or 60vwÃ—75vh, whichever is smaller, opens at an approved default position, remains bounded when dragged, and scrolls internally when required.
- It is modeless: global transport and the shell remain available; there is no focus trap or `aria-modal`.
- Opening a second device closes the first presentation, then opens and focuses the requested device.
- Interacting with Playlist or Piano Roll does not close it, so the user can tweak the device while working underneath. Activating exclusive Mixer closes the visible Piano Roll/device presentation before hiding the composition stack.
- Close affects presentation only. The device's audio runtime and persisted parameters remain active.
- It is draggable only from its title bar and cannot be pinned, minimized, maximized or resized in V2.

Adding an effect does not automatically open its editor. Opening is a separate action.

### 5. Transient and modal UI

Menus, selects, tooltips and parameter popovers are transient UI. Destructive confirmations, incompatible-project recovery choices and other blocking decisions may use true modal dialogs with focus trapping and modal semantics.

Piano Roll, Playlist, Mixer, Instrument and Effect surfaces are never presented as modal dialogs.

## Identity and ownership

Surface identity is derived from stable domain identity:

- Piano Roll: Pattern ID
- Playlist base: Project ID
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
- Exclusive-Mixer-hidden composition surfaces and the replaced device contain no tabbable or screen-reader-reachable content.
- Escape closes the device only when focus is not inside a subcontrol that owns Escape; it does not close a primary surface.
- Browser Back behaviour is not repurposed for the desktop surface stack in V2.

## Desktop layout and chrome budget

Before shell implementation, Product and Design approve low-fidelity 1366Ã—768 and 1920Ã—1080 wireframes showing Playlist with expanded inline Pattern-library details beneath Piano Roll, a coexisting device, and exclusive Mixer. The windowed surfaces receive narrow-screen fullscreen wireframes; Pattern library remains inside Playlist.

Visual acceptance at 1366Ã—768 requires:

- shell height no greater than 72 CSS pixels;
- no page-level vertical or horizontal scrolling;
- Playlist base or exclusive Mixer reaches the bottom of the viewport;
- the Piano Roll is visually dominant while leaving useful Playlist context visible;
- the inline Pattern-library details open by default; bounded movement applies only to Piano Roll and device windows;
- no duplicate project, transport, Pattern or Track controls; the intentional inline Master slider remains available alongside Mixer;
- Piano Roll persistent header contains only Pattern identity, audition Track, active tool/snap and Add to Playlist; its Pattern title exposes the canonical rename action without consuming the remaining drag handle, and history/destructive actions are grouped, with no zoom buttons or Instrument launcher;
- opening a device does not reveal another permanent navigation rail or panel;
- dragging never changes approved fixed window size and does not produce page scrolling.

Exact styling is approved in wireframes rather than invented during infrastructure work.

## Narrow-screen behaviour

At the narrow-width breakpoint, the same domain surfaces become one fullscreen navigation view beneath a compact shell; the desktop Playlist base is not exposed behind another surface.

- Exactly one Playlist (including its inline Pattern-library details), Piano Roll, Mixer, Instrument or Effect surface is mounted/exposed.
- A device replaces the content view but remains non-modal: compact transport and Back/switcher stay reachable, with no focus trap or `aria-modal`.
- Back closes the device and restores its connected, visible, enabled launcher.
- Required V2 mobile behaviour is surface switching, transport, Piano Roll/Playlist viewing, explicit single-note create/select/delete, Instrument/Effect parameter editing, save/reload and safe focus.
- Full touch multi-selection, move/resize gestures, velocity gestures, clip rearrangement, desktop-style geometry and browser-history surface navigation are post-V2.

## Session state and project lifecycle

Surface state is session-local UI state, separate from undoable project state and persistence. It may include whether exclusive Mixer is active, active Pattern ID, Pattern viewport/selection, `auditionTrackId`, Pattern-library disclosure state, current device identity/opener and bounded Piano/device drag positions.

- New desktop project: Playlist base with Pattern-library details expanded and Pattern 1 Piano Roll at its approved position, no device.
- Reload: reset Piano/device geometry, expand the inline Pattern-library details, keep one safe current Pattern and open no device.
- Project open/switch/import: validate first, then reset to the safe default composition stack and repair IDs.
- Project deletion/replacement: dispose all old surface and device owners before rendering the replacement.
- Undo of a deleted object restores data but does not automatically reopen its presentation.

No window state, focus target, size, drag position or DOM identifier is saved in project JSON, cloud records, publications, browser storage or browser history. Windows are not resizable.

## Accessibility requirements

- Surface names include object context, for example `Pattern 3, Piano Roll` and `Track 1, Klinto Chip`.
- The exposed desktop composition stack or exclusive Mixer and current device state are programmatically determinable without announcing every focus change as an alert.
- Visual focus is always visible and meets contrast requirements.
- Keyboard operation reaches every launcher and Close control.
- At 200% zoom, the shell, primary title/actions, full device parameter set and Close remain reachable.
- Motion respects `prefers-reduced-motion`.
- Automated checks find no applicable WCAG 2.2 A/AA violation except a documented false positive with manual evidence.

## Acceptance criteria

### Desktop

- A new project at 1366Ã—768 shows compact shell, Playlist base with expanded Pattern-library details and Pattern 1 Piano Roll; Mixer, device and visualiser are absent.
- Piano Roll and device can each be dragged within bounds without resizing or changing Project data; reloading restores their approved defaults.
- Clicking the Piano Roll title or focusing it and pressing Enter renames the active Pattern through the canonical command, preserves the window position and returns focus to the same title; dragging the rest of the title bar still moves the window and Space still toggles transport.
- A Playlist ruler seek becomes the Song playback cue; the first Stop returns there and the second Stop returns to tick 0, including after Pause/Resume.
- Pattern library collapses inline within Playlist and has no geometry to restore.
- Opening Klinto Chip focuses its named editor; opening an Effect replaces it; closing returns to a valid visible origin while Piano Roll and Playlist remain available.
- Activating Mixer hides Playlist (including Pattern library), Piano Roll and device as one exclusive switch without stopping audio; leaving Mixer restores valid Pattern viewport/selection and focus.
- Mixer-hidden/replaced surfaces have no focusable or accessibility-tree descendants and perform no continuous visual work.
- Removing an owning Track while its device is open closes it, repairs focus and preserves open Pattern state with a repaired audition Track.
- There are no duplicate surface instances for one stable object ID.
- The header has no Ready/audio-status or Share button; Share is available inside the secondary Menu.
- The Projects modal presents New and Duplicate as its primary actions, without visible JSON Import or Download controls; conditional recovery download remains separate.

### Narrow screen

- At approximately 390Ã—844, Pattern â†’ Instrument â†’ Back â†’ Pattern and Mixer â†’ Effect â†’ Back â†’ Mixer restore their exact valid launchers.
- Transport and Back/switcher remain reachable on a device view.
- Previous views are absent from layout, tab order and the accessibility tree.

### Modal distinction

- A destructive confirmation traps/restores focus and has modal semantics.
- Instrument and Effect views do neither.

## Verification coverage

- Domain tests for surface reducer identity, opener validation, audition-Track repair and project lifecycle
- Component tests for persistent Playlist, exclusive Mixer and hidden-tree exclusion; manual review covers one-Piano/one-device bounds
- Keyboard focus journeys for open, replace, close, Track removal, Pattern deletion and project switch
- 1366Ã—768 no-page-scroll, bounded drag/fixed-size/default-geometry and chrome-budget assertions, including inline Master, direct `↻` loop and dark/light toggle
- 390Ã—844 single-fullscreen-surface navigation/focus smoke journey
- Leak checks for listeners, animation frames and device presentation owners

## Delivery slices

1. **Workbench fixtures:** generic primary and device hosts with fake objects; identity, focus and disposal tests.
2. **Approved wireframes/chrome budget:** desktop and mobile product sign-off before production shell styling.
3. **Shell and workspace switcher:** one-row shell with V1 loop/Master/theme controls, persistent Playlist composition host and exclusive Mixer behind the V2 flag.
4. **Pattern host:** one fixed-size bounded-draggable Piano Roll over Playlist, with replace/close/focus lifecycle and fullscreen narrow-width presentation.
5. **Device host:** one fixed-size bounded-draggable Instrument/Effect presentation, replace/close/focus lifecycle and fullscreen narrow-width navigation.
6. **Downstream adoption:** PRDs 28â€“31 populate the hosts; remove old tabs/stacked layout only after equivalent capabilities pass their own gates.

PRD 27 does not build a temporary production Mixer, Playlist or new audio feature.

## Out of scope

- Rack/channel-rack and separate Keyboard window
- Pinning, minimizing, maximizing, arbitrary resizing, unbounded/freeform movement, multiple visible Piano Rolls or multiple visible devices
- Saved layouts or geometry, workspace reset, detachable/browser windows or multi-monitor support
- Browser-history routing for surfaces
- Piano Roll/event schema, Playlist commands, instrument synthesis, Mixer or effects
- Header/account/cloud/share/theme/help redesign beyond compact placement
- Full mobile editing parity

## Resolved decisions

- Desktop Playlist is persistent beneath at most one modeless Piano Roll and one modeless device; Mixer is the exclusive primary.
- Only Piano Roll and device windows own fixed geometry and bounded movement; Pattern library is inline Playlist disclosure content.
- Patterns have independently addressable Piano Roll identities, but only one Piano Roll is visible.
- Narrow widths mount and expose exactly one fullscreen surface.
- Effect window identity follows the effect instance, not its insert slot.
- `auditionTrackId` is transient per Pattern surface and never persisted.
- Activating exclusive Mixer closes/hides the modeless composition presentations; Playlist/Piano interaction does not close the current device.
- True modals are reserved for blocking decisions.
- Reload/project switch restores safe Playlist with Pattern-library details expanded and Piano at its approved default rather than saved geometry.



