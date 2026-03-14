import React from "react";
import { Alert } from "react-native";
import { afterAll } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { BookmarkDetailScreen, HighlightDetailScreen } from "../DetailScreens";
import { useMobileApp } from "../../context/MobileAppContext";

jest.mock("../../context/MobileAppContext", () => ({
  useMobileApp: jest.fn(),
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

describe("Detail screen delete flows", () => {
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(jest.fn());

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigation.canGoBack.mockReturnValue(true);
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it("returns to the previous screen after a successful bookmark delete", async () => {
    const handleDeleteBookmark = jest.fn(async () => true);
    (useMobileApp as jest.Mock).mockReturnValue({
      bookmarks: [
        {
          id: "bm-1",
          text: "Genesis 1:1",
          createdAt: "2026-03-14T00:00:00.000Z",
        },
      ],
      bookmarkMutationBusy: false,
      bookmarkMutationError: null,
      busy: false,
      handleDeleteBookmark,
      queueReaderFocusTarget: jest.fn(),
      navigateReaderTo: jest.fn(),
      highlights: [],
      highlightMutationBusy: false,
      highlightMutationError: null,
      highlightEditColor: "#facc15",
      highlightEditNote: "",
      setHighlightEditColor: jest.fn(),
      setHighlightEditNote: jest.fn(),
      handleSaveHighlightEdits: jest.fn(),
      handleDeleteHighlight: jest.fn(),
    });

    const { getByText } = render(<BookmarkDetailScreen bookmarkId="bm-1" />);

    fireEvent.press(getByText("Delete"));

    const buttons = (alertSpy.mock.calls[0]?.[2] ?? []) as Array<{
      onPress?: () => void | Promise<void>;
    }>;

    await buttons[1]?.onPress?.();

    expect(handleDeleteBookmark).toHaveBeenCalledWith("bm-1");
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("keeps the bookmark detail route open when delete fails", async () => {
    const handleDeleteBookmark = jest.fn(async () => false);
    (useMobileApp as jest.Mock).mockReturnValue({
      bookmarks: [
        {
          id: "bm-1",
          text: "Genesis 1:1",
          createdAt: "2026-03-14T00:00:00.000Z",
        },
      ],
      bookmarkMutationBusy: false,
      bookmarkMutationError: null,
      busy: false,
      handleDeleteBookmark,
      queueReaderFocusTarget: jest.fn(),
      navigateReaderTo: jest.fn(),
      highlights: [],
      highlightMutationBusy: false,
      highlightMutationError: null,
      highlightEditColor: "#facc15",
      highlightEditNote: "",
      setHighlightEditColor: jest.fn(),
      setHighlightEditNote: jest.fn(),
      handleSaveHighlightEdits: jest.fn(),
      handleDeleteHighlight: jest.fn(),
    });

    const { getByText } = render(<BookmarkDetailScreen bookmarkId="bm-1" />);

    fireEvent.press(getByText("Delete"));

    const buttons = (alertSpy.mock.calls[0]?.[2] ?? []) as Array<{
      onPress?: () => void | Promise<void>;
    }>;

    await buttons[1]?.onPress?.();

    expect(handleDeleteBookmark).toHaveBeenCalledWith("bm-1");
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it("returns to the previous screen after a successful highlight delete", async () => {
    const handleDeleteHighlight = jest.fn(async () => true);
    (useMobileApp as jest.Mock).mockReturnValue({
      bookmarks: [],
      bookmarkMutationBusy: false,
      bookmarkMutationError: null,
      busy: false,
      handleDeleteBookmark: jest.fn(),
      queueReaderFocusTarget: jest.fn(),
      navigateReaderTo: jest.fn(),
      highlights: [
        {
          id: "hl-1",
          book: "John",
          chapter: 3,
          verses: [16],
          text: "For God so loved the world",
          color: "#facc15",
          referenceLabel: "John 3:16",
        },
      ],
      highlightMutationBusy: false,
      highlightMutationError: null,
      highlightEditColor: "#facc15",
      highlightEditNote: "",
      setHighlightEditColor: jest.fn(),
      setHighlightEditNote: jest.fn(),
      handleSaveHighlightEdits: jest.fn(),
      handleDeleteHighlight,
    });

    const { getByText } = render(<HighlightDetailScreen highlightId="hl-1" />);

    fireEvent.press(getByText("Delete"));

    const buttons = (alertSpy.mock.calls[0]?.[2] ?? []) as Array<{
      onPress?: () => void | Promise<void>;
    }>;

    await buttons[1]?.onPress?.();

    expect(handleDeleteHighlight).toHaveBeenCalledWith("hl-1");
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
