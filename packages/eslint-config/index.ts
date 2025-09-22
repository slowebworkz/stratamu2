import js from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import type { ConfigArray } from "typescript-eslint";
import { config, configs } from "typescript-eslint";

const eslintConfig: ConfigArray = config(
  {
    ignores: [
      "node_modules",
      "!.*",
      "**/dist",
      "**/build",
      "apps/nextjs/.next",
    ],
  },
  {
    extends: [js.configs.recommended, ...configs.recommended],
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  eslintPluginPrettierRecommended,
);

export default eslintConfig;
