import React, { useEffect } from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import {
  useRootTranslationMobile,
  type RootTranslationMobileState,
} from "../useRootTranslationMobile";
import { fetchRootTranslation } from "../../lib/api";

jest.mock("../../lib/api", () => ({
  fetchRootTranslation: jest.fn(),
}));

jest.mock("../../utils/ensureMinLoaderDuration", () => ({
  ensureMinLoaderDuration: jest.fn(async () => undefined),
}));

function HookHarness({
  onUpdate,
}: {
  onUpdate: (state: RootTranslationMobileState) => void;
}) {
  const state = useRootTranslationMobile({
    apiBaseUrl: "https://example.com",
    accessToken: "token-1",
  });

  useEffect(() => {
    onUpdate(state);
  }, [onUpdate, state]);

  return <Text>{state.isLoading ? "loading" : "idle"}</Text>;
}

describe("useRootTranslationMobile", () => {
  let latest: RootTranslationMobileState | null = null;

  beforeEach(() => {
    latest = null;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("retries once after a transient root translation failure", async () => {
    (fetchRootTranslation as jest.Mock)
      .mockRejectedValueOnce(new Error("Root translation request failed (500)"))
      .mockResolvedValueOnce({
        language: "Hebrew",
        words: [
          {
            english: "beginning",
            strongs: "H7225",
            definition: "first, chief",
            original: "bereshit",
          },
        ],
        lostContext: "The Hebrew emphasizes the start of ordered creation.",
      });

    render(<HookHarness onUpdate={(state) => (latest = state)} />);

    await waitFor(() => {
      expect(latest).not.toBeNull();
    });

    let generatePromise: Promise<void> | undefined;

    await act(async () => {
      generatePromise = latest?.generate(" In the beginning ", {
        book: "Genesis",
        chapter: 1,
        verse: 1,
      });
      await jest.advanceTimersByTimeAsync(300);
      await generatePromise;
    });

    expect(fetchRootTranslation).toHaveBeenCalledTimes(2);
    expect(fetchRootTranslation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        selectedText: "In the beginning",
        book: "Genesis",
        chapter: 1,
        verse: 1,
      }),
    );
    expect(latest?.words).toHaveLength(1);
    expect(latest?.fallbackText).toContain("ordered creation");
    expect(latest?.isLoading).toBe(false);
  });

  it("surfaces root translation failures after the retry is exhausted", async () => {
    (fetchRootTranslation as jest.Mock)
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockRejectedValueOnce(new Error("fetch failed"));

    render(<HookHarness onUpdate={(state) => (latest = state)} />);

    await waitFor(() => {
      expect(latest).not.toBeNull();
    });

    let generatePromise: Promise<void> | undefined;

    await act(async () => {
      generatePromise = latest?.generate("Grace and peace", {
        book: "Romans",
        chapter: 1,
        verse: 7,
      });
      await jest.advanceTimersByTimeAsync(300);
      await generatePromise;
    });

    expect(fetchRootTranslation).toHaveBeenCalledTimes(2);
    expect(latest?.fallbackText).toBe(
      "Root translation unavailable: fetch failed",
    );
    expect(latest?.words).toHaveLength(0);
    expect(latest?.isLoading).toBe(false);
  });
});
