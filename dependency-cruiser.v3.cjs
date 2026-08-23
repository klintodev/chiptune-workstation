const V3 = "^src/v3/";
const layer = (name) => `^src/v3/${name}(?:/|$)`;
const allowedV3Layers = (...names) => `^src/v3/(?:${names.join("|")})(?:/|$)`;

const TEST_MODULE = "[.](?:spec|test)[.](?:ts|tsx)$";
const NPM_MODULE = "^node_modules/";
const ZOD_MODULE = "^node_modules/zod(?:/|$)";

module.exports = {
  forbidden: [
    {
      name: "v3-no-circular-dependencies",
      severity: "error",
      from: { path: V3 },
      to: { circular: true },
    },
    {
      name: "v3-no-unresolved-dependencies",
      severity: "error",
      from: { path: V3 },
      to: { couldNotResolve: true },
    },
    {
      name: "v3-shared-is-foundational",
      severity: "error",
      from: { path: layer("shared") },
      to: {
        path: V3,
        pathNot: allowedV3Layers("shared"),
      },
    },
    {
      name: "v3-project-imports-shared-only",
      severity: "error",
      from: { path: layer("project") },
      to: {
        path: V3,
        pathNot: allowedV3Layers("project", "shared"),
      },
    },
    {
      name: "v3-playback-imports-project-and-shared-only",
      severity: "error",
      from: { path: layer("playback") },
      to: {
        path: V3,
        pathNot: allowedV3Layers("playback", "project", "shared"),
      },
    },
    {
      name: "v3-persistence-imports-project-and-shared-only",
      severity: "error",
      from: { path: layer("persistence") },
      to: {
        path: V3,
        pathNot: allowedV3Layers("persistence", "project", "shared"),
      },
    },
    {
      name: "v3-engine-imports-playback-and-shared-only",
      severity: "error",
      from: { path: layer("engine") },
      to: {
        path: V3,
        pathNot: allowedV3Layers("engine", "playback", "shared"),
      },
    },
    {
      name: "v3-project-only-uses-approved-external-dependencies",
      severity: "error",
      from: { path: layer("project"), pathNot: TEST_MODULE },
      to: {
        path: NPM_MODULE,
        pathNot: ZOD_MODULE,
      },
    },
    {
      name: "v3-shared-playback-and-engine-have-no-external-runtime-dependencies",
      severity: "error",
      from: {
        path: allowedV3Layers("shared", "playback", "engine"),
        pathNot: TEST_MODULE,
      },
      to: { path: NPM_MODULE },
    },
    {
      name: "v3-persistence-dependencies-must-be-explicitly-approved",
      severity: "error",
      from: { path: layer("persistence"), pathNot: TEST_MODULE },
      to: { path: NPM_MODULE },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.v3.json" },
    tsPreCompilationDeps: true,
  },
};
