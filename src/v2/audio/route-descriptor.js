function freezeList(values) {
  return Object.freeze(values);
}

function describeEffect(effect, ownerId, slot) {
  return Object.freeze({
    bypassed: effect.bypassed,
    instanceId: effect.instanceId,
    kind: "effect",
    ownerId,
    slot,
    type: effect.type,
    version: effect.version,
  });
}

/** Mute always wins; when any Track is soloed only unmuted solo Tracks pass. */
export function selectAudibleTrackIds(tracks) {
  if (!Array.isArray(tracks)) throw new TypeError("Tracks must be an array.");
  const anySolo = tracks.some((track) => track.mixer?.solo === true);
  return freezeList(tracks
    .filter((track) => track.mixer?.muted !== true && (!anySolo || track.mixer?.solo === true))
    .map((track) => track.id));
}

export function isTrackAudible(tracks, trackId) {
  if (!tracks.some((track) => track.id === trackId)) {
    throw new RangeError(`Unknown Track: ${trackId}`);
  }
  return selectAudibleTrackIds(tracks).includes(trackId);
}

/**
 * Produce a declarative route without constructing nodes. Every Track points
 * at the exact same `masterBus` object, while the Master insert chain exists in
 * only the one `master` descriptor. This makes accidental per-Track Master
 * processing observable in pure tests before an AudioContext exists.
 */
export function describeProjectAudioRoute(project) {
  if (!project || typeof project !== "object" || !Array.isArray(project.tracks)) {
    throw new TypeError("A Project with Tracks is required.");
  }
  const audibleTrackIds = selectAudibleTrackIds(project.tracks);
  const audible = new Set(audibleTrackIds);
  const masterBus = Object.freeze({ id: "master", kind: "master-summing-bus" });
  const tracks = freezeList(project.tracks.map((track) => {
    const insertChain = freezeList((track.mixer?.effects ?? [])
      .map((effect, slot) => describeEffect(effect, track.id, slot)));
    const channelGain = audible.has(track.id) ? track.mixer.volume : 0;
    return Object.freeze({
      audible: audible.has(track.id),
      channelGain,
      destination: masterBus,
      instrument: Object.freeze({
        instanceId: track.instrument.instanceId,
        kind: "instrument",
        ownerId: track.id,
        type: track.instrument.type,
        version: track.instrument.version,
      }),
      insertChain,
      pan: track.mixer.pan,
      stages: freezeList([
        "instrument-output",
        "track-inserts",
        "track-volume-mute-solo",
        "track-pan",
        "track-post-fader-meter",
        "master-summing-bus",
      ]),
      trackId: track.id,
    });
  }));
  const masterEffects = project.mixer?.master?.effects ?? [];
  const master = Object.freeze({
    destination: Object.freeze({ id: "output", kind: "audio-output" }),
    insertChain: freezeList(masterEffects
      .map((effect, slot) => describeEffect(effect, "master", slot))),
    source: masterBus,
    stages: freezeList([
      "master-summing-bus",
      "master-inserts",
      "master-volume",
      "master-meter",
      "output",
    ]),
    volume: project.mixer?.master?.volume,
  });
  return Object.freeze({ audibleTrackIds, master, masterBus, tracks });
}

export const buildAudioRouteDescriptor = describeProjectAudioRoute;
