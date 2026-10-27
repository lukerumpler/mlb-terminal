import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storageGetSignedUrl } = vi.hoisted(() => ({
  storageGetSignedUrl: vi.fn(),
}));
vi.mock("../storage", () => ({ storageGetSignedUrl }));
vi.mock("./env", () => ({
  ENV: { forgeApiUrl: "https://forge.test", forgeApiKey: "test-key" },
}));

import { storageKeyFromAudioUrl, transcribeAudio } from "./voiceTranscription";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  storageGetSignedUrl
    .mockReset()
    .mockResolvedValue("https://s3.test/signed?sig=abc");
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const audioResponse = (over: Record<string, unknown> = {}) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  headers: new Headers({ "content-type": "audio/webm;codecs=opus" }),
  arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
  ...over,
});
const whisper = {
  ok: true,
  json: async () => ({ text: "fastball up and in", language: "en" }),
};

describe("storageKeyFromAudioUrl", () => {
  it("accepts only /manus-storage/<key> paths made of safe characters", () => {
    expect(
      storageKeyFromAudioUrl("/manus-storage/voice-note-1_ab12cd34.webm")
    ).toBe("voice-note-1_ab12cd34.webm");
    expect(storageKeyFromAudioUrl("/manus-storage/notes/2026/a-b_c.mp4")).toBe(
      "notes/2026/a-b_c.mp4"
    );
  });

  it.each([
    "",
    "/manus-storage/",
    "/manus-storage/../../etc/passwd",
    "/manus-storage/a/../b",
    "/manus-storage/./a",
    "/manus-storage//a",
    "/manus-storage/a b",
    "/manus-storage/a?x=1",
    "/manus-storage/a#frag",
    "/manus-storage/%2e%2e/a",
    "/etc/passwd",
    "//evil.example/manus-storage/a",
    "https://evil.example/manus-storage/a.webm",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/manus-storage/a",
    "file:///etc/passwd",
    "manus-storage/a",
    "/manus-storage/" + "a".repeat(260),
  ])("rejects %s", value => {
    expect(storageKeyFromAudioUrl(value)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(storageKeyFromAudioUrl(undefined as never)).toBeNull();
    expect(storageKeyFromAudioUrl(42 as never)).toBeNull();
  });
});

describe("transcribeAudio", () => {
  it("never makes a request for a URL that is not our own storage path (SSRF guard)", async () => {
    for (const audioUrl of [
      "http://169.254.169.254/latest/meta-data/",
      "https://evil.example/a.webm",
      "file:///etc/passwd",
      "/manus-storage/../../secret",
    ]) {
      const result = await transcribeAudio({ audioUrl });
      expect(result).toMatchObject({ code: "INVALID_FORMAT" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("resolves a stored path to a signed URL, downloads it, and sends it to Whisper", async () => {
    fetchMock
      .mockResolvedValueOnce(audioResponse())
      .mockResolvedValueOnce(whisper);
    const result = await transcribeAudio({
      audioUrl: "/manus-storage/voice-note-1_ab12cd34.webm",
    });

    expect(result).toMatchObject({ text: "fastball up and in" });
    expect(storageGetSignedUrl).toHaveBeenCalledWith(
      "voice-note-1_ab12cd34.webm"
    );
    // The audio is fetched from the SIGNED absolute URL, never the relative path
    // (a relative URL makes server-side fetch throw "Failed to parse URL").
    expect(fetchMock.mock.calls[0][0]).toBe("https://s3.test/signed?sig=abc");
    const [whisperUrl, init] = fetchMock.mock.calls[1];
    expect(String(whisperUrl)).toBe(
      "https://forge.test/v1/audio/transcriptions"
    );
    expect(init.headers.authorization).toBe("Bearer test-key");
    // ";codecs=opus" is stripped so the file gets a real extension.
    expect((init.body.get("file") as File).name).toBe("audio.webm");
  });

  it("refuses an oversized file from its declared length, before buffering it", async () => {
    const big = audioResponse({
      headers: new Headers({
        "content-type": "audio/webm",
        "content-length": String(20 * 1024 * 1024),
      }),
    });
    fetchMock.mockResolvedValueOnce(big);
    const result = await transcribeAudio({
      audioUrl: "/manus-storage/big.webm",
    });
    expect(result).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(big.arrayBuffer).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a signing failure and a failed download as errors, not crashes", async () => {
    storageGetSignedUrl.mockRejectedValueOnce(
      new Error("Storage signed URL failed (404): no such key")
    );
    expect(
      await transcribeAudio({ audioUrl: "/manus-storage/missing.webm" })
    ).toMatchObject({
      code: "SERVICE_ERROR",
      details: expect.stringContaining("no such key"),
    });

    fetchMock.mockResolvedValueOnce(
      audioResponse({ ok: false, status: 403, statusText: "Forbidden" })
    );
    expect(
      await transcribeAudio({ audioUrl: "/manus-storage/expired.webm" })
    ).toMatchObject({
      code: "INVALID_FORMAT",
      details: "HTTP 403: Forbidden",
    });
  });
});
