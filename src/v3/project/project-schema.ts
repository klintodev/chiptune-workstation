import { z } from "zod";

import { getOwnEntity } from "./entity-collection";
import {
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  TICKS_PER_QUARTER,
  type Clip,
  type EntityCollection,
  type InstrumentDefinition,
  type JsonValue,
  type Note,
  type Pattern,
  type Project,
  type ProjectFile,
  type Track,
  type TransportSettings,
} from "./project";

const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "IDs may contain letters, numbers, underscores, and hyphens.",
  );

const nameSchema = z.string().trim().min(1).max(100);
const timestampSchema = z.string().datetime({ offset: true });
const unitIntervalSchema = z.number().finite().min(0).max(1);
const tickSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

function createEntityCollectionSchema<T extends { id: string }>(
  entitySchema: z.ZodType<T>,
  { maximum, minimum = 0 }: { maximum: number; minimum?: number },
): z.ZodType<EntityCollection<T>> {
  return z
    .object({
      byId: z.record(idSchema, entitySchema),
      order: z.array(idSchema).max(maximum),
    })
    .strict()
    .superRefine((collection, context) => {
      if (collection.order.length < minimum) {
        context.addIssue({
          code: "custom",
          message: `Collection requires at least ${minimum} item${minimum === 1 ? "" : "s"}.`,
          path: ["order"],
        });
      }

      const orderedIds = new Set<string>();
      for (const [index, id] of collection.order.entries()) {
        if (orderedIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate ordered ID: ${id}`,
            path: ["order", index],
          });
        }
        orderedIds.add(id);
        if (!getOwnEntity(collection, id)) {
          context.addIssue({
            code: "custom",
            message: `Ordered ID has no entity: ${id}`,
            path: ["order", index],
          });
        }
      }

      for (const [id, entity] of Object.entries(collection.byId)) {
        if (entity.id !== id) {
          context.addIssue({
            code: "custom",
            message: `Entity ID ${entity.id} does not match key ${id}.`,
            path: ["byId", id, "id"],
          });
        }
        if (!orderedIds.has(id)) {
          context.addIssue({
            code: "custom",
            message: `Entity is missing from order: ${id}`,
            path: ["byId", id],
          });
        }
      }
    });
}

export const noteSchema: z.ZodType<Note> = z
  .object({
    id: idSchema,
    patternId: idSchema,
    pitch: z.number().int().min(0).max(127),
    startTick: tickSchema,
    durationTicks: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    velocity: unitIntervalSchema,
  })
  .strict();

export const patternSchema: z.ZodType<Pattern> = z
  .object({
    id: idSchema,
    name: nameSchema,
    lengthTicks: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const clipSchema: z.ZodType<Clip> = z
  .object({
    id: idSchema,
    trackId: idSchema,
    patternId: idSchema,
    startTick: tickSchema,
  })
  .strict();

export const instrumentDefinitionSchema: z.ZodType<InstrumentDefinition> = z
  .object({
    id: idSchema,
    name: nameSchema,
    kind: z.string().trim().min(1).max(128),
    parameters: z.record(z.string(), jsonValueSchema),
  })
  .strict();

export const trackSchema: z.ZodType<Track> = z
  .object({
    id: idSchema,
    name: nameSchema,
    instrumentId: idSchema,
    volume: unitIntervalSchema,
    pan: z.number().finite().min(-1).max(1),
    muted: z.boolean(),
    solo: z.boolean(),
  })
  .strict();

export const transportSettingsSchema: z.ZodType<TransportSettings> = z
  .object({
    bpm: z.number().finite().min(20).max(400),
    ppq: z.literal(TICKS_PER_QUARTER),
    loop: z
      .object({
        enabled: z.boolean(),
        startTick: tickSchema,
        endTick: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
  })
  .strict()
  .superRefine((transport, context) => {
    if (transport.loop.endTick <= transport.loop.startTick) {
      context.addIssue({
        code: "custom",
        message: "Loop endTick must be greater than startTick.",
        path: ["loop", "endTick"],
      });
    }
  });

export const projectSchema: z.ZodType<Project> = z
  .object({
    id: idSchema,
    name: nameSchema,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    transport: transportSettingsSchema,
    instruments: createEntityCollectionSchema(instrumentDefinitionSchema, {
      maximum: 64,
      minimum: 1,
    }),
    patterns: createEntityCollectionSchema(patternSchema, {
      maximum: 1_024,
      minimum: 1,
    }),
    notes: createEntityCollectionSchema(noteSchema, { maximum: 8_192 }),
    tracks: createEntityCollectionSchema(trackSchema, { maximum: 64, minimum: 1 }),
    clips: createEntityCollectionSchema(clipSchema, { maximum: 8_192 }),
    master: z
      .object({
        volume: unitIntervalSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((project, context) => {
    if (Date.parse(project.updatedAt) < Date.parse(project.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "updatedAt cannot be earlier than createdAt.",
        path: ["updatedAt"],
      });
    }

    for (const trackId of project.tracks.order) {
      const track = getOwnEntity(project.tracks, trackId);
      if (track && !getOwnEntity(project.instruments, track.instrumentId)) {
        context.addIssue({
          code: "custom",
          message: `Track ${track.id} references unknown instrument ${track.instrumentId}.`,
          path: ["tracks", "byId", trackId, "instrumentId"],
        });
      }
    }

    for (const noteId of project.notes.order) {
      const note = getOwnEntity(project.notes, noteId);
      if (!note) continue;
      const pattern = getOwnEntity(project.patterns, note.patternId);
      if (!pattern) {
        context.addIssue({
          code: "custom",
          message: `Note ${note.id} references unknown pattern ${note.patternId}.`,
          path: ["notes", "byId", noteId, "patternId"],
        });
      } else if (note.startTick > pattern.lengthTicks - note.durationTicks) {
        context.addIssue({
          code: "custom",
          message: `Note ${note.id} extends beyond pattern ${pattern.id}.`,
          path: ["notes", "byId", noteId, "durationTicks"],
        });
      }
    }

    for (const clipId of project.clips.order) {
      const clip = getOwnEntity(project.clips, clipId);
      if (!clip) continue;
      if (!getOwnEntity(project.tracks, clip.trackId)) {
        context.addIssue({
          code: "custom",
          message: `Clip ${clip.id} references unknown track ${clip.trackId}.`,
          path: ["clips", "byId", clipId, "trackId"],
        });
      }
      const pattern = getOwnEntity(project.patterns, clip.patternId);
      if (!pattern) {
        context.addIssue({
          code: "custom",
          message: `Clip ${clip.id} references unknown pattern ${clip.patternId}.`,
          path: ["clips", "byId", clipId, "patternId"],
        });
      } else if (clip.startTick > Number.MAX_SAFE_INTEGER - pattern.lengthTicks) {
        context.addIssue({
          code: "custom",
          message: `Clip ${clip.id} endTick exceeds the safe integer range.`,
          path: ["clips", "byId", clipId, "startTick"],
        });
      }
    }
  });

export const projectFileSchema: z.ZodType<ProjectFile> = z
  .object({
    format: z.literal(PROJECT_FORMAT),
    formatVersion: z.literal(PROJECT_FORMAT_VERSION),
    project: projectSchema,
  })
  .strict();

export function parseProject(input: unknown): Project {
  return projectSchema.parse(input);
}

export function parseProjectFile(input: unknown): ProjectFile {
  return projectFileSchema.parse(input);
}
