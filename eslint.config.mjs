import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// All restrictions share this array so adding the UI ratchet cannot replace
// the existing tooltip rule. iframe title names a frame rather than a tooltip.
const titleSelectors = [{
  selector: "JSXOpeningElement[name.name=/^[a-z]/][name.name!='iframe'] > JSXAttribute[name.name='title']",
  message: "Use <Tip label=\"…\"> from '@/components/ui/tip' instead of the title attribute.",
}, {
  selector: "JSXOpeningElement:matches([name.name=/^(Button|Link|NodeViewWrapper|\\w+Trigger)$/], [name.type='JSXMemberExpression']) > JSXAttribute[name.name='title']",
  message: "This component passes title to the DOM. Wrap it in <Tip label=\"…\"> from '@/components/ui/tip' instead.",
}];
const capitalLabelSelector = {
  selector: "JSXText[value=/^(?=[^a-z]*$)(?:[^A-Z]*[A-Z]){3}/]",
  message: "Write labels in sentence case. Add the uppercase class if classic needs capitals.",
};
const uiSystemSelectors = [...titleSelectors, {
  // :has searches className's AST, including strings in cn(), branches and
  // template parts. Separate searches also catch cn('border', 'rounded-md').
  selector: String.raw`JSXOpeningElement[name.name=/^(button|a)$/]:not(:has(> JSXAttribute[name.name='data-slot'])):has(> JSXAttribute[name.name='className']:has(:matches(Literal[value=/(^|\s|:)border\b/], TemplateElement[value.raw=/(^|\s|:)border\b/]))):has(> JSXAttribute[name.name='className']:has(:matches(Literal[value=/(^|\s|:)rounded\b/], TemplateElement[value.raw=/(^|\s|:)rounded\b/])))`,
  message: "Give this bordered control a shared data-slot from docs/ui-system.md, or use a shared UI component.",
}, capitalLabelSelector];

// Intentional technical acronyms and older source labels. Paths, not globs:
// a new file always joins the ratchet. Each entry is removed after its labels
// and controls pass the full uiSystemSelectors array.
const uiSystemLegacyFiles = [
  "src/app/dev/execution-chat/page.tsx", // Synthetic harness controls, outside the product UI.
  "src/app/integrations-test/page.tsx", // Connector diagnostics intentionally keep their standalone drawing.
  "src/components/settings/sections/api-transport.tsx", // HTTP is the protocol name.
  "src/components/workspaces/worktree-scripts-section.tsx", // PORT and $RI_SOURCE_CHECKOUT_PATH are literal code.
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Keep `node:crypto` out of the client bundle.
    //
    // `src/lib/auth/tokens.ts` imports `node:crypto` at module scope, so any
    // component importing from it pulls in the crypto-browserify polyfill —
    // ~457KB, landing in the main shell chunk that every route blocks on.
    // The only thing the UI ever wanted was `tokenDisplay`, a pure string
    // formatter, which now lives in the crypto-free `token-display`.
    //
    // Worth a lint rule because the mistake is invisible in review: the two
    // imports are one word apart and both typecheck.
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/auth/tokens",
          message:
            "Pulls node:crypto (~457KB) into the client bundle. Import tokenDisplay from '@/lib/auth/token-display' instead; hashing and generation are server-only.",
        }],
      }],
    },
  },
  {
    files: ["src/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...uiSystemSelectors] },
  },
  {
    // Installed primitives own their drawing. Source labels still use sentence case.
    files: ["src/components/ui/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...titleSelectors, capitalLabelSelector] },
  },
  {
    // Shrink this list as the remaining legacy labels are reviewed. Keep the
    // tooltip checks here: flat config replaces this entire rule, not its selectors.
    files: uiSystemLegacyFiles,
    rules: { "no-restricted-syntax": ["error", ...titleSelectors] },
  },
  {
    // Shared operations all receive input and request metadata. A leading
    // underscore marks the pieces that this particular operation does not need.
    files: ["src/lib/server/operations/**/*.ts"],
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output of `pnpm smoke:*` (NEXT_DIST_DIR), gitignored like .next.
    ".next-smoke/**",
    // Desktop builds, disposable homes and packaged apps are generated artifacts.
    ".next-desktop/**",
    ".next-desktop-dev/**",
    ".electron-demo/**",
    "release/**",
    // Gitignored local material that is not this app's source: reference
    // clones, contributor scratch, and the CLI bundle.
    "examples/**",
    ".reference/**",
    "personal/**",
    "dist/**",
    "packages/*/dist/**",
  ]),
]);

export default eslintConfig;
