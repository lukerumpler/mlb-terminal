import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storagePut, storageGetSignedUrl } = vi.hoisted(() => ({
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
}));
vi.mock("./storage", () => ({ storagePut, storageGetSignedUrl }));
vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.test",
    forgeApiKey: "test-key",
    isProduction: false,
  },
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

let nextIp = 0;
const caller = (ip?: string) =>
  appRouter.createCaller({
    user: null,
    req: {
      protocol: "https",
      headers: { "x-forwarded-for": ip ?? `203.0.113.${++nextIp}-vs` },
    },
    res: {},
  } as unknown as TrpcContext);

const validUpload = {
  name: "voice-note-1700000000000.webm",
  type: "audio/webm" as const,
  base64: Buffer.from("fake-audio-bytes").toString("base64"),
};

const fetchMock = vi.fn();
beforeEach(() => {
  storagePut
    .mockReset()
    .mockResolvedValue({ key: "k", url: "/manus-storage/k" });
  storageGetSignedUrl.mockReset().mockResolvedValue("https://s3.test/signed");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("storage.upload", () => {
  it("stores a short audio recording and returns its storage path", async () => {
    await expect(caller().storage.upload(validUpload)).resolves.toEqual({
      key: "k",
      url: "/manus-storage/k",
    });
    const [name, data, type] = storagePut.mock.calls[0];
    expect(name).toBe(validUpload.name);
    expect(Buffer.isBuffer(data)).toBe(true);
    expect(type).toBe("audio/webm");
  });

  it.each(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"])(
    "accepts %s",
    async type => {
      await expect(
        caller().storage.upload({ ...validUpload, type: type as never })
      ).resolves.toBeTruthy();
    }
  );

  it.each([
    "text/html",
    "image/svg+xml",
    "application/javascript",
    "application/octet-stream",
    "audio/webm; charset=utf-8",
    "",
  ])(
    "refuses content type %j so the bucket cannot host arbitrary content",
    async type => {
      await expect(
        caller().storage.upload({ ...validUpload, type: type as never })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(storagePut).not.toHaveBeenCalled();
    }
  );

  it.each([
    "",
    "../evil.webm",
    "a/b.webm",
    ".hidden.webm",
    "x y.webm",
    "a\\b.webm",
    "n".repeat(101) + ".webm",
  ])("refuses file name %j", async name => {
    await expect(
      caller().storage.upload({ ...validUpload, name })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("refuses empty and oversized payloads", async () => {
    await expect(
      caller().storage.upload({ ...validUpload, base64: "" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // Decodes to zero bytes.
    await expect(
      caller().storage.upload({ ...validUpload, base64: "A" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // Just over 16 MB decoded, and far past the schema's length cap.
    const over = "A".repeat(23_000_000);
    await expect(
      caller().storage.upload({ ...validUpload, base64: over })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("throttles a single client (10 per minute) without affecting others", async () => {
    const ip = "198.51.100.150";
    for (let i = 0; i < 10; i++) await caller(ip).storage.upload(validUpload);
    await expect(caller(ip).storage.upload(validUpload)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(storagePut).toHaveBeenCalledTimes(10);
    await expect(caller().storage.upload(validUpload)).resolves.toBeTruthy();
  });
});

describe("voice.transcribe", () => {
  it("refuses URLs outside our storage without making any request", async () => {
    for (const audioUrl of [
      "http://169.254.169.254/latest/meta-data/",
      "https://evil.example/a.webm",
      "file:///etc/passwd",
    ]) {
      await expect(
        caller().voice.transcribe({ audioUrl })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("transcribes the path returned by storage.upload end to end", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "audio/webm" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "good swing path", language: "en" }),
      });

    const uploaded = await caller().storage.upload(validUpload);
    const result = await caller().voice.transcribe({ audioUrl: uploaded.url });
    expect(result).toMatchObject({ text: "good swing path" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://s3.test/signed");
  });

  it("rejects over-long fields at the boundary", async () => {
    await expect(
      caller().voice.transcribe({
        audioUrl: "/manus-storage/" + "a".repeat(400),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().voice.transcribe({
        audioUrl: "/manus-storage/a.webm",
        prompt: "p".repeat(501),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throttles a single client like the other paid-LLM routes", async () => {
    const ip = "198.51.100.151";
    const outcomes: string[] = [];
    for (let i = 0; i < 12; i++) {
      try {
        await caller(ip).voice.transcribe({
          audioUrl: "https://evil.example/a.webm",
        });
      } catch (error) {
        outcomes.push((error as { code: string }).code);
      }
    }
    expect(outcomes.slice(0, 8).every(code => code === "BAD_REQUEST")).toBe(
      true
    );
    expect(outcomes.slice(8).every(code => code === "TOO_MANY_REQUESTS")).toBe(
      true
    );
  });
});
