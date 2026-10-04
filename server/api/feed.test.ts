import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error JavaScript handler has no separate declaration file.
import handler from "./feed.js";

let nextIp = 0;
function call(query: Record<string, unknown>, method = "GET") {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  const headers = { "x-forwarded-for": `192.0.2.${++nextIp}-feed` };
  return handler({ method, query, headers }, res).then(() => res);
}
const code = (res: any) => res.status.mock.calls[0][0];
const body = (res: any) => res.json.mock.calls[0][0];

const item = (
  link: string,
  fields: { title?: string; description?: string; pubDate?: string } = {}
) =>
  `<item><title>${fields.title ?? "t"}</title><link>${link}</link>` +
  (fields.description === undefined
    ? ""
    : `<description><![CDATA[${fields.description}]]></description>`) +
  (fields.pubDate === undefined ? "" : `<pubDate>${fields.pubDate}</pubDate>`) +
  `</item>`;
const rss = (...items: string[]) =>
  `<rss><channel><title>x</title>${items.join("")}</channel></rss>`;
const ok = (xml: string) => ({ ok: true, status: 200, text: async () => xml });

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("/api/feed", () => {
  it("answers OPTIONS and rejects non-GET", async () => {
    expect(code(await call({}, "OPTIONS"))).toBe(204);
    expect(code(await call({ handle: "x" }, "POST"))).toBe(405);
  });

  it("rejects missing or malformed handles without fetching", async () => {
    for (const handle of [
      undefined,
      "",
      "a b",
      "../etc",
      "x".repeat(51),
      "a;b",
    ]) {
      const res = await call({ handle });
      expect(code(res), String(handle)).toBe(400);
      expect(body(res).items).toEqual([]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses items, prefers the longer description, strips HTML, derives ids", async () => {
    fetchMock.mockResolvedValue(
      ok(
        rss(
          item("https://nitter.net/JonHeyman/status/111#m", {
            title: "short…",
            description: "The full tweet<br/>second line &amp; more &lt;3",
            pubDate: "Fri, 02 Oct 2026 12:00:00 GMT",
          }),
          item("https://nitter.net/JonHeyman/status/222", {
            title: "title only",
          })
        )
      )
    );
    const res = await call({ handle: "JonHeyman" });
    expect(code(res)).toBe(200);
    const [first, second] = body(res).items;
    expect(first).toMatchObject({
      handle: "JonHeyman",
      text: "The full tweet\nsecond line & more <3",
      url: "https://nitter.net/JonHeyman/status/111#m",
      isoDate: "2026-10-02T12:00:00.000Z",
    });
    expect(first.id).toBe("111#m");
    expect(second).toMatchObject({
      id: "222",
      text: "title only",
      isoDate: null,
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      expect.stringContaining("s-maxage=300")
    );
  });

  it("skips items with no text or no link", async () => {
    fetchMock.mockResolvedValue(
      ok(
        rss(
          `<item><title></title><link>https://x/1</link></item>`,
          `<item><title>no link</title></item>`,
          item("https://x/3", { title: "kept" })
        )
      )
    );
    expect(
      body(await call({ handle: "a" })).items.map((i: any) => i.text)
    ).toEqual(["kept"]);
  });

  it("does not fail the whole feed over one unparseable date", async () => {
    fetchMock.mockResolvedValue(
      ok(
        rss(
          item("https://x/status/1", {
            title: "bad date",
            pubDate: "not a date",
          }),
          item("https://x/status/2", {
            title: "good date",
            pubDate: "Fri, 02 Oct 2026 12:00:00 GMT",
          })
        )
      )
    );
    const res = await call({ handle: "a" });
    expect(code(res)).toBe(200);
    const items = body(res).items;
    expect(items).toHaveLength(2);
    expect(items[0].isoDate).toBeNull();
    expect(items[1].isoDate).toBe("2026-10-02T12:00:00.000Z");
  });

  it("clamps the item limit between 1 and 25 and defaults to 10", async () => {
    const many = rss(
      ...Array.from({ length: 40 }, (_, i) =>
        item(`https://x/status/${i}`, { title: `t${i}` })
      )
    );
    fetchMock.mockResolvedValue(ok(many));
    expect(body(await call({ handle: "a", n: "3" })).items).toHaveLength(3);
    expect(body(await call({ handle: "a", n: "999" })).items).toHaveLength(25);
    expect(body(await call({ handle: "a", n: "-5" })).items).toHaveLength(1);
    expect(body(await call({ handle: "a", n: "junk" })).items).toHaveLength(10);
    expect(body(await call({ handle: "a" })).items).toHaveLength(10);
  });

  it("falls through failing hosts: HTTP errors and non-RSS bodies", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" })
      .mockResolvedValueOnce(ok("<html>Cloudflare challenge</html>"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        ok(rss(item("https://x/status/9", { title: "finally" })))
      );
    const res = await call({ handle: "a" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(body(res).items[0].text).toBe("finally");
    expect(body(res).error).toBeUndefined();
  });

  it("returns 200 with an empty list, error and detail when every host fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const res = await call({ handle: "a" });
    expect(code(res)).toBe(200);
    expect(body(res)).toMatchObject({
      handle: "a",
      items: [],
      error: "Feed unavailable",
      detail: "network down",
    });
    // Failures must not be cached at the CDN.
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Cache-Control",
      expect.anything()
    );
  });
});
