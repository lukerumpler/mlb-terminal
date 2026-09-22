import { describe, expect, it, afterEach } from "vitest";
import {
  applyImportedNotes,
  buildNotesExportPayload,
  normalizeImportedNotes,
  playerNotesStorageKey,
  readPlayerNotes,
  removeNoteTag,
  renameNoteTag,
  sortPlayerNotes,
  writePlayerNotes,
} from "../client/src/pages/playerNotes.js";

describe("player note sorting and management", () => {
  const notes = [
    {
      id: "a",
      category: "Scouting",
      createdAt: 100,
      text: "A",
      tags: ["contact", "review"],
    },
    {
      id: "b",
      category: "Medical",
      createdAt: 300,
      text: "B",
      tags: ["review"],
    },
    { id: "c", category: "Development", createdAt: 200, text: "C", tags: [] },
  ];

  it("sorts newest and oldest observations by timestamp", () => {
    expect(sortPlayerNotes(notes, "date-desc").map(note => note.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortPlayerNotes(notes, "date-asc").map(note => note.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("sorts observations by category and uses recency as a stable tie-breaker", () => {
    expect(
      sortPlayerNotes(notes, "category").map(note => note.category)
    ).toEqual(["Development", "Medical", "Scouting"]);
  });

  it("renames and removes tags across every observation without duplicating replacements", () => {
    expect(
      renameNoteTag(notes, "review", "follow-up").map(note => note.tags)
    ).toEqual([["contact", "follow-up"], ["follow-up"], []]);
    expect(removeNoteTag(notes, "review").map(note => note.tags)).toEqual([
      ["contact"],
      [],
      [],
    ]);
  });

  it("builds a portable export payload and applies merge or replace imports", () => {
    const payload = buildNotesExportPayload(
      7,
      "Test Player",
      notes,
      "2026-08-14T00:00:00.000Z"
    );
    expect(payload).toMatchObject({
      schema: "skip-player-notes/v1",
      playerId: 7,
      playerName: "Test Player",
      exportedAt: "2026-08-14T00:00:00.000Z",
    });
    expect(payload.observations).toHaveLength(3);
    const incoming = [
      {
        id: "b",
        text: "Updated B",
        category: "Medical",
        tags: ["new"],
        createdAt: 400,
      },
      { id: "d", text: "D", category: "Scouting", tags: [], createdAt: 500 },
    ];
    expect(
      applyImportedNotes(notes, incoming, "merge").map(note => note.id)
    ).toEqual(["b", "d", "a", "c"]);
    expect(
      applyImportedNotes(notes, incoming, "replace").map(note => note.id)
    ).toEqual(["b", "d"]);
  });

  it("normalizes supported JSON imports and rejects malformed rows", () => {
    const imported = normalizeImportedNotes({
      observations: [
        {
          id: "x",
          text: "Imported note",
          category: "Medical",
          tags: ["#rehab", "rehab"],
          createdAt: 123,
        },
        { id: "bad", text: "" },
        {
          id: "fallback",
          text: "Unknown category",
          category: "Unknown",
          tags: "not-an-array",
        },
      ],
    });
    expect(imported).toHaveLength(2);
    expect(imported[0]).toMatchObject({
      id: "x",
      category: "Medical",
      tags: ["rehab"],
      createdAt: 123,
    });
    expect(imported[1]).toMatchObject({
      id: "fallback",
      category: "Scouting",
      tags: [],
    });
    expect(normalizeImportedNotes({ bad: true })).toEqual([]);
  });
});

// §29 audit: writePlayerNotes() replaces what used to be an unguarded
// localStorage.setItem() call inline in PlayersPage.jsx's useEffect — it
// re-ran on every keystroke while editing a scouting note, so an unguarded
// throw there (private browsing, quota exceeded) would have crashed the
// whole Player Profile tab's render repeatedly, not just once.
describe("writePlayerNotes (persists scouting notes, must never throw)", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips through readPlayerNotes via real localStorage", () => {
    const observations = [
      { id: "a", text: "Good bat speed", category: "Scouting", tags: ["power"], createdAt: 1 },
    ];
    writePlayerNotes("660271", observations);
    expect(JSON.parse(localStorage.getItem(playerNotesStorageKey("660271")))).toEqual(observations);
    expect(readPlayerNotes("660271")).toMatchObject([{ id: "a", text: "Good bat speed" }]);
  });

  it("does nothing (and does not throw) without a playerId", () => {
    expect(() => writePlayerNotes(null, [{ id: "a", text: "x", category: "Scouting", tags: [], createdAt: 1 }])).not.toThrow();
    expect(() => writePlayerNotes(undefined, [])).not.toThrow();
  });

  it("swallows a storage failure instead of throwing (private browsing / quota exceeded)", () => {
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    try {
      expect(() => writePlayerNotes("660271", [{ id: "a", text: "x", category: "Scouting", tags: [], createdAt: 1 }])).not.toThrow();
    } finally {
      Storage.prototype.setItem = realSetItem;
    }
  });
});
