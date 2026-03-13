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
const AMBIGUOUS_GUIDANCE =
  'Multiple books match "jo". Tap one below to avoid saving the wrong reference.';

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
    bookmarkBookGuidance: AMBIGUOUS_GUIDANCE,
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

    expect(getByText(AMBIGUOUS_GUIDANCE)).toBeTruthy();
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
      bookmarkBookGuidance: AMBIGUOUS_GUIDANCE,
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

    const { getByText, getByDisplayValue, queryByText, rerender } = render(
      <BookmarkCreateScreen />,
    );

    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeTruthy();
    expect(queryByText("Joshua")).toBeTruthy();
    fireEvent.press(getByText("John"));
    rerender(<BookmarkCreateScreen />);

    expect(getByDisplayValue("John")).toBeTruthy();
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeNull();
    expect(queryByText("Joshua")).toBeNull();

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

  it("shows chapter hint for recognized book context", () => {
    mockedUseMobileApp.mockReturnValue(
      makeController({
        bookmarkChapterHint: "Chapters 1-21",
      }),
    );

    const { getByText } = render(<BookmarkCreateScreen />);
    expect(getByText("Chapters 1-21")).toBeTruthy();
  });

  it("hides chapter hint when book is not recognized", () => {
    mockedUseMobileApp.mockReturnValue(
      makeController({
        bookmarkChapterHint: null,
      }),
    );

    const { queryByText } = render(<BookmarkCreateScreen />);
    expect(queryByText("Chapters 1-24")).toBeNull();
  });

  it("hides guidance callout when book input is already canonical", () => {
    mockedUseMobileApp.mockReturnValue(
      makeController({
        bookmarkDraft: { book: "John", chapter: "3", verse: "16" },
        bookmarkBookSuggestions: [],
        bookmarkBookGuidance: null,
      }),
    );

    const { queryByText } = render(<BookmarkCreateScreen />);
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeNull();
  });

  it("hides suggestion chips when book input is already canonical", () => {
    mockedUseMobileApp.mockReturnValue(
      makeController({
        bookmarkDraft: { book: "John", chapter: "3", verse: "16" },
        bookmarkBookSuggestions: [],
        bookmarkBookGuidance: null,
      }),
    );

    const { queryByText } = render(<BookmarkCreateScreen />);
    expect(queryByText("Joshua")).toBeNull();
  });

  it("keeps ambiguity UI hidden across rerenders for canonical prefill state", () => {
    const controller = makeController({
      bookmarkDraft: { book: "John", chapter: "3", verse: "16" },
      bookmarkBookSuggestions: [],
      bookmarkBookGuidance: null,
      bookmarkChapterHint: "Chapters 1-21",
    });
    mockedUseMobileApp.mockImplementation(() => controller);

    const { getByDisplayValue, queryByText, rerender } = render(
      <BookmarkCreateScreen />,
    );
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeNull();
    expect(queryByText("Joshua")).toBeNull();

    controller.bookmarkDraft = {
      ...controller.bookmarkDraft,
      verse: "17",
    };
    rerender(<BookmarkCreateScreen />);

    expect(getByDisplayValue("17")).toBeTruthy();
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeNull();
    expect(queryByText("Joshua")).toBeNull();
  });

  it("shows ambiguity UI again when canonical input regresses to ambiguous prefix", () => {
    const controller = makeController({
      bookmarkDraft: { book: "John", chapter: "3", verse: "16" },
      bookmarkBookSuggestions: [],
      bookmarkBookGuidance: null,
      bookmarkChapterHint: "Chapters 1-21",
    });
    mockedUseMobileApp.mockImplementation(() => controller);

    const { getByDisplayValue, queryByText, rerender } = render(
      <BookmarkCreateScreen />,
    );
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeNull();
    expect(queryByText("Joshua")).toBeNull();

    controller.bookmarkDraft = {
      ...controller.bookmarkDraft,
      book: "jo",
    };
    controller.bookmarkBookSuggestions = ["John", "Joshua"];
    controller.bookmarkBookGuidance = AMBIGUOUS_GUIDANCE;
    controller.bookmarkChapterHint = "Chapters 1-24";
    rerender(<BookmarkCreateScreen />);

    expect(getByDisplayValue("jo")).toBeTruthy();
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeTruthy();
    expect(queryByText("Joshua")).toBeTruthy();
  });

  it("updates chapter hint when canonical input regresses to ambiguous prefix", () => {
    const controller = makeController({
      bookmarkDraft: { book: "John", chapter: "3", verse: "16" },
      bookmarkBookSuggestions: [],
      bookmarkBookGuidance: null,
      bookmarkChapterHint: "Chapters 1-21",
    });
    mockedUseMobileApp.mockImplementation(() => controller);

    const { queryByText, rerender } = render(<BookmarkCreateScreen />);
    expect(queryByText("Chapters 1-21")).toBeTruthy();
    expect(queryByText("Chapters 1-24")).toBeNull();

    controller.bookmarkDraft = {
      ...controller.bookmarkDraft,
      book: "jo",
    };
    controller.bookmarkBookSuggestions = ["John", "Joshua"];
    controller.bookmarkBookGuidance = AMBIGUOUS_GUIDANCE;
    controller.bookmarkChapterHint = "Chapters 1-24";
    rerender(<BookmarkCreateScreen />);

    expect(queryByText("Chapters 1-21")).toBeNull();
    expect(queryByText("Chapters 1-24")).toBeTruthy();
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeTruthy();
    expect(queryByText("Joshua")).toBeTruthy();
  });

  it("maintains stable ambiguity UI across ambiguous-canonical-ambiguous roundtrip", () => {
    const controller = makeController({
      bookmarkDraft: { book: "jo", chapter: "3", verse: "16" },
      bookmarkBookSuggestions: ["John", "Joshua"],
      bookmarkBookGuidance: AMBIGUOUS_GUIDANCE,
      bookmarkChapterHint: "Chapters 1-24",
    });
    mockedUseMobileApp.mockImplementation(() => controller);

    const { getByDisplayValue, queryByText, rerender } = render(
      <BookmarkCreateScreen />,
    );
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeTruthy();
    expect(queryByText("Joshua")).toBeTruthy();

    controller.bookmarkDraft = {
      ...controller.bookmarkDraft,
      book: "John",
    };
    controller.bookmarkBookSuggestions = [];
    controller.bookmarkBookGuidance = null;
    controller.bookmarkChapterHint = "Chapters 1-21";
    rerender(<BookmarkCreateScreen />);

    expect(getByDisplayValue("John")).toBeTruthy();
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeNull();
    expect(queryByText("Joshua")).toBeNull();
    expect(queryByText("Chapters 1-21")).toBeTruthy();

    controller.bookmarkDraft = {
      ...controller.bookmarkDraft,
      book: "jo",
    };
    controller.bookmarkBookSuggestions = ["John", "Joshua"];
    controller.bookmarkBookGuidance = AMBIGUOUS_GUIDANCE;
    controller.bookmarkChapterHint = "Chapters 1-24";
    rerender(<BookmarkCreateScreen />);

    expect(getByDisplayValue("jo")).toBeTruthy();
    expect(queryByText(AMBIGUOUS_GUIDANCE)).toBeTruthy();
    expect(queryByText("Joshua")).toBeTruthy();
    expect(queryByText("Chapters 1-24")).toBeTruthy();
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
