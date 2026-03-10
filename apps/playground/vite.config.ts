import { defineConfig } from "vite";
import { filament } from "../../packages/vite-plugin/src/index.js";

export default defineConfig({
  plugins: [filament()],
});
