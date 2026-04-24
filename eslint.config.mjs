import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "dist/**",
      ".react-router/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "worker-configuration.d.ts",
      "coverage/**",
      "supabase/migrations/**",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware linting — only for source files actually covered by
    // tsconfig.cloudflare.json (app/** and workers/**).
    files: ["app/**/*.{ts,tsx}", "workers/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: {
          // .well-known.$.tsx starts with a dot so tsconfig's `app/**/*`
          // glob doesn't pick it up. Let ESLint fall back to the default
          // project for that one file.
          allowDefaultProject: ["app/routes/.well-known.$.tsx"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // High-value rules from todo/RELIABILITY.md Phase 5.
      // Existing violations at the time of Phase 5b were snapshotted
      // with eslint-disable-next-line so `error` here only catches
      // NEW instances.
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // Noise tamers — these rules catch a lot and mostly aren't the
      // bug classes we care about. Turn off to keep the signal on the
      // five listed above.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-empty": "off",
      "no-empty-pattern": "off",
      "no-case-declarations": "off",
      "no-useless-escape": "off",
      "no-prototype-builtins": "off",
      "prefer-const": "off",
    },
  },
  {
    // Tests, E2E, and config files: syntax-only linting (no project
    // service), and no bug-class rules. Just keep them parsing cleanly.
    files: [
      "e2e/**/*.{ts,tsx}",
      "e2e-smoke/**/*.{ts,tsx}",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/__tests__/**/*.{ts,tsx}",
      "*.config.{ts,mjs,js}",
      "vitest.setup.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-console": "off",
    },
  }
);
