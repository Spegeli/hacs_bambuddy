// Builds the one module the integration ships: custom_components/bambuddy/
// frontend/bambuddy-card.js. The same sources and the same esbuild give the
// same bytes; CI rebuilds and fails when the committed file differs.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "../custom_components/bambuddy/frontend/bambuddy-card.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "eof",
  logLevel: "warning",
});
