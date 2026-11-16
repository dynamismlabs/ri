/**
 * A file a connected app's view hands Ri to save (MCP Apps `ui/download-file`, docs/connected-mcp-apps.md
 * "Downloads and links"). One embedded file of up to 12 MiB, named by the last segment of its URI. The URI is
 * only a suggested name: Ri never fetches it or reads a path it names. The view asks the person
 * before saving, so nothing lands in their downloads without their word.
 */

/** The largest file a view may hand Ri, before base64. The same as a view's file writes. */
export const MAX_VIEW_DOWNLOAD_BYTES = 12 * 1024 * 1024;
/** The longest name Ri saves a file under, extension included. */
export const VIEW_DOWNLOAD_NAME_MAX = 120;

export interface ViewDownload {
  name: string;
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
}

const MIB = 1024 * 1024;
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
// Characters no file system takes, control characters, and the bidirectional overrides that make
// `photo‮gpj.exe` read as a picture.
const UNSAFE_NAME = /[/\\:*?"<>|\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** The name Ri saves a file under: its URI's last segment, decoded and made safe, or `download`. */
export function downloadName(uri: unknown): string {
  let segment = '';
  if (typeof uri === 'string') {
    const path = uri.split(/[?#]/, 1)[0]!;
    segment = path.slice(path.lastIndexOf('/') + 1);
    try { segment = decodeURIComponent(segment); } catch { /* A name that isn't valid percent-encoding is kept as written. */ }
  }
  // No hidden files, and nothing a file system trims off the end.
  const cleaned = segment.replace(UNSAFE_NAME, '').replace(/^[\s.]+|[\s.]+$/g, '');
  const chars = Array.from(cleaned);
  if (!chars.length) return 'download';
  if (chars.length <= VIEW_DOWNLOAD_NAME_MAX) return cleaned;
  // Too long: shorten the stem and keep a short extension, so the file still opens with its app.
  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 && cleaned.length - dot <= 16 ? Array.from(cleaned.slice(dot)) : [];
  return chars.slice(0, VIEW_DOWNLOAD_NAME_MAX - extension.length).join('').replace(/[\s.]+$/, '') + extension.join('');
}

/**
 * The one file in a `ui/download-file` request, or an error the view can show. A link to a file
 * (`resource_link`) is refused: Ri saves only what the app sent.
 */
export function viewDownload(contents: unknown, maxBytes = MAX_VIEW_DOWNLOAD_BYTES): ViewDownload {
  if (!Array.isArray(contents) || !contents.length) throw new Error('The app sent no file to save.');
  if (contents.length > 1) throw new Error('Apps can save one file at a time.');
  const item = record(contents[0]);
  if (item.type === 'resource_link') throw new Error('Ri saves only a file the app includes, not a link to one.');
  const resource = record(item.resource);
  if (item.type !== 'resource' || !Object.keys(resource).length) throw new Error('The app sent no file to save.');
  const tooLarge = () => new Error(`Apps can save files up to ${maxBytes / MIB} MiB.`);
  const { text, blob } = resource;
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof text === 'string' && blob === undefined) {
    // UTF-8 takes at most three bytes per UTF-16 unit, so a long text is refused before encoding it.
    if (text.length > maxBytes) throw tooLarge();
    bytes = new TextEncoder().encode(text);
  } else if (typeof blob === 'string' && text === undefined) {
    if (blob.length > Math.ceil(maxBytes / 3) * 4) throw tooLarge();
    if (blob.length % 4 !== 0 || !BASE64.test(blob)) throw new Error('The file the app sent is damaged.');
    const binary = atob(blob);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  } else {
    throw new Error('The file the app sent has no contents.');
  }
  if (bytes.byteLength > maxBytes) throw tooLarge();
  const declared = typeof resource.mimeType === 'string' ? resource.mimeType.split(';', 1)[0]!.trim() : '';
  const mimeType = MIME.test(declared) ? declared.toLowerCase() : typeof text === 'string' ? 'text/plain' : 'application/octet-stream';
  return { name: downloadName(resource.uri), mimeType, bytes };
}

/** A file's size for the person: `512 bytes`, `4.2 KB`, `12 MB`. */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const [value, unit] = bytes < MIB ? [bytes / 1024, 'KB'] : [bytes / MIB, 'MB'];
  return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} ${unit}`;
}

/** Save the file through the browser, as a download from Ri's own page. */
export function saveViewDownload(file: ViewDownload): void {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // The browser reads the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
