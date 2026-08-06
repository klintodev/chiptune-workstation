import { expect, test } from "@playwright/test";
import { build } from "esbuild";

const MAX_SAMPLE_DIFFERENCE = 1e-5;
const RMS_SAMPLE_DIFFERENCE = 1e-6;
const PINNED_SAMPLE_RATES = Object.freeze([44_100, 48_000]);
const DETERMINISTIC_WAVEFORMS = Object.freeze([
  "pulse12",
  "pulse25",
  "square",
  "triangle",
  "sawtooth",
]);

let browserHarness;

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    format: "iife",
    logLevel: "silent",
    platform: "browser",
    stdin: {
      contents: `
        import {
          createArrangementRenderPlan,
          renderArrangementOffline,
        } from "./src/audio/offline-arrangement-renderer.js";
        import { createDefaultProject } from "./src/state/project-state.js";
        import {
          createV2ArrangementRenderPlan,
          renderV2ArrangementOffline,
        } from "./src/v2/audio/offline-renderer.js";
        import {
          KLINTO_CHIP_SYNTH_ADAPTERS,
          RENDER_PLAN_ADAPTERS,
          createRenderPlan,
        } from "./src/v2/audio/index.js";
        import { migrateProjectToV7 } from "./src/v2/domain/migration.js";

        function createFixture(waveform, { noiseMatrix = false } = {}) {
          const project = structuredClone(createDefaultProject());
          project.metadata.title = "Pinned audio parity";
          project.transport.bpm = 120;
          project.transport.masterVolume = 0.63;
          project.tracks[0].instrument = {
            voiceType: waveform,
            octaveOffset: waveform === "pulse25" ? -1 : 0,
            volume: 0.57,
            attackSeconds: 0.008,
            releaseSeconds: 0.09,
          };
          project.tracks[0].mixer = {
            muted: false,
            pan: -0.37,
            solo: false,
            volume: 0.74,
          };
          project.patterns[0].steps = Array.from({ length: noiseMatrix ? 32 : 4 }, () => null);
          if (noiseMatrix) {
            for (let index = 0; index < project.patterns[0].steps.length; index += 1) {
              project.patterns[0].steps[index] = {
                gate: index % 2 === 0 ? 0.75 : 1,
                note: 60 + index % 3,
                volume: 0.68 + (index % 4) * 0.04,
              };
            }
          } else {
            project.patterns[0].steps[0] = { gate: 0.75, note: 60, volume: 0.73 };
            project.patterns[0].steps[2] = { gate: 0.25, note: 67, volume: 0.61 };
            project.patterns[0].steps[3] = { gate: 1, note: 60, volume: 0 };
          }
          project.tracks[0].clips = [{ id: "clip-parity", patternId: "pattern-1", startStep: 0 }];
          return project;
        }

        function bufferChannels(buffer) {
          return Array.from(
            { length: buffer.numberOfChannels },
            (_, channel) => new Float32Array(buffer.getChannelData(channel)),
          );
        }

        function peak(channels) {
          let value = 0;
          for (const channel of channels) {
            for (const sample of channel) value = Math.max(value, Math.abs(sample));
          }
          return value;
        }

        function normalized(channels) {
          const maximum = peak(channels);
          const scale = maximum === 0 ? 1 : 1 / maximum;
          return channels.map((channel) => Float32Array.from(channel, (sample) => sample * scale));
        }

        function sampleDifference(leftChannels, rightChannels) {
          const left = normalized(leftChannels);
          const right = normalized(rightChannels);
          const channelCount = Math.max(left.length, right.length);
          let maximum = 0;
          let squared = 0;
          let sampleCount = 0;
          for (let channel = 0; channel < channelCount; channel += 1) {
            const leftSamples = left[channel] ?? new Float32Array();
            const rightSamples = right[channel] ?? new Float32Array();
            const length = Math.max(leftSamples.length, rightSamples.length);
            for (let index = 0; index < length; index += 1) {
              const difference = (leftSamples[index] ?? 0) - (rightSamples[index] ?? 0);
              maximum = Math.max(maximum, Math.abs(difference));
              squared += difference * difference;
            }
            sampleCount += length;
          }
          return {
            maximum,
            rms: Math.sqrt(squared / Math.max(1, sampleCount)),
          };
        }

        function signalCharacteristics(channels, comparisonLength) {
          const samples = channels[0].subarray(0, comparisonLength);
          let peakValue = 0;
          let squared = 0;
          let differenceSquared = 0;
          let previous = samples[0] ?? 0;
          let lastAudibleFrame = -1;
          for (let index = 0; index < samples.length; index += 1) {
            const sample = samples[index];
            peakValue = Math.max(peakValue, Math.abs(sample));
            squared += sample * sample;
            const difference = sample - previous;
            differenceSquared += difference * difference;
            previous = sample;
            if (Math.abs(sample) > 1e-4) lastAudibleFrame = index;
          }
          return {
            lastAudibleFrame,
            peak: peakValue,
            rms: Math.sqrt(squared / Math.max(1, samples.length)),
            spectralRoughness: Math.sqrt(differenceSquared / Math.max(Number.EPSILON, squared)),
          };
        }

        async function renderPair(waveform, sampleRate, options) {
          const legacy = createFixture(waveform, options);
          const migrated = migrateProjectToV7(legacy);
          const legacyPlan = createArrangementRenderPlan(legacy, { sampleRate });
          const v7Plan = createV2ArrangementRenderPlan(migrated, { sampleRate });
          const [legacyBuffer, v7Result] = await Promise.all([
            renderArrangementOffline(legacy, { sampleRate }),
            renderV2ArrangementOffline(migrated, { sampleRate }),
          ]);
          const legacyChannels = bufferChannels(legacyBuffer);
          const v7Channels = bufferChannels(v7Result.audioBuffer);
          return {
            legacy,
            legacyBufferSampleRate: legacyBuffer.sampleRate,
            legacyChannels,
            legacyPlan,
            migrated,
            sampleRate,
            v7BufferSampleRate: v7Result.audioBuffer.sampleRate,
            v7Channels,
            v7Plan,
          };
        }

        async function runDeterministic() {
          const results = [];
          for (const sampleRate of [44_100, 48_000]) {
            for (const waveform of ["pulse12", "pulse25", "square", "triangle", "sawtooth"]) {
              const pair = await renderPair(waveform, sampleRate);
              results.push({
                difference: sampleDifference(pair.legacyChannels, pair.v7Channels),
                legacyPeak: peak(pair.legacyChannels),
                renderedLegacySampleRate: pair.legacyBufferSampleRate,
                renderedV7SampleRate: pair.v7BufferSampleRate,
                legacySampleRate: pair.legacyPlan.sampleRate,
                sampleRate,
                v7Peak: peak(pair.v7Channels),
                waveform,
              });
            }
          }
          return {
            adaptersShared: KLINTO_CHIP_SYNTH_ADAPTERS.live === KLINTO_CHIP_SYNTH_ADAPTERS.offline
              && KLINTO_CHIP_SYNTH_ADAPTERS.live === KLINTO_CHIP_SYNTH_ADAPTERS.public
              && RENDER_PLAN_ADAPTERS.live === RENDER_PLAN_ADAPTERS.offline
              && RENDER_PLAN_ADAPTERS.live === RENDER_PLAN_ADAPTERS.public,
            results,
          };
        }

        async function runNoise() {
          const pair = await renderPair("noise", 44_100, { noiseMatrix: true });
          const comparisonLength = Math.min(
            pair.legacyChannels[0].length,
            pair.v7Channels[0].length,
          );
          const legacyEvent = pair.legacyPlan.tracks[0].notes[0];
          const v7Event = createRenderPlan(pair.migrated, { mode: "song" }).events[0];
          return {
            legacy: signalCharacteristics(pair.legacyChannels, comparisonLength),
            projection: {
              legacy: {
                attackSeconds: legacyEvent.attackSeconds,
                durationSeconds: legacyEvent.durationSeconds,
                frequency: legacyEvent.frequency,
                intensity: legacyEvent.intensity,
                releaseSeconds: legacyEvent.releaseSeconds,
                startSeconds: legacyEvent.startTime,
                waveform: legacyEvent.type,
              },
              v7: {
                attackSeconds: v7Event.attackSeconds,
                durationSeconds: v7Event.durationSeconds,
                frequency: v7Event.frequencyHz,
                intensity: v7Event.velocity,
                releaseSeconds: v7Event.releaseSeconds,
                startSeconds: v7Event.startSeconds,
                waveform: v7Event.waveform,
              },
            },
            v7: signalCharacteristics(pair.v7Channels, comparisonLength),
          };
        }

        globalThis.__klintoAudioParity = Object.freeze({ runDeterministic, runNoise });
      `,
      resolveDir: root,
      sourcefile: "audio-parity-browser-harness.js",
    },
    target: ["es2022"],
    write: false,
  });
  browserHarness = result.outputFiles[0].text;
});

test.beforeEach(async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: browserHarness });
});

test("migrated deterministic voices meet V1/V7 max and RMS sample tolerances at pinned rates", async ({ page }) => {
  test.setTimeout(120_000);
  const report = await page.evaluate(() => globalThis.__klintoAudioParity.runDeterministic());

  expect(report.adaptersShared).toBe(true);
  expect(report.results).toHaveLength(PINNED_SAMPLE_RATES.length * DETERMINISTIC_WAVEFORMS.length);
  for (const result of report.results) {
    expect(PINNED_SAMPLE_RATES).toContain(result.sampleRate);
    expect(DETERMINISTIC_WAVEFORMS).toContain(result.waveform);
    expect(result.legacySampleRate).toBe(result.sampleRate);
    expect(result.renderedLegacySampleRate).toBe(result.sampleRate);
    expect(result.renderedV7SampleRate).toBe(result.sampleRate);
    expect(result.legacyPeak).toBeGreaterThan(0);
    expect(Math.abs(result.legacyPeak - result.v7Peak)).toBeLessThanOrEqual(MAX_SAMPLE_DIFFERENCE);
    expect(result.difference.maximum).toBeLessThanOrEqual(MAX_SAMPLE_DIFFERENCE);
    expect(result.difference.rms).toBeLessThanOrEqual(RMS_SAMPLE_DIFFERENCE);
  }
});

test("unseeded noise preserves projection, envelope duration, RMS and spectral characteristics", async ({ page }) => {
  test.setTimeout(120_000);
  const report = await page.evaluate(() => globalThis.__klintoAudioParity.runNoise());

  expect(report.projection.v7).toEqual(report.projection.legacy);
  expect(Math.abs(report.legacy.peak - report.v7.peak)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(report.legacy.rms - report.v7.rms) / report.legacy.rms).toBeLessThanOrEqual(0.08);
  expect(
    Math.abs(report.legacy.spectralRoughness - report.v7.spectralRoughness)
      / report.legacy.spectralRoughness,
  ).toBeLessThanOrEqual(0.25);
  expect(Math.abs(report.legacy.lastAudibleFrame - report.v7.lastAudibleFrame)).toBeLessThanOrEqual(2);
});
