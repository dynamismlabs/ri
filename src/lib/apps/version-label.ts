/** A catalog version as the person reads it: a tag as it is, a commit by its first 7 characters, as git shortens it. */
export function versionLabel(version: string | null | undefined): string {
  if (!version) return '';
  return /^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(version) ? version.slice(0, 7) : version;
}
