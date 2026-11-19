#!/usr/bin/env node
// Vendor brand logos for the integration catalog from `simple-icons` (CC0) into a
// committed TS data file, so the client bundle ships only the ~2 dozen paths we
// actually use (not the full 3,400-icon set) and works fully offline.
//
// This is codegen, not a postinstall step: `simple-icons` is a devDependency and
// the output is committed, so production installs (no devDeps) never need it.
// Re-run after adding a provider:  node scripts/gen-integration-icons.mjs
//
// Some major brands (Slack, Microsoft, Salesforce, …) were removed from
// simple-icons on the trademark holders' request. Those fall through to a
// brand-colored monogram tile defined in integration-meta.ts — see MISSING output.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const siRoot = resolve(repoRoot, 'node_modules/simple-icons');
const dest = resolve(repoRoot, 'src/components/integrations/integration-icon-data.ts');

// providerId -> ordered candidate simple-icons slugs/titles (first hit wins).
// Keep in sync with PROVIDER_CATALOG in packages/integrations/src/providers/index.ts.
const CANDIDATES = {
  onepassword: ['1password'],
  google: ['google'],
  slack: ['slack'],
  notion: ['notion'],
  microsoft: ['microsoft365', 'microsoft', 'microsoftoffice'],
  linear: ['linear'],
  jira: ['jira', 'jirasoftware'],
  discord: ['discord'],
  calendly: ['calendly'],
  raindrop: ['raindropdotio', 'raindrop'],
  zoom: ['zoom'],
  hubspot: ['hubspot'],
  salesforce: ['salesforce'],
  todoist: ['todoist'],
  airtable: ['airtable'],
  readwise: ['readwise'],
  stripe: ['stripe'],
  plaid: ['plaid'],
  telegram: ['telegram'],
  whatsapp: ['whatsapp'],
  gitlab: ['gitlab'],
  confluence: ['confluence'],
  asana: ['asana'],
  zendesk: ['zendesk'],
  dropbox: ['dropbox'],
  box: ['box'],
  quickbooks: ['quickbooks', 'intuit'],
  resend: ['resend'],
  mailgun: ['mailgun'],
  twitter: ['x', 'twitter'],
  // Not a provider: Gmail is a toolkit of `google`, drawn on its own in the
  // rail's "Connect apps" stack, where the app people recognize is Gmail.
  gmail: ['gmail'],
};

// Brands simple-icons doesn't carry, vendored from the brand's own published
// artwork. Each is one 24x24 path, like simple-icons, with its source recorded.
const VENDORED = {
  // public/favicon.svg in https://github.com/dynamismlabs/lore (commit 56ad0f6), one path on a
  // 512x512 box scaled to 24x24. Lore is grayscale, so its mark takes the theme's color.
  lore: {
    title: 'Lore',
    hex: '111111',
    path: 'M3.572 1.13C3.572 1.148 3.591 1.163 3.684 1.209C4.472 1.58 5.227 2.461 5.475 3.305C5.667 3.97 5.691 4.608 5.569 5.836C5.545 6.047 5.55 6.75 5.578 6.933C5.634 7.392 5.709 7.711 5.841 8.039C6.052 8.569 6.277 8.948 6.586 9.309C6.666 9.403 6.656 9.417 6.511 9.38C6.173 9.291 5.761 9.098 5.4 8.85C5.316 8.794 5.316 8.798 5.273 9.108C5.208 9.614 5.203 9.905 5.245 10.317C5.32 11.062 5.484 11.587 5.859 12.239C6.103 12.661 6.67 13.364 6.942 13.58C7.045 13.655 7.027 13.683 6.886 13.645C6.858 13.636 6.773 13.617 6.703 13.598C6.492 13.547 6.192 13.444 6.056 13.378C5.953 13.322 5.958 13.322 5.972 13.547C6.023 14.283 6.258 14.944 6.628 15.441C6.703 15.539 6.75 15.614 7.045 16.05C7.627 16.913 7.791 17.817 7.57 18.938C7.486 19.378 7.359 19.716 7.125 20.156C6.942 20.489 6.895 20.545 6.562 20.855C6.089 21.291 5.906 21.652 5.925 22.092C5.948 22.505 6.141 22.748 6.53 22.847L6.628 22.87L13.388 22.87C17.1 22.88 20.147 22.87 20.156 22.866C20.189 22.847 20.123 22.683 20.039 22.566C19.894 22.378 19.706 22.289 19.406 22.242C19.294 22.223 18.895 22.219 13.209 22.219L7.13 22.223L7.041 22.247C6.858 22.294 6.722 22.355 6.614 22.448L6.553 22.5L6.539 22.472C6.445 22.359 6.459 21.994 6.572 21.712C6.68 21.445 6.998 21.159 7.359 21.005C7.402 20.986 7.448 20.967 7.458 20.962C7.566 20.911 7.837 20.845 8.02 20.817C8.259 20.789 8.438 20.789 12.989 20.789C15.666 20.789 17.691 20.784 17.78 20.78C18.567 20.733 19.209 20.456 19.72 19.941C19.992 19.669 20.156 19.406 20.325 18.975C20.372 18.867 20.381 18.839 20.419 18.694C20.442 18.6 20.423 18.586 20.367 18.656C20.278 18.773 20.114 18.947 19.95 19.083C19.617 19.378 19.223 19.627 18.9 19.748C18.848 19.772 18.712 19.828 18.656 19.847C18.623 19.866 18.459 19.908 18.263 19.973C18.028 20.039 17.714 20.095 17.386 20.123C16.87 20.17 17.048 20.17 12.609 20.175C7.847 20.18 8.198 20.175 7.753 20.273C7.603 20.311 7.575 20.302 7.631 20.231C7.641 20.217 7.669 20.175 7.8 19.922C7.837 19.852 7.88 19.781 7.889 19.763C7.898 19.739 7.945 19.659 7.988 19.58C8.025 19.505 8.081 19.402 8.105 19.355C8.128 19.312 8.208 19.172 8.269 19.041C8.33 18.914 8.428 18.722 8.48 18.623C8.573 18.445 8.606 18.366 8.747 18.052C8.808 17.916 9.019 17.428 9.07 17.302C9.089 17.25 9.136 17.147 9.169 17.072C9.253 16.866 9.427 16.434 9.502 16.228C9.572 16.027 9.764 15.469 9.773 15.422C9.778 15.408 9.802 15.319 9.83 15.225C9.853 15.136 9.895 14.991 9.919 14.902C9.942 14.817 9.98 14.672 10.003 14.587C10.031 14.498 10.055 14.395 10.064 14.353C10.073 14.311 10.102 14.189 10.125 14.077C10.153 13.964 10.181 13.819 10.195 13.753C10.205 13.688 10.223 13.58 10.233 13.514C10.247 13.444 10.266 13.327 10.275 13.256C10.284 13.186 10.308 13.064 10.317 12.994C10.35 12.811 10.373 12.544 10.392 12.314C10.406 12.206 10.416 12.075 10.42 12.023C10.472 11.545 10.444 10.495 10.373 9.914C10.364 9.848 10.355 9.75 10.35 9.698C10.312 9.37 10.228 8.887 10.144 8.508C10.134 8.461 10.116 8.386 10.106 8.348C10.087 8.241 10.055 8.1 10.027 7.997C9.872 7.411 9.75 7.059 9.52 6.436C9.394 6.098 9.103 5.475 8.948 5.18C8.906 5.1 8.841 4.973 8.798 4.889C8.545 4.411 8.002 3.623 7.65 3.258C7.617 3.22 7.538 3.136 7.481 3.07C7.045 2.569 6.422 2.077 5.794 1.744C5.723 1.702 5.625 1.65 5.578 1.627C5.494 1.584 5.306 1.491 5.236 1.467C5.213 1.458 5.17 1.439 5.142 1.43C5.062 1.402 4.809 1.317 4.711 1.289C4.669 1.275 4.608 1.256 4.57 1.247C4.444 1.209 4.205 1.158 4.059 1.144C3.919 1.13 3.572 1.116 3.572 1.13ZM5.522 2.142C5.531 2.152 5.583 2.18 5.634 2.213C6.108 2.475 6.483 2.766 6.909 3.202C7.341 3.647 7.791 4.228 8.081 4.725C8.105 4.762 8.147 4.828 8.175 4.875C8.363 5.156 8.77 5.939 8.864 6.173C8.883 6.22 8.934 6.352 8.981 6.459C9.103 6.741 9.183 6.956 9.286 7.275C9.337 7.43 9.38 7.561 9.384 7.57C9.398 7.603 9.52 8.039 9.562 8.203C9.656 8.578 9.67 8.653 9.703 8.794C9.717 8.873 9.736 8.991 9.745 9.042C9.844 9.623 9.872 9.802 9.905 10.219C9.942 10.669 9.952 10.847 9.947 11.334C9.947 11.822 9.942 11.902 9.905 12.309C9.886 12.511 9.877 12.619 9.83 12.942C9.825 13.003 9.802 13.125 9.792 13.219C9.759 13.5 9.642 14.086 9.553 14.461C9.52 14.592 9.488 14.752 9.469 14.822C9.398 15.155 9.239 15.684 9.206 15.694C9.192 15.698 9.192 15.619 9.22 15.455C9.253 15.202 9.281 14.883 9.309 14.33C9.314 14.231 9.328 14.091 9.333 14.02C9.347 13.875 9.337 12.923 9.319 12.675C9.272 11.911 9.258 11.808 9.192 11.231C9.141 10.8 8.981 9.966 8.873 9.562C8.85 9.464 8.808 9.309 8.78 9.211C8.756 9.113 8.728 9.005 8.714 8.967C8.62 8.658 8.512 8.316 8.433 8.095C8.334 7.805 8.02 7.064 7.964 6.97C7.955 6.956 7.903 6.858 7.852 6.759C7.753 6.558 7.72 6.502 7.711 6.502C7.692 6.502 7.702 6.539 7.8 6.802C7.828 6.867 7.88 7.027 7.917 7.163C7.959 7.294 8.016 7.462 8.044 7.538C8.091 7.669 8.128 7.819 8.217 8.147C8.241 8.241 8.269 8.353 8.283 8.395C8.292 8.433 8.32 8.536 8.334 8.625C8.348 8.705 8.381 8.841 8.4 8.92C8.423 9 8.447 9.122 8.466 9.206C8.48 9.281 8.498 9.389 8.508 9.445C8.555 9.694 8.667 10.359 8.691 10.538C8.7 10.613 8.714 10.744 8.728 10.842C8.747 10.941 8.756 11.048 8.761 11.081C8.766 11.119 8.775 11.241 8.794 11.358C8.878 12.075 8.92 13.355 8.878 14.062C8.794 15.595 8.587 16.884 8.259 17.902C8.241 17.944 8.222 18.014 8.212 18.061C8.156 18.267 8.123 18.347 8.105 18.333C8.095 18.323 8.095 18.333 8.105 18.033C8.114 17.686 8.1 17.508 8.039 17.175C7.908 16.509 7.645 15.961 7.195 15.398C7.111 15.295 7.003 15.145 6.923 15.019C6.881 14.953 6.703 14.597 6.703 14.578C6.703 14.573 6.698 14.559 6.689 14.541C6.647 14.452 6.6 14.311 6.558 14.166C6.506 13.959 6.506 13.931 6.558 13.945C6.605 13.955 6.745 13.978 6.816 13.987C7.041 14.02 7.139 14.025 7.462 14.025L7.805 14.025L7.805 14.006C7.8 13.964 7.519 13.594 7.294 13.327C7.177 13.191 7.045 13.041 7.022 13.003C6.989 12.97 6.928 12.891 6.886 12.844C6.661 12.577 6.323 12.07 6.192 11.808C6 11.4 5.967 11.334 5.916 11.166C5.742 10.608 5.719 10.434 5.709 9.942C5.7 9.516 5.695 9.539 5.798 9.595C5.869 9.633 6.056 9.703 6.22 9.759C6.516 9.858 6.975 9.919 7.369 9.914L7.552 9.909L7.556 9.881C7.556 9.853 7.472 9.731 7.327 9.572C7.097 9.319 6.881 9.009 6.628 8.573C6.52 8.381 6.328 7.955 6.286 7.819C6.277 7.791 6.258 7.711 6.23 7.631C6.164 7.406 6.136 7.308 6.113 7.144C6.047 6.712 6.042 6.113 6.103 5.564C6.159 5.062 6.159 4.256 6.103 3.928C6.089 3.881 6.075 3.769 6.061 3.675C6.023 3.473 6.005 3.389 5.92 3.155C5.784 2.752 5.672 2.503 5.494 2.236C5.423 2.128 5.438 2.072 5.522 2.142Z',
  },
  // Traced from assets/magicpath.png in https://github.com/MagicPathAI/magicpath-agent-plugin
  // (MIT, commit 3afaaa5), fitted to the 24x24 box. Brand color from its plugin manifest.
  magicpath: {
    title: 'MagicPath',
    hex: '085C34',
    path: 'M8.734 3.004C7.959 3.104 7.106 3.282 6.676 3.434C4.214 4.299 2.169 6.456 1.028 9.395C0.789 10.008 0.557 10.762 0.472 11.196C0.438 11.369 0.374 11.664 0.33 11.853C0.123 12.747 0 14.856 0.076 16.196C0.135 17.245 0.289 18.901 0.333 18.971C0.348 18.993 0.395 19.256 0.439 19.554C0.484 19.853 0.566 20.182 0.619 20.288C0.941 20.91 1.861 21.048 2.402 20.554C2.472 20.491 2.572 20.31 2.623 20.153C2.731 19.829 2.728 19.77 2.497 18.112C2.359 17.117 2.342 16.816 2.339 15.311C2.334 13.802 2.347 13.541 2.467 12.825C2.876 10.351 3.685 8.574 5.033 7.184C5.882 6.31 6.589 5.849 7.578 5.528C8.301 5.294 8.795 5.232 9.619 5.27C10.413 5.305 11.203 5.504 11.791 5.815C12.507 6.192 12.622 6.266 13.013 6.6C13.702 7.192 14.297 8.063 14.534 8.834C14.598 9.043 14.644 9.217 14.636 9.222C14.627 9.227 14.415 9.291 14.164 9.366C12.479 9.867 11.069 10.722 9.729 12.053C8.223 13.549 7.448 15.023 7.448 16.385C7.448 17.8 8.457 19.057 9.819 19.341C11.198 19.627 12.488 19.186 13.899 17.942C14.942 17.024 15.79 15.777 16.411 14.254C16.697 13.547 16.935 12.577 17.078 11.523L17.114 11.25L17.325 11.284C17.79 11.359 17.894 11.382 18.279 11.495C18.762 11.636 19.293 11.876 19.696 12.135C20.581 12.705 21.105 13.544 21.461 14.96C21.641 15.668 21.643 15.707 21.642 16.997C21.641 18.04 21.62 18.4 21.541 18.74C21.313 19.724 21.336 20.107 21.643 20.491C21.916 20.83 22.41 20.949 22.886 20.79C23.387 20.622 23.573 20.248 23.782 18.997C23.99 17.747 24 16.16 23.806 15.084C23.145 11.432 20.966 9.421 17.207 8.995C16.938 8.964 16.878 8.939 16.878 8.851C16.878 8.645 16.489 7.56 16.254 7.109C15.863 6.362 15.512 5.886 14.906 5.278C13.694 4.064 12.22 3.353 10.355 3.085C9.573 2.973 9.144 2.952 8.734 3.004ZM14.449 11.645C14.606 11.588 14.751 11.541 14.771 11.541C14.79 11.54 14.773 11.712 14.733 11.924C14.423 13.533 13.739 14.876 12.67 15.971C12.186 16.467 11.685 16.835 11.18 17.067C10.915 17.188 10.807 17.206 10.525 17.182C9.885 17.123 9.616 16.75 9.736 16.093C9.873 15.357 10.308 14.683 11.278 13.704C12.271 12.698 13.204 12.093 14.449 11.645Z',
  },
};

function extractPath(svg) {
  // simple-icons ship exactly one <path d="…"/>.
  const m = svg.match(/\sd="([^"]+)"/);
  return m ? m[1] : null;
}

async function main() {
  const arr = JSON.parse(await readFile(resolve(siRoot, 'data/simple-icons.json'), 'utf8'));
  const bySlug = new Map(arr.map((i) => [i.slug, i]));
  const byTitle = new Map(arr.map((i) => [i.title.toLowerCase(), i]));

  const found = {};
  const missing = [];

  for (const [providerId, cands] of Object.entries(CANDIDATES)) {
    let hit = null;
    for (const c of cands) {
      const entry = bySlug.get(c) || byTitle.get(c.toLowerCase());
      const svgPath = entry && resolve(siRoot, `icons/${entry.slug}.svg`);
      if (entry && svgPath && existsSync(svgPath)) {
        const d = extractPath(await readFile(svgPath, 'utf8'));
        if (d) {
          hit = { title: entry.title, hex: entry.hex, path: d };
          break;
        }
      }
    }
    if (hit) found[providerId] = hit;
    else missing.push(providerId);
  }
  for (const [providerId, icon] of Object.entries(VENDORED)) found[providerId] = icon;

  const version = JSON.parse(await readFile(resolve(siRoot, 'package.json'), 'utf8')).version;
  const entries = Object.entries(found)
    .map(
      ([id, v]) =>
        `  ${id}: { title: ${JSON.stringify(v.title)}, hex: ${JSON.stringify(v.hex)}, path: ${JSON.stringify(v.path)} },`,
    )
    .join('\n');

  const out = `// GENERATED by scripts/gen-integration-icons.mjs — do not edit by hand.
// Source: simple-icons@${version} (CC0-1.0), plus brand artwork vendored in the script. Re-run: node scripts/gen-integration-icons.mjs
//
// Brand glyph path data for integration logos, keyed by providerId. Each is a single
// 24x24 path (the simple-icons convention). Providers absent here render a
// brand-colored monogram fallback (see integration-meta.ts brandHex).

export interface IntegrationIconDatum {
  /** Brand display title, e.g. "Notion". */
  title: string;
  /** Brand color as a 6-digit hex (no leading #). */
  hex: string;
  /** SVG path \`d\` for a 0 0 24 24 viewBox. */
  path: string;
}

export const INTEGRATION_ICONS: Record<string, IntegrationIconDatum> = {
${entries}
};
`;

  await writeFile(dest, out, 'utf8');
  console.log(`[integration-icons] wrote ${Object.keys(found).length} logos → ${dest.replace(repoRoot + '/', '')}`);
  console.log(`[integration-icons] MISSING (monogram fallback): ${missing.join(', ') || '(none)'}`);
}

main().catch((err) => {
  console.error(`[integration-icons] failed: ${err.message}`);
  process.exit(1);
});
