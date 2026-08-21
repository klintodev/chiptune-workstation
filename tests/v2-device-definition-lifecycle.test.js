import assert from "node:assert/strict";
import test from "node:test";

import {
  KLINTO_CHIP_DEFINITION,
  KLINTO_DELAY_DEFINITION,
  KLINTO_DRUMS_DEFINITION,
  KLINTO_FILTER_DEFINITION,
} from "../src/v2/audio/device-registry.js";

const DEFINITIONS = Object.freeze([
  KLINTO_CHIP_DEFINITION,
  KLINTO_DRUMS_DEFINITION,
  KLINTO_FILTER_DEFINITION,
  KLINTO_DELAY_DEFINITION,
]);

test("every closed device definition owns migration and exact bounded UI metadata", () => {
  for (const [index, definition] of DEFINITIONS.entries()) {
    const instance = definition.createDefault(`device-${index + 1}`);
    assert.deepEqual(definition.migrate(instance), instance);
    assert.deepEqual(Object.keys(definition.ui.parameters), definition.paramKeys);
    assert.equal(Object.isFrozen(definition.ui.parameters), true);
    assert.throws(
      () => definition.migrate({ ...instance, version: definition.version + 1 }),
      /Unsupported|type\/version/,
    );
  }
});

test("definition-owned UI factories and runtime/UI disposal are explicit and idempotent", () => {
  let receivedDefinition = null;
  let disposed = false;
  const editor = KLINTO_CHIP_DEFINITION.createUI({
    createEditor(options) {
      receivedDefinition = options.definition;
      return {
        dispose() {
          if (disposed) return false;
          disposed = true;
          return true;
        },
      };
    },
  });
  assert.equal(receivedDefinition, KLINTO_CHIP_DEFINITION);
  assert.equal(KLINTO_CHIP_DEFINITION.disposeUI(editor), true);
  assert.equal(KLINTO_CHIP_DEFINITION.disposeUI(editor), false);
  assert.throws(() => KLINTO_CHIP_DEFINITION.createUI(), /editor host/);
  assert.throws(
    () => KLINTO_CHIP_DEFINITION.createUI({ createEditor: () => ({}) }),
    /disposable editor/,
  );

  let runtimeDisposed = false;
  const runtime = {
    dispose() {
      if (runtimeDisposed) return false;
      runtimeDisposed = true;
      return true;
    },
  };
  assert.equal(KLINTO_DELAY_DEFINITION.disposeRuntime(runtime), true);
  assert.equal(KLINTO_DELAY_DEFINITION.disposeRuntime(runtime), false);
  assert.throws(() => KLINTO_FILTER_DEFINITION.disposeRuntime({}), /runtime.*disposal/);
});

test("each first-party Instrument definition has one shared synth lifecycle for every surface", () => {
  for (const definition of [KLINTO_CHIP_DEFINITION, KLINTO_DRUMS_DEFINITION]) {
    assert.equal(typeof definition.adaptVoice, "function");
    assert.equal(typeof definition.getTailSeconds, "function");
    assert.equal(definition.synthAdapters.live, definition.createSynthRuntime);
    assert.equal(definition.synthAdapters.offline, definition.createSynthRuntime);
    assert.equal(definition.synthAdapters.public, definition.createSynthRuntime);
    assert.equal(Object.isFrozen(definition.synthAdapters), true);
  }
});
