import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import uiSystem from "./scripts/eslint/ui-system.mjs";

// All restrictions share this array so adding the UI ratchet cannot replace
// the existing tooltip rule. iframe title names a frame rather than a tooltip.
const titleSelectors = [{
  selector: "JSXOpeningElement[name.name=/^[a-z]/][name.name!='iframe'] > JSXAttribute[name.name='title']",
  message: "Use <Tip label=\"…\"> from '@/components/ui/tip' instead of the title attribute.",
}, {
  selector: "JSXOpeningElement:matches([name.name=/^(Button|IconButton|ChipButton|ActionPrimitive|Card|Callout|MenuAction|StatusBadge|Meta|MetaItem|InlineAction|Field|TextArea|NativeSelect|SelectField|OverlaySurface|OverlayScrim|MenuSurface|ToastSurface|FormActions|FormLabel|FormDescription|(?:Dialog|Sheet|AlertDialog)(?:Content|Frame|Header|Footer|Title|Description|Body)|(?:Popover|Tooltip|HoverPreview)(?:Content|Frame)|DropdownMenu(?:Content|SubContent|Label|Separator|SubTrigger|Shortcut|CheckboxItem|RadioItem)|Select(?:Content|Item|Label|Separator)|Link|NodeViewWrapper|\\w+Trigger)$/], [name.type='JSXMemberExpression']) > JSXAttribute[name.name='title']",
  message: "This component passes title to the DOM. Wrap it in <Tip label=\"…\"> from '@/components/ui/tip' instead.",
}];
const capitalLabelSelector = {
  selector: "JSXText[value=/^(?=[^a-z]*$)(?:[^A-Z]*[A-Z]){3}/]",
  message: "Write labels in sentence case.",
};
const uiSystemSelectors = [...titleSelectors, capitalLabelSelector];

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
    plugins: { "ui-system": uiSystem },
    rules: { "no-restricted-syntax": ["error", ...uiSystemSelectors], "ui-system/native-controls": "error", "ui-system/drawing-classes": "error" },
  },
  {
    // Installed primitives own their drawing. Source labels still use sentence case.
    files: ["src/components/ui/**/*.tsx"],
    rules: { "no-restricted-syntax": ["error", ...titleSelectors, capitalLabelSelector] },
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
