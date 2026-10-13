import { describe, expect, it } from "vitest";
import { __parseFeedForTests } from "./news.js";
import { __parseRssForTests } from "./feed.js";

const source = { key: "k", label: "K", tier: 1 };
const rss = `<rss><channel><title>Feed</title>
<item><title><![CDATA[Padres rally &amp; win]]></title><link>https://e.com/1</link><description><![CDATA[<p>Full recap: Padres win</p>]]></description><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Short</title><guid isPermaLink="false">https://e.com/2</guid><description>A longer plain description</description></item>
<item><title>No link here</title><description>skipped</description></item>
<item><title>Dup</title><link>https://e.com/1</link></item>
</channel></rss>`;
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom one</title><link href="https://e.com/a" rel="alternate"/><id>https://e.com/a</id><summary>Sum &lt;b&gt;x&lt;/b&gt;</summary><updated>2026-10-12T10:00:00Z</updated></entry></feed>`;

describe("news feed parser (RSS and Atom)", () => {
  it("unwraps CDATA, decodes entities, prefers the longer description and skips link-less items", () => {
    const items = __parseFeedForTests(rss, source, 20);
    expect(items.map(i => i.url)).toEqual([
      "https://e.com/1",
      "https://e.com/2",
    ]);
    expect(items[0]).toMatchObject({
      title: "Padres rally & win",
      text: "Full recap: Padres win",
      isoDate: "2026-10-12T10:00:00.000Z",
    });
    expect(items[1]).toMatchObject({
      title: "Short",
      text: "A longer plain description",
      isoDate: null,
    });
  });

  it("dedupes by url and honours the limit", () => {
    expect(__parseFeedForTests(rss, source, 20)).toHaveLength(2);
    expect(__parseFeedForTests(rss, source, 1)).toHaveLength(1);
  });

  it("reads an Atom entry whose <link> is self-closing by falling back to <id>", () => {
    expect(__parseFeedForTests(atom, source, 20)).toEqual([
      expect.objectContaining({
        url: "https://e.com/a",
        title: "Atom one",
        text: "Sum <b>x</b>",
        isoDate: "2026-10-12T10:00:00.000Z",
      }),
    ]);
  });
});

describe("social RSS parser", () => {
  it("returns id, text, url and date, and drops a repeated item", () => {
    const items = __parseRssForTests(rss, "h");
    expect(items.map(i => i.id)).toEqual(["1", "2"]);
    expect(items[0]).toMatchObject({
      text: "Full recap: Padres win",
      url: "https://e.com/1",
      isoDate: "2026-10-12T10:00:00.000Z",
    });
    expect(items[1]).toMatchObject({
      text: "A longer plain description",
      isoDate: null,
    });
  });

  it("ignores an item whose description contains raw markup instead of guessing", () => {
    const xml =
      "<item><title>T</title><link>https://e.com/9</link><description>a <b>b</b></description></item>";
    expect(__parseRssForTests(xml, "h")[0]).toMatchObject({ text: "T" });
  });

  it("survives an unparseable date", () => {
    const xml =
      "<item><title>T</title><link>https://e.com/9</link><pubDate>not a date</pubDate></item>";
    expect(__parseRssForTests(xml, "h")[0].isoDate).toBeNull();
  });
});

// Each shape took 1-8 s of CPU on the lazy-regex parsers at this size (quadratic); a garbled or
// truncated feed must never be able to stall the shared event loop.
describe("garbled feeds are parsed in linear time", () => {
  const n = 20_000;
  const shapes: Record<string, string> = {
    "unclosed <item>": "<item>".repeat(n),
    "unclosed <item><title": "<item><title".repeat(n),
    "<title with no >": `<item>${"<title ".repeat(n)}</item>`,
    "unclosed <entry>": "<entry>".repeat(n),
    "unclosed CDATA openers": `<item>${"<title><![CDATA[".repeat(n)}</title></item>`,
    "many unclosed <title>": `<item>${"<title>".repeat(n)}</title></item>`,
  };
  for (const [name, xml] of Object.entries(shapes)) {
    it(`${name} (${Math.round(xml.length / 1000)} KB)`, () => {
      const start = performance.now();
      __parseFeedForTests(xml, source, 20);
      __parseRssForTests(xml, "h");
      expect(performance.now() - start).toBeLessThan(500);
    });
  }

  it("still returns the valid item that precedes the garbage", () => {
    const xml = `<item><title>ok</title><link>https://e.com/1</link></item>${"<item><title".repeat(n)}`;
    expect(__parseFeedForTests(xml, source, 20).map(i => i.url)).toEqual([
      "https://e.com/1",
    ]);
    expect(__parseRssForTests(xml, "h").map(i => i.url)).toEqual([
      "https://e.com/1",
    ]);
  });
});
