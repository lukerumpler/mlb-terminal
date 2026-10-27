import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const { upload, transcribe } = vi.hoisted(() => ({
  upload: vi.fn(),
  transcribe: vi.fn(),
}));

// Regression test: VoiceNoteRecorder called trpc.storage.upload.useMutation()
// and trpc.voice.transcribe.useMutation() directly in its component body,
// but App.jsx never imported trpc. That's a plain ReferenceError thrown on
// every render, not caught by tsc (App.jsx is untyped .jsx) or by prettier
// (the only "lint" this repo runs). Nothing exercised this component before
// this test existed, which is exactly how it went unnoticed.
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    storage: { upload: { useMutation: () => ({ mutateAsync: upload }) } },
    voice: { transcribe: { useMutation: () => ({ mutateAsync: transcribe }) } },
  },
}));

import {
  VoiceNoteRecorder,
  blobToBase64,
  uploadFormatFor,
} from "../client/src/App.jsx";

// A minimal MediaRecorder: stop() delivers one chunk (or none) and then fires onstop,
// like the real thing.
const fake = {
  mimeType: "audio/webm;codecs=opus",
  bytes: [1, 2, 3, 4],
  track: { stop: vi.fn() },
  last: null,
};
class FakeRecorder {
  constructor(stream) {
    this.stream = stream;
    this.state = "inactive";
    this.mimeType = fake.mimeType;
    fake.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(fake.bytes.length ? [new Uint8Array(fake.bytes)] : []),
    });
    this.onstop?.();
  }
}

beforeEach(() => {
  upload
    .mockReset()
    .mockResolvedValue({ url: "/manus-storage/voice-note-1_ab12cd34.webm" });
  transcribe.mockReset().mockResolvedValue({ text: "sits 94, good extension" });
  fake.mimeType = "audio/webm;codecs=opus";
  fake.bytes = [1, 2, 3, 4];
  fake.track.stop.mockReset();
  fake.last = null;
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [fake.track] }),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function record() {
  await act(async () => {
    fireEvent.click(screen.getByText("🎤"));
  });
  await screen.findByText("⏹");
  await act(async () => {
    fireEvent.click(screen.getByText("⏹"));
  });
}

describe("VoiceNoteRecorder", () => {
  it("renders without throwing (trpc must be imported and both mutations must resolve)", () => {
    expect(() =>
      render(<VoiceNoteRecorder onTranscribed={() => {}} onCancel={() => {}} />)
    ).not.toThrow();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("uploads the recording, transcribes the returned storage path and reports the text", async () => {
    const onTranscribed = vi.fn();
    render(
      <VoiceNoteRecorder onTranscribed={onTranscribed} onCancel={() => {}} />
    );
    await record();
    await waitFor(() =>
      expect(onTranscribed).toHaveBeenCalledWith("sits 94, good extension")
    );
    const sent = upload.mock.calls[0][0];
    expect(sent.type).toBe("audio/webm");
    expect(sent.name).toMatch(/^voice-note-\d+\.webm$/);
    expect(sent.base64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    expect(transcribe).toHaveBeenCalledWith({
      audioUrl: "/manus-storage/voice-note-1_ab12cd34.webm",
    });
  });

  it("labels a Safari (mp4) recording as mp4 instead of webm", async () => {
    fake.mimeType = "audio/mp4";
    render(<VoiceNoteRecorder onTranscribed={() => {}} onCancel={() => {}} />);
    await record();
    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toMatchObject({ type: "audio/mp4" });
    expect(upload.mock.calls[0][0].name).toMatch(/\.mp4$/);
  });

  it("does not trap the user when the upload fails: shows an error and re-enables the controls", async () => {
    upload.mockRejectedValue(new Error("network down"));
    const onCancel = vi.fn();
    render(<VoiceNoteRecorder onTranscribed={() => {}} onCancel={onCancel} />);
    await record();
    expect(
      await screen.findByText("Transcription failed. Please try again.")
    ).toBeInTheDocument();
    // Before the fix both buttons stayed disabled forever inside a full-screen dialog.
    expect(screen.getByText("Cancel")).toBeEnabled();
    expect(screen.getByText("🎤").closest("button")).toBeEnabled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("recovers the same way when transcription fails, and names the rate limit", async () => {
    transcribe.mockRejectedValueOnce(new Error("boom"));
    render(<VoiceNoteRecorder onTranscribed={() => {}} onCancel={() => {}} />);
    await record();
    expect(
      await screen.findByText("Transcription failed. Please try again.")
    ).toBeInTheDocument();
    expect(screen.getByText("🎤").closest("button")).toBeEnabled();

    upload.mockRejectedValueOnce(
      Object.assign(new Error("x"), { data: { code: "TOO_MANY_REQUESTS" } })
    );
    await record();
    expect(await screen.findByText(/Too many voice notes/)).toBeInTheDocument();
  });

  it("refuses an empty recording without uploading it", async () => {
    fake.bytes = [];
    render(<VoiceNoteRecorder onTranscribed={() => {}} onCancel={() => {}} />);
    await record();
    expect(
      await screen.findByText(/No audio was captured/)
    ).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("releases the microphone and uploads nothing when closed mid-recording", async () => {
    const { unmount } = render(
      <VoiceNoteRecorder onTranscribed={() => {}} onCancel={() => {}} />
    );
    await act(async () => {
      fireEvent.click(screen.getByText("🎤"));
    });
    await screen.findByText("⏹");
    unmount();
    expect(fake.track.stop).toHaveBeenCalled();
    expect(fake.last.state).toBe("inactive");
    await new Promise(r => setTimeout(r, 20));
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports a denied microphone", async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error("denied"));
    render(<VoiceNoteRecorder onTranscribed={() => {}} onCancel={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByText("🎤"));
    });
    expect(
      await screen.findByText("Microphone access denied or unavailable.")
    ).toBeInTheDocument();
  });
});

describe("recording helpers", () => {
  it("maps recorder MIME types (with codec parameters) to an accepted type and extension", () => {
    expect(uploadFormatFor("audio/webm;codecs=opus")).toEqual({
      type: "audio/webm",
      ext: "webm",
    });
    expect(uploadFormatFor("audio/mp4")).toEqual({
      type: "audio/mp4",
      ext: "mp4",
    });
    expect(uploadFormatFor("audio/ogg; codecs=opus")).toEqual({
      type: "audio/ogg",
      ext: "ogg",
    });
    expect(uploadFormatFor("video/webm")).toEqual({
      type: "audio/webm",
      ext: "webm",
    });
    expect(uploadFormatFor(undefined)).toEqual({
      type: "audio/webm",
      ext: "webm",
    });
  });

  it("blobToBase64 returns only the payload and rejects when the blob cannot be read", async () => {
    await expect(blobToBase64(new Blob(["hello"]))).resolves.toBe(
      Buffer.from("hello").toString("base64")
    );
    const original = globalThis.FileReader;
    class Broken {
      readAsDataURL() {
        this.error = new Error("unreadable");
        setTimeout(() => this.onerror?.());
      }
    }
    globalThis.FileReader = Broken;
    try {
      await expect(blobToBase64(new Blob(["x"]))).rejects.toThrow("unreadable");
    } finally {
      globalThis.FileReader = original;
    }
  });
});
