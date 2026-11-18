/**
 * One connection's prompt list (`prompts/list`), read the first time someone asks and kept until
 * the server says its prompts changed (`notifications/prompts/list_changed`) or the connection
 * reopens. A change that lands while a read is under way drops that read's answer, so an older
 * list is never kept after the notice.
 */
import type { McpPromptDef } from '@integrations/engine/mcp';

export class McpPromptCache {
  private list: McpPromptDef[] | null = null;
  private reading: Promise<McpPromptDef[]> | null = null;
  private generation = 0;

  /** The server's prompts changed: the next read asks it again. */
  changed(): void {
    this.generation += 1;
    this.list = null;
    this.reading = null;
  }

  /** The kept list, or one read now (shared by everyone asking at once). */
  read(fetch: () => Promise<McpPromptDef[]>): Promise<McpPromptDef[]> {
    if (this.list) return Promise.resolve(this.list);
    if (this.reading) return this.reading;
    const generation = this.generation;
    const reading = fetch().then((list) => {
      if (generation === this.generation) this.list = list;
      return list;
    }).finally(() => {
      if (this.reading === reading) this.reading = null;
    });
    this.reading = reading;
    return reading;
  }
}
