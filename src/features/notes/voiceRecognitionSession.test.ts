import { describe, expect, it, vi } from "vitest";
import type { VoiceRecognitionErrorEvent, VoiceRecognitionLike, VoiceRecognitionResultEvent } from "./voiceRecognitionSession";
import { VoiceRecognitionSession } from "./voiceRecognitionSession";

function createRecognition(start = vi.fn(), stop = vi.fn()): VoiceRecognitionLike {
  return {
    continuous: false,
    interimResults: false,
    lang: "",
    onend: null,
    onerror: null,
    onresult: null,
    start,
    stop
  };
}

const callbacks = () => ({
  onResult: vi.fn<(event: VoiceRecognitionResultEvent) => void>(),
  onError: vi.fn<(event: VoiceRecognitionErrorEvent) => void>(),
  onEnd: vi.fn<() => void>()
});

describe("VoiceRecognitionSession", () => {
  it("ignores a stale end callback after a second session starts", () => {
    const session = new VoiceRecognitionSession();
    const first = createRecognition();
    const firstCallbacks = callbacks();
    session.start(first, firstCallbacks);
    const staleEnd = first.onend!;

    session.stop();
    const second = createRecognition();
    const secondCallbacks = callbacks();
    session.start(second, secondCallbacks);
    staleEnd();

    expect(session.active).toBe(true);
    expect(firstCallbacks.onEnd).not.toHaveBeenCalled();
    second.onend!();
    expect(session.active).toBe(false);
    expect(secondCallbacks.onEnd).toHaveBeenCalledOnce();
  });

  it("deduplicates start while recognition is already active", () => {
    const session = new VoiceRecognitionSession();
    const first = createRecognition();
    const duplicate = createRecognition();

    expect(session.start(first, callbacks())).toBe("started");
    expect(session.start(duplicate, callbacks())).toBe("active");
    expect(first.start).toHaveBeenCalledOnce();
    expect(duplicate.start).not.toHaveBeenCalled();
  });

  it("returns to idle when the browser rejects start", () => {
    const session = new VoiceRecognitionSession();
    const recognition = createRecognition(vi.fn(() => { throw new Error("busy"); }));

    expect(session.start(recognition, callbacks())).toBe("failed");
    expect(session.active).toBe(false);
    expect(recognition.onend).toBeNull();
  });
});
