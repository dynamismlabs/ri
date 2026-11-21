"use client";

import { Button } from '@/components/system/button';
import { IconButton } from '@/components/system/icon-button';
import { Mic, MicOff, Send, Square, X, Loader2 } from 'lucide-react';
import { useCallback } from 'react';
import { useDashboard } from '@/contexts/dashboard-context';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { useUserState } from '@/hooks/use-user-state';
import { LiveWaveform } from '@/components/ui/live-waveform';
import type { FormEvent, KeyboardEvent } from 'react';


interface CommandInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onSendMessage?: (text: string) => void;
  isStreaming: boolean;
  onStop: () => void;
}

export function CommandInput({ input, setInput, onSubmit, onSendMessage, isStreaming, onStop }: CommandInputProps) {
  const { isFocusMode } = useDashboard();
  const { data: userState } = useUserState();
  const voiceAutoSend = userState?.voiceAutoSend ?? true;

  const voice = useVoiceInput();

  // Send voice transcript
  const handleVoiceSend = useCallback(() => {
    const text = voice.transcript.trim();
    if (!text) return;
    if (onSendMessage) {
      onSendMessage(text);
    }
    voice.clearTranscript();
  }, [voice, onSendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onStop();
      } else if (input.trim()) {
        onSubmit(e);
      }
    }
  };

  // Whether the voice transcript panel is showing
  const showVoicePanel = voice.isTranscribing || (!!voice.transcript && !voiceAutoSend);

  return (
    <div className={cn(
      'flex-shrink-0 w-full pt-4 pb-8 transition-all duration-500',
      isFocusMode ? 'max-w-2xl mx-auto' : 'px-8'
    )}>
      <div className="max-w-3xl mx-auto space-y-3">
        {/* Voice transcript / transcribing panel */}
        {showVoicePanel && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
            {voice.isTranscribing && (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="text-primary animate-spin" />
                <span className="text-sm text-primary font-medium">
                  Transcribing{voice.provider === 'local' ? ' via Parakeet' : ''}...
                </span>
                <Button
                  type="button"
                  onClick={voice.cancelRecording}
                  variant="link"
                  size="sm"
                  className="ml-auto"
                >
                  Cancel transcription
                </Button>
              </div>
            )}

            {voice.transcript && !voiceAutoSend && (
              <div className="flex items-start gap-3">
                <p className="flex-1 text-base text-foreground leading-relaxed">{voice.transcript}</p>
                <div className="flex items-center gap-1.5 shrink-0">

                    <IconButton
                      onClick={voice.clearTranscript}
                      label="Discard"
                      tooltip="Discard"
                      variant="ghost"
                      size="sm"
                      className="flex items-center justify-center"
                    >
                      <X size={18} />
                    </IconButton>


                    <IconButton
                      onClick={handleVoiceSend}
                      label="Send"
                      tooltip="Send"
                      variant="primary"
                      size="md"
                      className="flex items-center justify-center"
                    >
                      <Send size={18} />
                    </IconButton>

                </div>
              </div>
            )}

            {voice.error && (
              <p className="text-[11px] text-destructive">{voice.error}</p>
            )}
          </div>
        )}

        {/* Floating mic button + waveform */}
        <div className="flex items-center gap-3">

            <IconButton
              type="button"
              onClick={voice.toggleRecording}
              disabled={!voice.isSupported || voice.isTranscribing}
              label={voice.isRecording ? 'Stop recording' : `Voice input${voice.provider === 'local' ? ' (Parakeet)' : ''}`}
              tooltip={voice.isRecording ? 'Stop recording' : `Voice input${voice.provider === 'local' ? ' (Parakeet)' : ''}`}
              variant={voice.isRecording ? "destructive" : "ghost"}
              pressed={voice.isRecording}
              size="md"
              focus="inside"
              clip
              className="relative group/mic"
            >
              {voice.isRecording ? (
                <Square size={20} className="relative z-10" />
              ) : (
                <>
                  <Mic size={22} className="relative z-10" />
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/mic:translate-y-0 transition-transform duration-300" />
                  <div className="absolute inset-0 rounded-xl border border-white/20 animate-pulse" />
                </>
              )}
            </IconButton>


          {/* Live waveform — visible when recording */}
          {voice.isRecording && (
            <div className="flex-1 min-w-0">
              <LiveWaveform
                active={voice.isRecording}
                height={48}
                barWidth={3}
                barGap={1}
                barRadius={1.5}
                sensitivity={1.2}
                mode="static"
                fadeEdges
                className="text-primary"
                stream={voice.stream}
              />
            </div>
          )}
        </div>

        {/* Text input */}
        <form onSubmit={onSubmit} className="relative group">
          {/* Glow effect on focus */}
          <div className="absolute -inset-1 bg-ring/20 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />

          <div className={cn(
            'relative bg-card border border-border rounded-2xl p-1.5 flex items-center gap-3',
            'shadow-[0_20px_50px_rgba(0,0,0,0.1)] focus-within:border-primary/30 transition-all'
          )}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Ri what's next..."
              className="flex-1 bg-transparent border-none outline-none text-base py-3 pl-3 placeholder:text-muted-foreground"
            />

            {isStreaming ? (
              <IconButton
                type="button"
                onClick={onStop}
                label="Stop agent"
                variant="ghost"
                size="xs"
                tone="danger"
              >
                <Square size={18} />
              </IconButton>
            ) : (
              <IconButton
                type="submit"
                disabled={!input.trim()}
                label="Send message"
                variant="primary"
                size="md"
              >
                <Send size={20} />
              </IconButton>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
