export interface VoiceRecognitionResultEvent extends Event {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

export interface VoiceRecognitionErrorEvent extends Event {
  error?: string;
}

export interface VoiceRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: VoiceRecognitionErrorEvent) => void) | null;
  onresult: ((event: VoiceRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

export type VoiceRecognitionConstructor = new () => VoiceRecognitionLike;

interface VoiceRecognitionCallbacks {
  onResult: (event: VoiceRecognitionResultEvent) => void;
  onError: (event: VoiceRecognitionErrorEvent) => void;
  onEnd: () => void;
}

export class VoiceRecognitionSession {
  private current: VoiceRecognitionLike | null = null;

  get active() {
    return this.current !== null;
  }

  start(recognition: VoiceRecognitionLike, callbacks: VoiceRecognitionCallbacks) {
    if (this.current) return "active" as const;
    this.current = recognition;
    recognition.onresult = (event) => {
      if (this.current === recognition) callbacks.onResult(event);
    };
    recognition.onerror = (event) => {
      if (this.current !== recognition) return;
      this.current = null;
      this.detach(recognition);
      callbacks.onError(event);
    };
    recognition.onend = () => {
      if (this.current !== recognition) return;
      this.current = null;
      this.detach(recognition);
      callbacks.onEnd();
    };
    try {
      recognition.start();
      return "started" as const;
    } catch {
      this.current = null;
      this.detach(recognition);
      return "failed" as const;
    }
  }

  stop() {
    const recognition = this.current;
    this.current = null;
    if (!recognition) return;
    this.detach(recognition);
    try {
      recognition.stop();
    } catch {
      // Browsers may end the native session before React finishes closing the sheet.
    }
  }

  private detach(recognition: VoiceRecognitionLike) {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }
}
