'use client';
import { DialogPrimitive } from '@/components/system/dialog';
import { Card } from '@/components/system/card';

import { TextArea } from '@/components/system/text-area';

import { IconButton } from '@/components/system/icon-button';
import { Button } from '@/components/system/button';
import { useState, useRef, useCallback, useEffect } from 'react';
import { VisuallyHidden } from 'radix-ui';
import { X, Mic, Square, Loader2, Zap, ImagePlus, ArrowUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateStream } from '@/hooks/use-stream';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useCaptureDraft } from '@/hooks/use-capture-draft';
import { LiveWaveform } from '@/components/ui/live-waveform';
import { api, apiErrorText } from '@/lib/api/client';
import type { StreamRecord } from '@/db/types';

import { retainCaptureDraft } from '@/lib/client/capture-draft';
import { CAPTURE_MAX_TEXT_LENGTH, CAPTURE_MAX_IMAGES, chooseCaptureImages, transferFiles } from '@/lib/client/capture-images';
import { HOTKEYS, matchesHotkey } from '@/constants/commands';

interface QuickCaptureModalProps { open: boolean; onOpenChange(open: boolean): void }

function toastCaptured(item: StreamRecord) {
  const text = item.rawText.replace(/\s+/g, ' ').trim();
  toast.success(`${item.media === 'image' ? 'Image' : item.media === 'voice' ? 'Voice' : 'Note'} captured`, {
    description: text.length > 80 ? `${text.slice(0, 80)}…` : text || undefined,
  });
}

/** Object URLs belong to a File occurrence. Adding/removing a different image
 * must not revoke a still-visible preview. Duplicate files may be intentional. */
function ImagePreview({ file, remove, disabled }: { file: File; remove(): void; disabled: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    if (image.current) image.current.src = next;
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <div className="relative shrink-0">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={image} alt={file.name || 'Staged image'} className="h-24 w-24 rounded-xl object-cover border border-border shadow-sm" />
    <IconButton
      type="button"
      onClick={remove}
      disabled={disabled}
      label="Remove image"
      variant="secondary"
      size="sm"
      floating
      className="absolute -right-2 -top-2 flex items-center justify-center"
    ><X size={14} /></IconButton>
  </div>;
}

export function QuickCaptureModal({ open, onOpenChange }: QuickCaptureModalProps) {
  const draft = useCaptureDraft(open);
  const { edit } = draft;
  const { text, usedVoice, files: images } = draft.value;
  const [imageUploading, setImageUploading] = useState(false);
  const [inputError, setInputError] = useState<string>();
  const [savedRemotely, setSavedRemotely] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const submitting = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const createStream = useCreateStream();
  const voice = useVoiceInput();
  const captureOwner = useRef({});
  const busy = imageUploading || createStream.isPending || draft.recovering || draft.save.phase === 'loading';
  const hasInput = !!text.trim() || images.length > 0;
  const hasDraft = !!text || images.length > 0 || draft.missingFiles.length > 0;
  const activeVoice = voice.isRecording || voice.isTranscribing;
  const joinedTranscript = `${text}${text && !/\s$/.test(text) ? ' ' : ''}${voice.transcript}`;
  const transcriptOverflow = !!voice.transcript && joinedTranscript.length > CAPTURE_MAX_TEXT_LENGTH;
  const pristine = !hasInput && !activeVoice;
  const canSubmit = hasInput && !busy && !activeVoice && !savedRemotely && !draft.missingFiles.length && !transcriptOverflow;

  useEffect(() => {
    const owner = captureOwner.current;
    retainCaptureDraft(owner, imageUploading || createStream.isPending || !!voice.transcript);
    return () => retainCaptureDraft(owner, false);
  }, [imageUploading, createStream.isPending, voice.transcript]);

  useEffect(() => {
    if (!voice.transcript) return;
    const joined = `${text}${text && !/\s$/.test(text) ? ' ' : ''}${voice.transcript}`;
    if (joined.length <= CAPTURE_MAX_TEXT_LENGTH) {
      edit({ text: joined, usedVoice: true }); voice.clearTranscript();
    }
  }, [voice, text, edit]);

  useEffect(() => { if (!open) { setDragging(false); dragDepth.current = 0; } }, [open]);
  useEffect(() => {
    if (!open) return;
    // A file dropped on the dimmed area must not navigate the browser away.
    const preventFileNavigation = (event: DragEvent) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault();
    };
    document.addEventListener('dragover', preventFileNavigation);
    document.addEventListener('drop', preventFileNavigation);
    return () => { document.removeEventListener('dragover', preventFileNavigation); document.removeEventListener('drop', preventFileNavigation); };
  }, [open]);

  const stageFiles = useCallback((incoming: File[]) => {
    if (busy || submitting.current || savedRemotely) return;
    const result = chooseCaptureImages(images, incoming);
    setInputError(result.errors.length ? result.errors.join(' ') : undefined);
    if (result.files.length !== images.length) edit({ files: result.files });
    if (imageInputRef.current) imageInputRef.current.value = '';
    queueMicrotask(() => textareaRef.current?.focus());
  }, [busy, savedRemotely, images, edit]);

  const discard = async () => {
    if (submitting.current) return;
    voice.cancelRecording(); voice.clearTranscript();
    if (await draft.discard()) { setInputError(undefined); setSavedRemotely(false); }
  };

  const submitted = async (item: StreamRecord) => {
    setSavedRemotely(true); toastCaptured(item);
    try {
      await draft.acknowledge();
      setSavedRemotely(false); voice.clearTranscript(); setInputError(undefined); onOpenChange(false);
    } catch {
      setInputError('Capture saved to your Stream. Discard this local copy before capturing again.');
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true; setInputError(undefined);
    // While the local journal is being marked, block image edits and close
    // guards even before the network mutation begins.
    setImageUploading(true);
    let requestStarted = false;
    try {
      await draft.markSubmitting();
      requestStarted = true;
      if (images.length) {
        const form = new FormData(); images.forEach(file => form.append('file', file));
        if (text.trim()) form.append('text', text.trim());
        const result = await api.upload<{ item: StreamRecord }>('/capture', form);
        await submitted(result.item);
      } else {
        await submitted(await createStream.mutateAsync({ rawText: text.trim(), source: 'capture', media: usedVoice ? 'voice' : 'text' }));
      }
    } catch (error) {
      setInputError(requestStarted
        ? `${apiErrorText(error)} Check your Stream before capturing again.`
        : 'Capture was not sent. Retry saving the draft before capturing again.');
    }
    finally { submitting.current = false; setImageUploading(false); }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (matchesHotkey(event.nativeEvent, HOTKEYS.submitCapture) || matchesHotkey(event.nativeEvent, HOTKEYS.submitCaptureModified)) {
      event.preventDefault(); void handleSubmit();
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) voice.cancelRecording();
    onOpenChange(next);
  };
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files');
  const recoveryDisabled = busy || hasDraft || activeVoice || !!voice.transcript;
  const placeholder = voice.isRecording ? 'Listening…' : images.length ? 'Add a note for these images (optional)' : "What's on your mind?";

  return <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50" />
      <DialogPrimitive.Content placement="custom" padding="none" data-slot="dialog-content"
        className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 outline-none"
        onPaste={event => {
          const files = transferFiles(event.clipboardData);
          if (!files.length) return;
          event.preventDefault(); stageFiles(files);
        }}
        onDragEnter={event => { if (hasFiles(event)) { event.preventDefault(); if (++dragDepth.current === 1 && !busy) setDragging(true); } }}
        onDragOver={event => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; } }}
        onDragLeave={event => { if (hasFiles(event)) { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); } }}
        onDrop={event => {
          if (!hasFiles(event)) return;
          event.preventDefault(); dragDepth.current = 0; setDragging(false); stageFiles(transferFiles(event.dataTransfer));
        }}>
        <VisuallyHidden.Root><DialogPrimitive.Title>Quick Capture</DialogPrimitive.Title>
          <DialogPrimitive.Description>Capture a thought into your Stream. Type, speak, paste or drop images. Closing keeps your draft on this device.</DialogPrimitive.Description></VisuallyHidden.Root>
        <div className="relative flex max-h-[85dvh] flex-col overflow-y-auto">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2 text-muted-foreground"><Zap size={14} /><span className="text-sm font-medium">Quick capture</span></div>
            <DialogPrimitive.Close asChild><IconButton
              type="button"
              label="Close"
              variant="ghost"
              size="sm"
            ><X size={15} /></IconButton></DialogPrimitive.Close>
          </div>
          <div className="space-y-3 px-5 pb-5 pt-2">
            {!!draft.recoveries.length && <Card as="section" padding="md" aria-label="Saved captures on this device" className="space-y-2">
              <p className="text-xs font-medium">Saved captures on this device</p>
              {draft.recoveries.map(saved => <div key={saved.id} className="space-y-1 border-t pt-2 first:border-0">
                <p className="line-clamp-2 break-words text-xs text-muted-foreground">{saved.text.trim() || 'Image capture'}{saved.imageCount > 0 && ` · ${saved.imageCount} image${saved.imageCount === 1 ? '' : 's'}`}</p>
                <div className="flex gap-3 text-xs"><Button
                  type="button"
                  disabled={recoveryDisabled}
                  onClick={() => void draft.restore(saved.id)}
                  variant="link"
                  size="sm"
                >Restore capture</Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void draft.discardSaved(saved.id)}
                    variant="link"
                    size="sm"
                  >Discard saved capture</Button></div>
              </div>)}
              {hasInput && <p className="text-xs text-muted-foreground">Capture or discard the current draft before restoring another.</p>}
            </Card>}
            {draft.recoveryError && <p role="alert" className="text-xs text-amber-600 dark:text-amber-500">Saved drafts could not be read. {draft.recoveryError} <Button
              type="button"
              onClick={() => void draft.refreshRecoveries()}
              variant="link"
              size="sm"
            >Retry recovery</Button></p>}
            <Card padding="none" surface={pristine ? "pane" : "raised"}>
              {!!images.length && <div className="flex gap-3 overflow-x-auto px-3 pt-4 pb-2">
                {draft.previews.map(({ id, file }, index) => <ImagePreview key={id} file={file} disabled={busy || savedRemotely} remove={() => draft.edit({ files: images.filter((_, position) => position !== index) })} />)}
              </div>}
              <div className="px-4 py-3"><TextArea
                ref={textareaRef}
                aria-label="Quick capture"
                autoSize
                maxRows={14}
                value={text}
                onChange={(event) => draft.edit({ text: event.target.value })}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                maxLength={CAPTURE_MAX_TEXT_LENGTH}
                disabled={busy || savedRemotely}
                autoFocus
                rows={3}
                className="w-full"
                purpose="embedded"
              /></div>
              <div className="space-y-1 px-4 pb-3 text-xs">
                {draft.save.phase === 'loading' && <p role="status" className="text-muted-foreground">Preparing capture…</p>}
                {(hasInput || draft.save.phase === 'error') && <p role={draft.save.phase === 'error' ? 'alert' : 'status'} className={draft.save.phase === 'error' ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}>
                  {draft.save.phase === 'saved' ? 'Draft saved on this device.' : draft.save.phase === 'saving' ? 'Saving draft on this device…' : draft.save.phase === 'error' ? draft.save.error || 'Draft could not be saved on this device.' : ''}
                  {draft.save.phase === 'error' && !draft.missingFiles.length && !savedRemotely && <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void draft.retry()}
                    variant="link"
                    size="sm"
                    className="ml-2"
                  >Retry saving draft</Button>}
                </p>}
                {!!draft.missingFiles.length && <div role="alert"><p>Missing images: {draft.missingFiles.join(', ')}</p><Button
                  type="button"
                  onClick={draft.acceptRecoveredFiles}
                  variant="link"
                  size="sm"
                >Keep recovered content</Button></div>}
                {transcriptOverflow && <div role="alert" className="space-y-2 text-amber-600 dark:text-amber-500">
                  <p>This transcript does not fit. Shorten the capture to add it, or copy the transcript before discarding it. It has not been saved on this device.</p>
                  <TextArea
                    aria-label="Unadded voice transcript"
                    rows={2}
                    readOnly
                    value={voice.transcript}
                    className="w-full"
                  />
                  <Button
                    type="button"
                    onClick={voice.clearTranscript}
                    variant="link"
                    size="sm"
                  >Discard unadded transcript</Button>
                </div>}
                {draft.value.submission === 'uncertain' && !imageUploading && <p role="status" className="text-amber-600 dark:text-amber-500">This capture may already have been submitted. Check your Stream before capturing again.</p>}
                {inputError && <p role="alert" className="text-amber-600 dark:text-amber-500">{inputError}</p>}
                {voice.error && <p role="alert" className="text-destructive">{voice.error}</p>}
                {voice.captureMode === null && voice.unsupportedReason && <p className="text-muted-foreground">{voice.unsupportedReason}</p>}
                {voice.isTranscribing && <p role="status">Transcribing voice capture… <Button
                  type="button"
                  onClick={voice.cancelRecording}
                  variant="link"
                  size="sm"
                >Cancel transcription</Button></p>}
              </div>
              {voice.isRecording && voice.stream && <div className="mx-3 mb-3 flex items-center gap-3 rounded-xl bg-red-400/5 p-3">
                <LiveWaveform stream={voice.stream} active height={28} barColor="currentColor" className="flex-1 text-foreground" />
                <Button
                  type="button"
                  onClick={voice.toggleRecording}
                  variant="ghost"
                  size="sm"
                  tone="danger"
                  className="flex items-center gap-1"
                ><Square size={12} />Stop</Button>
              </div>}
              <Card padding="sm" className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    aria-label="Voice capture"
                    onClick={voice.toggleRecording}
                    disabled={busy || voice.captureMode === null || voice.isTranscribing || savedRemotely}
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5"
                  ><Mic size={15} />{voice.isRecording ? 'Stop' : 'Speak'}</Button>
                  <Button
                    type="button"
                    aria-label="Attach image"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={busy || savedRemotely || images.length >= CAPTURE_MAX_IMAGES}
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5"
                  ><ImagePlus size={15} />Image</Button>
                  <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => stageFiles(Array.from(event.target.files ?? []))} />
                </div>
                <Button
                  type="button"
                  aria-label="Capture"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                  variant="primary"
                  size="md"
                  className="flex items-center gap-1.5"
                >
                  {imageUploading || createStream.isPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}Capture
                </Button>
              </Card>
            </Card>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>Paste or drop images. Closing keeps your draft.</p>
              {(hasDraft || !!voice.transcript) && <Button
                type="button"
                disabled={busy}
                onClick={() => void discard()}
                variant="link"
                size="sm"
                className="shrink-0"
              >Discard capture</Button>}
            </div>
          </div>
          {dragging && <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/90"><span className="flex items-center gap-2 text-sm"><Upload size={18} />Drop images to attach</span></div>}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
