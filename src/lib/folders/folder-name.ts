/** A folder's own name: the last part of its path, as Finder shows it. */
export function folderName(folder: string): string {
  const parts = folder.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}
