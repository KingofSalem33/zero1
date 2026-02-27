import {
  buildAuthSessionPayload,
  buildLibraryConnectionUpdatePayload,
  buildLibraryMapSession,
  parseBookmarksResponse,
  parseHighlightsResponse,
  parseLibraryBundleCreateResponse,
  parseLibraryConnectionMutationResponse,
  parseLibraryConnectionsResponse,
  parseLibraryMapMutationResponse,
  parseLibraryMapsResponse,
} from "@zero1/shared";

describe("shared API contracts", () => {
  it("parses bookmark payload from API shape", () => {
    const parsed = parseBookmarksResponse({
      bookmarks: [
        {
          id: "bm-1",
          text: "Genesis 1:1",
          created_at: "2026-02-27T00:00:00.000Z",
          user_id: "user-1",
        },
      ],
    });

    expect(parsed).toEqual([
      {
        id: "bm-1",
        text: "Genesis 1:1",
        createdAt: "2026-02-27T00:00:00.000Z",
        userId: "user-1",
      },
    ]);
  });

  it("parses highlight payload and preserves valid verses in mixed arrays", () => {
    const parsed = parseHighlightsResponse({
      highlights: [
        {
          id: "hl-1",
          book: "Genesis",
          chapter: 1,
          verses: [1, "bad-value", 3],
          text: "In the beginning",
          color: "#facc15",
          note: "seed",
          created_at: "2026-02-27T00:00:00.000Z",
          updated_at: "2026-02-27T00:01:00.000Z",
        },
      ],
    });

    expect(parsed[0]).toMatchObject({
      id: "hl-1",
      book: "Genesis",
      chapter: 1,
      verses: [1, 3],
      referenceLabel: "Genesis 1:1-3",
      text: "In the beginning",
    });
  });

  it("parses library connections payload with snake_case API fields", () => {
    const parsed = parseLibraryConnectionsResponse({
      connections: [
        {
          id: "conn-1",
          bundle_id: "bundle-1",
          connection_type: "cross_reference",
          similarity: 0.82,
          synopsis: "Shared covenant language",
          from_verse: { reference: "Genesis 12:3", text: "..." },
          to_verse: { reference: "Galatians 3:8", text: "..." },
          tags: ["covenant", "promise"],
          created_at: "2026-02-27T00:02:00.000Z",
          bundleMeta: {
            anchorRef: "Genesis 12:3",
            verseCount: 8,
            edgeCount: 6,
          },
        },
      ],
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "conn-1",
      bundleId: "bundle-1",
      connectionType: "cross_reference",
      similarity: 0.82,
      synopsis: "Shared covenant language",
      fromVerse: { reference: "Genesis 12:3", text: "..." },
      toVerse: { reference: "Galatians 3:8", text: "..." },
      tags: ["covenant", "promise"],
      createdAt: "2026-02-27T00:02:00.000Z",
      bundleMeta: {
        anchorRef: "Genesis 12:3",
        verseCount: 8,
        edgeCount: 6,
      },
    });
  });

  it("parses library maps payload with optional bundle metadata", () => {
    const parsed = parseLibraryMapsResponse({
      maps: [
        {
          id: "map-1",
          bundle_id: "bundle-1",
          title: "Pauline links",
          note: "Review this in study",
          tags: ["paul", "ot"],
          created_at: "2026-02-27T00:03:00.000Z",
          updated_at: "2026-02-27T00:04:00.000Z",
          bundleMeta: { anchorRef: "Romans 4:3", verseCount: 10, edgeCount: 7 },
        },
      ],
    });

    expect(parsed).toEqual([
      {
        id: "map-1",
        bundleId: "bundle-1",
        title: "Pauline links",
        note: "Review this in study",
        tags: ["paul", "ot"],
        createdAt: "2026-02-27T00:03:00.000Z",
        updatedAt: "2026-02-27T00:04:00.000Z",
        bundleMeta: {
          anchorRef: "Romans 4:3",
          verseCount: 10,
          edgeCount: 7,
        },
        bundle: undefined,
      },
    ]);
  });

  it("parses create bundle response payload", () => {
    const parsed = parseLibraryBundleCreateResponse({
      bundleId: "bundle-abc",
      existing: true,
    });

    expect(parsed).toEqual({
      bundleId: "bundle-abc",
      existing: true,
    });
  });

  it("parses connection mutation response payload", () => {
    const parsed = parseLibraryConnectionMutationResponse({
      existing: false,
      connection: {
        id: "conn-42",
        bundle_id: "bundle-1",
        connection_type: "LEXICON",
        similarity: 0.75,
        synopsis: "Shared covenant language",
        from_verse: { id: 1001, reference: "Genesis 12:3", text: "..." },
        to_verse: { id: 2002, reference: "Galatians 3:8", text: "..." },
      },
    });

    expect(parsed.existing).toBe(false);
    expect(parsed.connection).toMatchObject({
      id: "conn-42",
      bundleId: "bundle-1",
      connectionType: "LEXICON",
      fromVerse: { id: 1001, reference: "Genesis 12:3", text: "..." },
      toVerse: { id: 2002, reference: "Galatians 3:8", text: "..." },
    });
  });

  it("parses map mutation response payload", () => {
    const parsed = parseLibraryMapMutationResponse({
      existing: true,
      map: {
        id: "map-42",
        bundle_id: "bundle-1",
        title: "Genesis Map",
        note: "Check later",
      },
    });

    expect(parsed).toMatchObject({
      existing: true,
      map: {
        id: "map-42",
        bundleId: "bundle-1",
        title: "Genesis Map",
        note: "Check later",
      },
    });
  });

  it("builds map session and normalizes verse ids", () => {
    const session = buildLibraryMapSession({
      fromId: 101,
      toId: 202,
      connectionType: "LEXICON",
      verseIds: [202, 202, 303],
    });

    expect(session).toEqual({
      cluster: {
        baseId: 101,
        verseIds: [101, 202, 303],
        connectionType: "LEXICON",
      },
      currentConnection: {
        fromId: 101,
        toId: 202,
        connectionType: "LEXICON",
      },
      visitedEdgeKeys: ["LEXICON:101-202"],
    });
  });

  it("builds connection update payload with trimmed tags", () => {
    const payload = buildLibraryConnectionUpdatePayload({
      note: "  Keep this together  ",
      tags: [" covenant ", "", "promise", "covenant"],
    });

    expect(payload).toEqual({
      note: "Keep this together",
      tags: ["covenant", "promise"],
    });
  });

  it("builds auth/session payload summary", () => {
    const payload = buildAuthSessionPayload({
      session: { access_token: "token" },
      user: { id: "user-1", email: "test@example.com" },
      strictEnv: true,
      tokenRefreshCount: 2,
      lastTokenRefreshAt: "2026-02-27T00:05:00.000Z",
    });

    expect(payload).toEqual({
      sessionActive: true,
      strictEnv: true,
      tokenRefreshCount: 2,
      lastTokenRefreshAt: "2026-02-27T00:05:00.000Z",
      user: {
        id: "user-1",
        email: "test@example.com",
      },
    });
  });
});
