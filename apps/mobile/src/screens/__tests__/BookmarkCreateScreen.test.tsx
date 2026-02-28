import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { MobileAppController } from "../../hooks/useMobileAppController";
import { useMobileApp } from "../../context/MobileAppContext";
import { BookmarkCreateScreen } from "../DetailScreens";

jest.mock("../../context/MobileAppContext", () => ({
  useMobileApp: jest.fn(),
}));

const mockedUseMobileApp = useMobileApp as jest.MockedFunction<
  typeof useMobileApp
>;

function makeController(
  overrides: Partial<MobileAppController> = {},
): MobileAppController {
  return {
    bookmarkDraft: {
      book: "jo",
      chapter: "3",
      verse: "16",
    },
    setBookmarkDraft: jest.fn(),
    bookmarkBookSuggestions: ["John", "Joshua"],
    bookmarkChapterHint: "Chapters 1-24",
    bookmarkBookGuidance:
      'Multiple books match "jo". Tap one below to avoid saving the wrong reference.',
    selectBookmarkBookSuggestion: jest.fn(),
    bookmarkMutationError: null,
    bookmarkMutationBusy: false,
    busy: false,
    handleCreateBookmark: jest.fn(async () => undefined),
    ...overrides,
  } as unknown as MobileAppController;
}

describe("BookmarkCreateScreen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders guidance and suggestion chips for ambiguous book input", () => {
    mockedUseMobileApp.mockReturnValue(makeController());

    const { getByText } = render(<BookmarkCreateScreen />);

    expect(
      getByText(
        'Multiple books match "jo". Tap one below to avoid saving the wrong reference.',
      ),
    ).toBeTruthy();
    expect(getByText("John")).toBeTruthy();
    expect(getByText("Joshua")).toBeTruthy();
  });

  it("calls suggestion selection handler when a chip is pressed", () => {
    const controller = makeController();
    mockedUseMobileApp.mockReturnValue(controller);

    const { getByText } = render(<BookmarkCreateScreen />);
    fireEvent.press(getByText("John"));

    expect(controller.selectBookmarkBookSuggestion).toHaveBeenCalledWith(
      "John",
    );
  });

  it("applies selected suggestion to the book field and preserves save-path action", () => {
    const handleCreateBookmark = jest.fn(async () => undefined);
    const controller = makeController({
      handleCreateBookmark,
    });

    controller.selectBookmarkBookSuggestion = jest.fn((book: string) => {
      controller.bookmarkDraft = {
        ...controller.bookmarkDraft,
        book,
      };
      controller.bookmarkBookSuggestions = [];
      controller.bookmarkBookGuidance = null;
    });

    mockedUseMobileApp.mockImplementation(() => controller);

    const { getByText, getByDisplayValue, rerender } = render(
      <BookmarkCreateScreen />,
    );

    fireEvent.press(getByText("John"));
    rerender(<BookmarkCreateScreen />);

    expect(getByDisplayValue("John")).toBeTruthy();

    fireEvent.press(getByText("Save bookmark"));
    expect(handleCreateBookmark).toHaveBeenCalledTimes(1);
  });

  it("renders bookmark validation error text when present", () => {
    mockedUseMobileApp.mockReturnValue(
      makeController({
        bookmarkMutationError: "Select a valid Bible book.",
      }),
    );

    const { getByText } = render(<BookmarkCreateScreen />);
    expect(getByText("Select a valid Bible book.")).toBeTruthy();
  });

  it("does not trigger clear action when draft is empty", () => {
    const controller = makeController({
      bookmarkDraft: { book: "", chapter: "", verse: "" },
      bookmarkBookSuggestions: [],
      bookmarkBookGuidance: null,
      bookmarkChapterHint: null,
    });
    mockedUseMobileApp.mockReturnValue(controller);

    const { getByText } = render(<BookmarkCreateScreen />);
    fireEvent.press(getByText("Clear"));

    expect(controller.setBookmarkDraft).not.toHaveBeenCalled();
  });

  it("clears draft when clear is pressed with non-empty values", () => {
    const controller = makeController({
      bookmarkDraft: { book: "John", chapter: "3", verse: "16" },
      bookmarkBookSuggestions: [],
      bookmarkBookGuidance: null,
    });
    mockedUseMobileApp.mockReturnValue(controller);

    const { getByText } = render(<BookmarkCreateScreen />);
    fireEvent.press(getByText("Clear"));

    expect(controller.setBookmarkDraft).toHaveBeenCalledWith({
      book: "",
      chapter: "",
      verse: "",
    });
  });

  it("shows Saving... label while bookmark mutation is busy", () => {
    mockedUseMobileApp.mockReturnValue(
      makeController({
        bookmarkMutationBusy: true,
      }),
    );

    const { getByText } = render(<BookmarkCreateScreen />);
    expect(getByText("Saving...")).toBeTruthy();
  });

  it("blocks save and clear handlers while busy", () => {
    const handleCreateBookmark = jest.fn(async () => undefined);
    const controller = makeController({
      bookmarkMutationBusy: true,
      handleCreateBookmark,
    });
    mockedUseMobileApp.mockReturnValue(controller);

    const { getByText } = render(<BookmarkCreateScreen />);
    fireEvent.press(getByText("Saving..."));
    fireEvent.press(getByText("Clear"));

    expect(handleCreateBookmark).not.toHaveBeenCalled();
    expect(controller.setBookmarkDraft).not.toHaveBeenCalled();
  });
});
