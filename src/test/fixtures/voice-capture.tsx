import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TipProvider } from '@/components/ui/tip';
import { WorkContext, type WorkActivity, type WorkNavigation } from '@/contexts/work-context';
import { trpc } from '@/lib/trpc/client';
import { ExecutionComposer } from '@/components/executions/execution-composer';
import { QuickCaptureModal } from '@/components/dashboard/quick-capture-modal';

// The real chat composer and Quick Capture over the real voice hook. Only
// the outside world is played here: a microphone (an oscillator), a
// MediaRecorder, the browser's speech recognition, and the home's answers
// (provider status and user state, seeded in the cache). Transcription
// requests go to `/api/transcribe`, which the test holds and answers.
//
//   ?surface=composer|capture  &model=<voice model id>  &autoSend=0|1

declare global {
  interface Window {
    voiceFixture: {
      sent: { text: string; viaVoice?: boolean }[];
      recognitions: number;
      aborted: number;
      /** Deliver final results to the running recognition, from `index`. */
      say(index: number, ...texts: string[]): void;
      /** The browser ends recognition (after Stop, or on its own). */
      end(): void;
      /** The browser reports a recognition error. */
      fail(code: string): void;
    };
  }
}

const params = new URLSearchParams(location.search);
const surface = params.get('surface') ?? 'composer';
const model = params.get('model') ?? 'local/parakeet-tdt-0.6b-v3';
const autoSend = params.get('autoSend') !== '0';

// ─── The microphone and recorder ────────────────────────────────
class FakeRecorder {
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  requestData() { this.ondataavailable?.({ data: new Blob(['recorded audio']) }); }
  stop() {
    this.state = 'inactive';
    setTimeout(() => { this.requestData(); this.onstop?.(); }, 0);
  }
}
Object.assign(window, { MediaRecorder: FakeRecorder });
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    async getUserMedia() {
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      const out = audio.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      return out.stream;
    },
  },
});

// ─── Browser speech recognition ─────────────────────────────────
const recognitions: FakeRecognition[] = [];
const running = () => recognitions.at(-1);
const results: { 0: { transcript: string }; isFinal: boolean; length: number }[] = [];
class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor() { recognitions.push(this); }
  start() { results.length = 0; window.voiceFixture.recognitions += 1; }
  stop() { /* The browser finishes on its own time: the test calls end(). */ }
  abort() { window.voiceFixture.aborted += 1; this.onerror?.({ error: 'aborted' }); this.onend?.(); }
}
Object.assign(window, { SpeechRecognition: FakeRecognition });

window.voiceFixture = {
  sent: [],
  recognitions: 0,
  aborted: 0,
  say(index, ...texts) {
    texts.forEach((transcript, offset) => { results[index + offset] = { 0: { transcript }, isFinal: true, length: 1 }; });
    running()?.onresult?.({ resultIndex: index, results });
  },
  end() { running()?.onend?.(); },
  fail(code) { running()?.onerror?.({ error: code }); running()?.onend?.(); },
};

// ─── The home ───────────────────────────────────────────────────
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
client.setQueryData(trpc.transcribe.status.queryKey({}), {
  providers: { local: { available: true, configured: true }, groq: { available: true, configured: true }, web: { available: true, configured: true } },
});
// Only the fields the voice controls read. The rest of the record doesn't matter here.
client.setQueryData(trpc.userState.list.queryKey({}), { voiceModel: model, voiceAutoSend: autoSend } as never);

const navigation: WorkNavigation = { openAgent() {}, openExecution() {}, openTask() {}, openNote() {}, goHome() {} };
const activity: WorkActivity = {
  activeSessionId: null, streamingSessionIds: new Set(), backgroundSessionIds: new Set(), pendingInputSessionIds: new Set(),
  setActiveExecutionId() {}, setSessionStreaming() {},
};

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><TipProvider><WorkContext navigation={navigation} activity={activity}>
    <main className="bg-background text-foreground" style={{ paddingTop: 120 }}>
      {surface === 'capture'
        ? <QuickCaptureModal open onOpenChange={() => {}} />
        : <ExecutionComposer
            sessionId="chat-voice"
            autoFocus={false}
            permissionMode="auto_all"
            harness="claude"
            model="opus"
            effort="medium"
            onSend={(text, opts) => { window.voiceFixture.sent.push({ text, viaVoice: opts?.viaVoice }); }}
          />}
    </main>
  </WorkContext></TipProvider></QueryClientProvider>,
);
