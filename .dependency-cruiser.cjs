/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-cross-module-internals",
      severity: "error",
      comment:
        "A module's internals are private; other modules may only import its service.ts/index.ts entry point.",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/[^/]+/(?!(service|index)\\.ts$).+",
        pathNot: "^src/modules/$1/",
      },
    },
    {
      name: "no-app-into-module-internals",
      severity: "error",
      comment: "app/ may only import a module's service.ts/index.ts entry point, never its internals.",
      from: { path: "^src/app/" },
      to: { path: "^src/modules/[^/]+/(?!(service|index)\\.ts$).+" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
