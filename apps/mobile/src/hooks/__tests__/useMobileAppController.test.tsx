import React, { useEffect } from "react";
import { Linking, Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import type { MobileHighlightItem, ProtectedProbeResult } from "../../lib/api";
import {
  createBookmark,
  createHighlightViaSync,
  deleteBookmark,
  deleteHighlight,
  fetchBookmarks,
  fetchHighlights,
  fetchLibraryConnections,
  fetchProtectedProbe,
  updateHighlight,
} from "../../lib/api";
import {
  useMobileAppController,
  type MobileAppController,
} from "../useMobileAppController";

const mockSupabaseSession = {
  access_token: "test-access-token",
  user: { id: "user-1", email: "user@example.com" },
} as const;

jest.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: mockSupabaseSession },
      })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      signInWithPassword: jest.fn(async () => ({ error: null })),
      signInWithOtp: jest.fn(async () => ({ error: null })),
      signInWithOAuth: jest.fn(async () => ({
        data: { url: "https://example.com" },
        error: null,
      })),
      signOut: jest.fn(async () => ({ error: null })),
    },
  },
}));

jest.mock("../../lib/api", () => ({
  fetchProtectedProbe: jest.fn(),
  fetchLibraryConnections: jest.fn(),
  fetchBookmarks: jest.fn(),
  fetchHighlights: jest.fn(),
  createBookmark: jest.fn(),
  deleteBookmark: jest.fn(),
  createHighlightViaSync: jest.fn(),
  updateHighlight: jest.fn(),
  deleteHighlight: jest.fn(),
}));

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: "cancel" })),
}));

function HookHarness({
  onUpdate,
}: {
  onUpdate: (controller: MobileAppController) => void;
}) {
  const controller = useMobileAppController();
  useEffect(() => {
    onUpdate(controller);
  }, [controller, onUpdate]);

  return <Text>{controller.user ? "auth-ready" : "auth-pending"}</Text>;
}

describe("useMobileAppController", () => {
  let latest: MobileAppController | null = null;
  let linkingListenerSpy: jest.SpyInstance;
  let linkingInitialUrlSpy: jest.SpyInstance;

  beforeEach(() => {
    latest = null;
    linkingListenerSpy = jest
      .spyOn(Linking, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
        typeof Linking.addEventListener
      >);
    linkingInitialUrlSpy = jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(null);

    (fetchProtectedProbe as jest.Mock).mockResolvedValue({
      bookmarksCount: 0,
      highlightsCount: 1,
      libraryConnectionsCount: 0,
    } as ProtectedProbeResult);
    (fetchLibraryConnections as jest.Mock).mockResolvedValue([]);
    (fetchBookmarks as jest.Mock).mockResolvedValue([]);
    (fetchHighlights as jest.Mock).mockResolvedValue([
      {
        id: "hl-1",
        book: "Genesis",
        chapter: 1,
        verses: [1],
        text: "In the beginning",
        color: "#facc15",
        referenceLabel: "Genesis 1:1",
        note: "seed",
      } as MobileHighlightItem,
    ]);
  });

  afterEach(() => {
    linkingListenerSpy.mockRestore();
    linkingInitialUrlSpy.mockRestore();
    jest.clearAllMocks();
  });

  it("creates bookmark via controller action", async () => {
    (createBookmark as jest.Mock).mockResolvedValue({
      id: "bm-1",
      text: "Genesis 1:1",
      createdAt: "2026-02-27T00:00:00.000Z",
    });

    render(<HookHarness onUpdate={(controller) => (latest = controller)} />);

    await waitFor(() => {
      expect(latest?.user?.id).toBe("user-1");
    });

    await act(async () => {
      latest?.setBookmarkDraft((current) => ({
        ...current,
        book: "Genesis",
        chapter: "1",
        verse: "1",
      }));
    });

    await act(async () => {
      await latest?.handleCreateBookmark();
    });

    await waitFor(() => {
      expect(createBookmark).toHaveBeenCalledTimes(1);
    });
    expect(createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Genesis 1:1" }),
    );
    expect(latest?.bookmarks[0]?.id).toBe("bm-1");
  });

  it("blocks bookmark creation when chapter exceeds book bounds", async () => {
    render(<HookHarness onUpdate={(controller) => (latest = controller)} />);

    await waitFor(() => {
      expect(latest?.user?.id).toBe("user-1");
    });

    await act(async () => {
      latest?.setBookmarkDraft((current) => ({
        ...current,
        book: "Jude",
        chapter: "2",
        verse: "",
      }));
    });

    await act(async () => {
      await latest?.handleCreateBookmark();
    });

    expect(createBookmark).not.toHaveBeenCalled();
    expect(latest?.bookmarkMutationError).toContain("Jude has 1 chapters");
  });

  it("deletes bookmark via controller action", async () => {
    (fetchBookmarks as jest.Mock).mockResolvedValue([
      {
        id: "bm-1",
        text: "Genesis 1:1",
        createdAt: "2026-02-27T00:00:00.000Z",
      },
    ]);

    render(<HookHarness onUpdate={(controller) => (latest = controller)} />);

    await waitFor(() => {
      expect(latest?.bookmarks.length).toBe(1);
    });

    await act(async () => {
      await latest?.handleDeleteBookmark("bm-1");
    });

    await waitFor(() => {
      expect(deleteBookmark).toHaveBeenCalledTimes(1);
    });
    expect(latest?.bookmarks).toEqual([]);
  });

  it("creates highlight via controller action", async () => {
    const createdHighlight: MobileHighlightItem = {
      id: "hl-2",
      book: "Genesis",
      chapter: 1,
      verses: [1],
      text: "Created highlight",
      color: "#facc15",
      referenceLabel: "Genesis 1:1",
      note: "created",
    };

    (createHighlightViaSync as jest.Mock).mockResolvedValue([
      {
        id: "hl-1",
        book: "Genesis",
        chapter: 1,
        verses: [1],
        text: "In the beginning",
        color: "#facc15",
        referenceLabel: "Genesis 1:1",
        note: "seed",
      },
      createdHighlight,
    ]);

    render(<HookHarness onUpdate={(controller) => (latest = controller)} />);

    await waitFor(() => {
      expect(latest?.highlights.length).toBeGreaterThan(0);
    });

    await act(async () => {
      latest?.setHighlightCreateDraft((current) => ({
        ...current,
        book: "Genesis",
        chapter: "1",
        verses: "1",
        text: "Created highlight",
        color: "#facc15",
        note: "created",
      }));
    });

    await act(async () => {
      await latest?.handleCreateHighlight();
    });

    await waitFor(() => {
      expect(createHighlightViaSync).toHaveBeenCalledTimes(1);
    });
    expect(latest?.highlights.some((item) => item.id === "hl-2")).toBe(true);
  });

  it("updates selected highlight via controller action", async () => {
    (updateHighlight as jest.Mock).mockResolvedValue({
      id: "hl-1",
      book: "Genesis",
      chapter: 1,
      verses: [1],
      text: "In the beginning",
      color: "#00ffcc",
      referenceLabel: "Genesis 1:1",
      note: "updated note",
      updatedAt: "2026-02-27T00:05:00.000Z",
    } as MobileHighlightItem);

    render(<HookHarness onUpdate={(controller) => (latest = controller)} />);

    await waitFor(() => {
      expect(latest?.highlights.length).toBeGreaterThan(0);
    });

    await act(async () => {
      latest?.setSelectedHighlightId("hl-1");
      latest?.setHighlightEditColor("#00ffcc");
      latest?.setHighlightEditNote("updated note");
    });

    await act(async () => {
      await latest?.handleSaveHighlightEdits();
    });

    await waitFor(() => {
      expect(updateHighlight).toHaveBeenCalledTimes(1);
    });
    expect(latest?.highlights[0]?.note).toBe("updated note");
  });

  it("deletes selected highlight via controller action", async () => {
    render(<HookHarness onUpdate={(controller) => (latest = controller)} />);

    await waitFor(() => {
      expect(latest?.highlights.length).toBeGreaterThan(0);
    });

    await act(async () => {
      latest?.setSelectedHighlightId("hl-1");
    });

    await act(async () => {
      await latest?.handleDeleteHighlight("hl-1");
    });

    await waitFor(() => {
      expect(deleteHighlight).toHaveBeenCalledTimes(1);
    });
    expect(latest?.highlights).toEqual([]);
  });
});
