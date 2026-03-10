/// <reference path="./babel.d.ts" />

import type { Plugin } from "vite";
import { transformFilamentModule } from "./compiler/transform.js";

export interface FilamentPluginOptions {
  include?: RegExp;
}

export function filament(options: FilamentPluginOptions = {}): Plugin {
  const include = options.include ?? /\.[jt]sx$/;

  return {
    name: "filament",
    enforce: "pre",
    config() {
      return {
        esbuild: {
          jsx: "preserve",
        },
      };
    },
    transform(code, id, transformOptions) {
      if (!include.test(id)) {
        return null;
      }

      return transformFilamentModule(code, id, {
        ssr: Boolean(transformOptions?.ssr),
      });
    },
  };
}
