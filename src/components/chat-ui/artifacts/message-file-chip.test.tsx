import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TipProvider } from '@/components/ui/tip';
import { ArtifactPreviewProvider } from './artifact-preview-provider';
import { MessageFileChip } from './message-file-chip';
import { MessageFileStrip } from './message-file-strip';

const attachment = (fileName: string, originalName: string, mimeType: string) => ({ fileName, originalName, mimeType, size: 2048, uploadedAt: '2026-11-05T00:00:00.000Z' });
const chip = (fileName: string, originalName: string, mimeType: string, variant?: 'inline' | 'block') => renderToStaticMarkup(
  <TipProvider><ArtifactPreviewProvider><MessageFileChip attachment={attachment(fileName, originalName, mimeType)} variant={variant} /></ArtifactPreviewProvider></TipProvider>,
);

describe('MessageFileChip', () => {
  it('shows a type Ri has no name for as a download under its own name', () => {
    const html = chip('01a1-scene.glb', 'scene.glb', 'application/octet-stream');
    expect(html).toContain('href="/api/attachments/01a1-scene.glb"');
    expect(html).toContain('download="scene.glb"');
    expect(html).toContain('2.0 KB');
    expect(html).not.toContain('Open file');
  });

  it('still opens a file Ri can show in the shared preview', () => {
    const html = chip('01a1-budget.xlsx', 'budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(html).toContain('Open file: budget.xlsx');
    expect(html).not.toContain('download=');
  });

  it('draws a picture or PDF in a sentence as a text-sized chip that opens it, not a card', () => {
    for (const [fileName, mimeType] of [['01a1-shot.png', 'image/png'], ['01a1-plan.pdf', 'application/pdf']]) {
      const html = chip(fileName, fileName.slice(5), mimeType);
      expect(html).toContain(fileName.slice(5));
      expect(html).toContain('data-artifact-card');
      expect(html).not.toContain('aspect-[3/2]');
    }
  });

  it('still draws a picture on its own line as its card', () => {
    const html = chip('01a1-shot.png', 'shot.png', 'image/png', 'block');
    expect(html).toContain('Open image: shot.png');
    expect(html).toContain('aspect-[3/2]');
  });

  it('opens a picture through its thumbnail when the message has a row, so the file is one card', () => {
    const shot = attachment('01a1-shot.png', 'shot.png', 'image/png');
    const html = renderToStaticMarkup(
      <TipProvider><ArtifactPreviewProvider><MessageFileStrip files={[shot]}><MessageFileChip attachment={shot} /></MessageFileStrip></ArtifactPreviewProvider></TipProvider>,
    );
    expect(html.match(/data-artifact-card/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Attached files"');
    expect(html).toContain('data-strip-file="01a1-shot.png"');
    expect(html).toContain('Open image: shot.png');
  });
});
