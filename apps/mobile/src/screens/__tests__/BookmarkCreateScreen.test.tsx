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
});
