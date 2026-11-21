'use client';
import { Card } from '@/components/system/card';

import { IconButton } from '@/components/system/icon-button';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, X } from 'lucide-react';
import { ChatInputEditor, type ChatInputEditorHandle } from '@/components/chat/editor/chat-input-editor';
import { Button } from '@/components/system/button';
import { useResultDecision } from '@/hooks/use-results';
import { apiErrorText } from '@/lib/api/client';
import type { WorkResultFeedbackContext } from '@/lib/api/results';
import type { WorkResultRecord } from '@/db/types';
import { clearResultRequestKey, resultRequestKey } from './request-key';

export function ResultFeedback({ result, context, destinationReason, onClose }: { result: WorkResultRecord; context: WorkResultFeedbackContext; destinationReason?: string | null; onClose: () => void }) {
  const editorRef = useRef<ChatInputEditorHandle | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(false);
  const decision = useResultDecision(result.id);
  useEffect(() => editorRef.current?.scheduleAutoFocus(), []);

  const send = async () => {
    const editor = editorRef.current;
    if (!editor || editor.hasPendingUploads() || pendingUploads || decision.isPending) return;
    const output = editor.getMarkerOutput();
    if (!output.text.trim()) return;
    const intent = { resultId: result.id, note: output.text, context, attachments: output.attachments };
    try {
      await decision.mutateAsync({ requestId: resultRequestKey('feedback', intent), disposition: 'changes_requested', note: output.text, context, attachments: output.attachments });
      clearResultRequestKey('feedback', intent);
      editorRef.current?.clear();
      onClose();
    } catch { /* Keep the draft and operation key for a retry. */ }
  };

  return (
    <Card padding="md" className="space-y-2">
      <div className="flex items-start justify-between gap-2 text-xs">
        <div>
          <p className="font-medium">{context.reviewId ? 'Address findings' : 'Request changes'}</p>
          <p className="mt-1 text-muted-foreground">Feedback is saved with this exact handoff{context.reviewId ? ' and AI review' : ''}{context.attachmentFileName ? ' and selected file' : ''}{context.previewTargetId ? ' and selected preview' : ''}. Ri uses its authoring conversation when delivery is available.</p>
          {destinationReason && <p className="mt-1 text-muted-foreground">{destinationReason}</p>}
        </div>
        <IconButton
          onClick={onClose}
          label="Close feedback composer"
          variant="ghost"
          size="xs"
        ><X /></IconButton>
      </div>
      <ChatInputEditor ref={editorRef} placeholder="What should change?" onContentChange={setHasContent} onPendingUploadsChange={setPendingUploads} onSubmit={() => void send()} submitOnEnter={false} className="min-h-20 text-sm" />
      {!!decision.error && <p role="alert" className="text-xs text-destructive">{apiErrorText(decision.error)}</p>}
      <div className="flex justify-end">
        <Button
          onClick={() => void send()}
          disabled={!hasContent || pendingUploads || decision.isPending}
          variant="primary"
          size="xs"
        >
          {decision.isPending ? <Loader2 className="animate-spin" /> : <ArrowUp />}Send feedback
        </Button>
      </div>
    </Card>
  );
}
