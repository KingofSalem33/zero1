import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  getBibleBookSuggestions,
  getBibleChapterCount,
  resolveBibleBookName,
} from "@zero1/shared";
import { ActionButton } from "../components/native/ActionButton";
import { PressableScale } from "../components/native/PressableScale";
import { useMobileApp } from "../context/MobileAppContext";
import {
  fetchRootTranslation,
  fetchSynopsis,
  fetchTraceBundle,
  type RootTranslationResponse,
  type SynopsisResponse,
} from "../lib/api";
import { MOBILE_ENV } from "../lib/env";
import { styles, T } from "../theme/mobileStyles";
import { isVisualContextBundle } from "../types/visualization";

const DOUBLE_TAP_WINDOW_MS = 280;
const HIGHLIGHT_FEEDBACK_IN_MS = 120;
const HIGHLIGHT_FEEDBACK_OUT_MS = 220;
const HIGHLIGHT_FEEDBACK_SCALE_MAX = 1.0035;

type SelectionDraft = {
  startVerse: number;
  endVerse: number;
};

type SelectionPayload = {
  verses: number[];
  text: string;
};

type HighlightTone = {
  fill: string;
  stroke: string;
  bar: string;
};

function parseHexColor(input: string): { r: number; g: number; b: number } | null {
  const value = input.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{3,8}$/.test(value)) return null;
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : value.slice(0, 6);
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return null;
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgba(color: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function buildHighlightTone(color: string): HighlightTone | null {
  const parsed = parseHexColor(color);
  if (!parsed) return null;
  return {
    fill: rgba(parsed, 0.24),
    stroke: rgba(parsed, 0.78),
    bar: rgba(parsed, 1),
  };
}

function normalizeVerseRange(startVerse: number, endVerse: number): number[] {
  const min = Math.min(startVerse, endVerse);
  const max = Math.max(startVerse, endVerse);
  const verses: number[] = [];
  for (let verse = min; verse <= max; verse += 1) {
    verses.push(verse);
  }
  return verses;
}

function formatVerseRangeLabel(verses: number[]): string {
  if (verses.length === 0) return "";
  if (verses.length === 1) return String(verses[0]);
  return `${verses[0]}-${verses[verses.length - 1]}`;
}

export function ReaderScreen({
  nav,
}: {
  nav: {
    openChat: (prompt: string, autoSend?: boolean) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
  };
}) {
  const controller = useMobileApp();
  const [bookInput, setBookInput] = useState(controller.reader.book);
  const [chapterInput, setChapterInput] = useState(
    String(controller.reader.chapter),
  );
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(
    null,
  );
  const [selectionModalVisible, setSelectionModalVisible] = useState(false);
  const [selectionSynopsis, setSelectionSynopsis] =
    useState<SynopsisResponse | null>(null);
  const [selectionSynopsisLoading, setSelectionSynopsisLoading] =
    useState(false);
  const [selectionSynopsisError, setSelectionSynopsisError] = useState<
    string | null
  >(null);
  const [selectionRoot, setSelectionRoot] =
    useState<RootTranslationResponse | null>(null);
  const [selectionRootLoading, setSelectionRootLoading] = useState(false);
  const [selectionRootError, setSelectionRootError] = useState<string | null>(
    null,
  );
  const [selectionView, setSelectionView] = useState<"synopsis" | "root">(
    "synopsis",
  );
  const [activeModalChip, setActiveModalChip] = useState<"synopsis" | "root">(
    "synopsis",
  );
  const [selectionMapLoading, setSelectionMapLoading] = useState(false);
  const [selectionCopySuccess, setSelectionCopySuccess] = useState(false);
  const [selectionShareSuccess, setSelectionShareSuccess] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const lastVerseTapRef = useRef<{ verse: number; at: number } | null>(null);
  const suppressNextVersePressRef = useRef(false);
  const [feedbackVerse, setFeedbackVerse] = useState<number | null>(null);
  const feedbackPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setBookInput(controller.reader.book);
    setChapterInput(String(controller.reader.chapter));
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionRoot(null);
    setSelectionSynopsisError(null);
    setSelectionRootError(null);
  }, [controller.reader.book, controller.reader.chapter]);

  const bookSuggestions = useMemo(() => {
    const query = bookInput.trim();
    if (!query) return [];
    const suggestions = getBibleBookSuggestions(query, 6);
    if (
      suggestions.length === 1 &&
      suggestions[0].toLowerCase() === query.toLowerCase()
    ) {
      return [];
    }
    return suggestions;
  }, [bookInput]);

  const chapterHint = useMemo(() => {
    const canonical = resolveBibleBookName(bookInput);
    const maxChapter = canonical ? getBibleChapterCount(canonical) : null;
    return maxChapter ? `1-${maxChapter}` : null;
  }, [bookInput]);

  const selectedVerses = useMemo(() => {
    if (!selectionDraft) return [];
    return normalizeVerseRange(
      selectionDraft.startVerse,
      selectionDraft.endVerse,
    );
  }, [selectionDraft]);

  const selectedVerseLabel = useMemo(() => {
    if (selectedVerses.length === 0) return null;
    return `${controller.reader.book} ${controller.reader.chapter}:${formatVerseRangeLabel(selectedVerses)}`;
  }, [controller.reader.book, controller.reader.chapter, selectedVerses]);

  const selectedText = useMemo(() => {
    if (selectedVerses.length === 0) return "";
    const textByVerse = new Map(
      controller.reader.verses.map((entry) => [entry.verse, entry.text]),
    );
    return selectedVerses
      .map((verse) => `${verse}. ${textByVerse.get(verse) ?? ""}`.trim())
      .join(" ")
      .trim();
  }, [controller.reader.verses, selectedVerses]);

  const verseHighlightMap = useMemo(() => {
    const map = new Map<number, { color: string; tone: HighlightTone | null }>();
    controller.highlights.forEach((highlight) => {
      if (
        highlight.book.toLowerCase() === controller.reader.book.toLowerCase() &&
        highlight.chapter === controller.reader.chapter
      ) {
        highlight.verses.forEach((verse) => {
          if (!map.has(verse)) {
            const color = highlight.color || "#facc15";
            map.set(verse, {
              color,
              tone: buildHighlightTone(color),
            });
          }
        });
      }
    });
    return map;
  }, [
    controller.highlights,
    controller.reader.book,
    controller.reader.chapter,
  ]);

  function triggerSelectionHaptic() {
    Haptics.selectionAsync().catch(() => {});
  }

  function runHighlightFeedbackPulse(verse: number) {
    setFeedbackVerse(verse);
    feedbackPulse.setValue(0);
    Animated.sequence([
      Animated.timing(feedbackPulse, {
        toValue: 1,
        duration: HIGHLIGHT_FEEDBACK_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(feedbackPulse, {
        toValue: 0,
        duration: HIGHLIGHT_FEEDBACK_OUT_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFeedbackVerse((current) => (current === verse ? null : current));
    });
  }

  function buildSelectionPayload(draft: SelectionDraft): SelectionPayload {
    const verses = normalizeVerseRange(draft.startVerse, draft.endVerse);
    const textByVerse = new Map(
      controller.reader.verses.map((entry) => [entry.verse, entry.text]),
    );
    const text = verses
      .map((verse) => `${verse}. ${textByVerse.get(verse) ?? ""}`.trim())
      .join(" ")
      .trim();
    return { verses, text };
  }

  async function handleGoToChapter() {
    const canonical = resolveBibleBookName(bookInput);
    const parsedChapter = Number(chapterInput.trim());
    if (!canonical || !Number.isInteger(parsedChapter)) return;
    await controller.navigateReaderTo(canonical, parsedChapter);
  }

  function clearSelection() {
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionRoot(null);
    setSelectionSynopsisError(null);
    setSelectionRootError(null);
    setSelectionView("synopsis");
    setActiveModalChip("synopsis");
    setSelectionCopySuccess(false);
    setSelectionShareSuccess(false);
    lastVerseTapRef.current = null;
  }

  async function loadSelectionSynopsis(payload?: SelectionPayload) {
    const activePayload =
      payload ?? { text: selectedText, verses: selectedVerses };
    if (!activePayload.text || activePayload.verses.length === 0) return;
    setSelectionSynopsisLoading(true);
    setSelectionSynopsisError(null);
    try {
      const result = await fetchSynopsis({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: activePayload.text,
        maxWords: 34,
        book: controller.reader.book,
        chapter: controller.reader.chapter,
        verses: activePayload.verses,
      });
      setSelectionSynopsis(result);
    } catch (error) {
      setSelectionSynopsisError(
        error instanceof Error ? error.message : String(error),
      );
      setSelectionSynopsis(null);
    } finally {
      setSelectionSynopsisLoading(false);
    }
  }

  async function loadSelectionRootTranslation(payload?: SelectionPayload) {
    const activePayload =
      payload ?? { text: selectedText, verses: selectedVerses };
    if (!activePayload.text || activePayload.verses.length === 0) return;
    setSelectionRootLoading(true);
    setSelectionRootError(null);
    try {
      const result = await fetchRootTranslation({
        apiBaseUrl: MOBILE_ENV.API_URL,
        selectedText: activePayload.text,
        maxWords: 140,
        book: controller.reader.book,
        chapter: controller.reader.chapter,
        verses: activePayload.verses,
      });
      setSelectionRoot(result);
    } catch (error) {
      setSelectionRootError(
        error instanceof Error ? error.message : String(error),
      );
      setSelectionRoot(null);
    } finally {
      setSelectionRootLoading(false);
    }
  }

  async function openSelectionTools(draft?: SelectionDraft) {
    const payload = draft
      ? buildSelectionPayload(draft)
      : { text: selectedText, verses: selectedVerses };
    if (!payload.text || payload.verses.length === 0) return;
    setSelectionModalVisible(true);
    setSelectionView("synopsis");
    setActiveModalChip("synopsis");
    setSelectionCopySuccess(false);
    setSelectionShareSuccess(false);
    await loadSelectionSynopsis(payload);
  }

  async function handleTraceSelection() {
    if (!selectedText || !selectedVerseLabel) return;
    setSelectionMapLoading(true);
    try {
      const bundle = await fetchTraceBundle({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: `${selectedVerseLabel} ${selectedText}`,
        accessToken: controller.session?.access_token,
      });
      if (!isVisualContextBundle(bundle)) {
        throw new Error("Map response was malformed.");
      }
      nav.openMapViewer(selectedVerseLabel, bundle);
      clearSelection();
    } catch (error) {
      setSelectionSynopsisError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSelectionMapLoading(false);
    }
  }

  async function handleCopySelection() {
    if (!selectedText || !selectedVerseLabel) return;
    await Clipboard.setStringAsync(
      `"${selectedText}"\n\n- ${selectedVerseLabel} (KJV)`,
    );
    setSelectionCopySuccess(true);
    setSelectionShareSuccess(false);
    setTimeout(() => setSelectionCopySuccess(false), 1600);
  }

  async function handleShareSelection() {
    if (!selectedText || !selectedVerseLabel) return;
    await Share.share({
      message: `"${selectedText}"\n\n- ${selectedVerseLabel} (KJV)`,
    });
    setSelectionShareSuccess(true);
    setSelectionCopySuccess(false);
    setTimeout(() => setSelectionShareSuccess(false), 1600);
  }

  const modalFeedbackLabel = selectionMapLoading
    ? "Tracing..."
    : selectionCopySuccess
      ? "Copied"
      : selectionShareSuccess
        ? "Shared"
        : null;

  function handleVerseTextPress(verse: number, text: string) {
    if (suppressNextVersePressRef.current) {
      suppressNextVersePressRef.current = false;
      return;
    }

    if (selectionDraft) {
      setSelectionDraft((current) =>
        current
          ? { ...current, endVerse: verse }
          : { startVerse: verse, endVerse: verse },
      );
      return;
    }

    const now = Date.now();
    const lastTap = lastVerseTapRef.current;
    if (
      lastTap &&
      lastTap.verse === verse &&
      now - lastTap.at <= DOUBLE_TAP_WINDOW_MS
    ) {
      lastVerseTapRef.current = null;
      triggerSelectionHaptic();
      runHighlightFeedbackPulse(verse);
      if (verseHighlightMap.has(verse)) {
        void controller.handleReaderRemoveHighlightSelection([verse]);
      } else {
        void controller.handleReaderHighlightSelection(
          [verse],
          text.trim(),
          controller.readerHighlightColor,
        );
      }
      return;
    }

    lastVerseTapRef.current = { verse, at: now };
  }

  return (
    <View style={localStyles.root}>
      <View style={localStyles.headerShell}>
        {headerCollapsed ? (
          <View style={localStyles.headerCollapsedBar}>
            <Text style={localStyles.headerCollapsedLabel} numberOfLines={1}>
              {controller.reader.book} {controller.reader.chapter}
            </Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Show reader controls"
              onPress={() => setHeaderCollapsed(false)}
              style={localStyles.headerToggleButton}
            >
              <Ionicons color={T.colors.textMuted} name="chevron-down" size={16} />
            </PressableScale>
          </View>
        ) : (
          <View style={localStyles.headerBar}>
            <View style={localStyles.headerControlsTopRow}>
              <Text style={styles.caption}>
                {controller.reader.book} {controller.reader.chapter}
                {chapterHint ? ` - Chapters ${chapterHint}` : ""}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Hide reader controls"
                onPress={() => setHeaderCollapsed(true)}
                style={localStyles.headerToggleButton}
              >
                <Ionicons color={T.colors.textMuted} name="chevron-up" size={16} />
              </PressableScale>
            </View>

            <View style={localStyles.headerControlsRow}>
              <TextInput
                autoCapitalize="words"
                placeholder="Book"
                accessibilityLabel="Reader book"
                placeholderTextColor={T.colors.textMuted}
                style={localStyles.bookInput}
                value={bookInput}
                onChangeText={setBookInput}
              />
              <TextInput
                keyboardType="number-pad"
                placeholder="Ch"
                accessibilityLabel="Reader chapter"
                placeholderTextColor={T.colors.textMuted}
                style={localStyles.chapterInput}
                value={chapterInput}
                onChangeText={setChapterInput}
              />
              <ActionButton
                disabled={controller.readerLoading}
                label="Go"
                onPress={() => void handleGoToChapter()}
                variant="primary"
                style={localStyles.compactPrimaryButton}
                labelStyle={localStyles.compactPrimaryButtonLabel}
              />
              <ActionButton
                disabled={controller.readerLoading}
                label="Prev"
                onPress={() => void controller.goToPreviousReaderChapter()}
                variant="ghost"
                style={localStyles.compactHeaderAction}
                labelStyle={localStyles.compactHeaderActionLabel}
              />
              <ActionButton
                disabled={controller.readerLoading}
                label="Next"
                onPress={() => void controller.goToNextReaderChapter()}
                variant="ghost"
                style={localStyles.compactHeaderAction}
                labelStyle={localStyles.compactHeaderActionLabel}
              />
            </View>

            {bookSuggestions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={localStyles.headerSuggestionRow}
              >
                {bookSuggestions.map((book) => (
                  <PressableScale
                    key={book}
                    onPress={() => setBookInput(book)}
                    style={localStyles.headerSuggestionChip}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${book}`}
                  >
                    <Text style={styles.suggestionChipLabel}>{book}</Text>
                  </PressableScale>
                ))}
              </ScrollView>
            ) : null}

            {selectionDraft ? (
              <View style={localStyles.selectionStatusRow}>
                <Text style={styles.caption} numberOfLines={1}>
                  Selection: {selectedVerseLabel}
                </Text>
                <ActionButton
                  label="Clear"
                  variant="ghost"
                  onPress={clearSelection}
                  style={localStyles.compactHeaderAction}
                  labelStyle={localStyles.compactHeaderActionLabel}
                />
              </View>
            ) : null}

            {controller.readerError ? (
              <Text style={styles.error}>{controller.readerError}</Text>
            ) : null}
          </View>
        )}
      </View>

      <ScrollView
        style={localStyles.readerScroll}
        contentContainerStyle={localStyles.readerContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={localStyles.readingSurface}>
          {controller.readerLoading && controller.reader.verses.length === 0 ? (
            <View style={localStyles.loadingState}>
              <ActivityIndicator color={T.colors.accent} />
              <Text style={styles.caption}>Loading chapter...</Text>
            </View>
          ) : null}

          {controller.reader.verses.map((item) => {
            const inSelection = selectedVerses.includes(item.verse);
            const highlightVisual = verseHighlightMap.get(item.verse);
            const selectedVerse = controller.readerSelectedVerse === item.verse;
            const startsParagraph = item.verse > 1 && item.verse % 4 === 1;
            return (
              <Animated.View
                key={`${controller.reader.book}-${controller.reader.chapter}-${item.verse}`}
                style={[
                  localStyles.verseRow,
                  startsParagraph ? localStyles.verseParagraphStart : null,
                  feedbackVerse === item.verse
                    ? {
                        transform: [
                          {
                            scale: feedbackPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, HIGHLIGHT_FEEDBACK_SCALE_MAX],
                            }),
                          },
                        ],
                      }
                    : null,
                  highlightVisual
                    ? [
                        localStyles.verseRowHighlightBase,
                        {
                          backgroundColor:
                            highlightVisual.tone?.fill ??
                            "rgba(212, 175, 55, 0.22)",
                          borderColor:
                            highlightVisual.tone?.stroke ??
                            "rgba(128, 90, 8, 0.85)",
                          borderLeftColor:
                            highlightVisual.tone?.bar ??
                            T.colors.accent,
                          shadowColor:
                            highlightVisual.tone?.bar ?? T.colors.accent,
                        },
                      ]
                    : null,
                  selectedVerse && !highlightVisual
                    ? localStyles.verseRowFocused
                    : null,
                  inSelection && !highlightVisual
                    ? localStyles.verseRowSelection
                    : null,
                ]}
              >
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Verse ${item.verse} references`}
                  onPress={() => void controller.selectReaderVerse(item.verse)}
                  style={localStyles.verseNumberButton}
                >
                  <Text style={localStyles.verseNumberText}>{item.verse}</Text>
                </PressableScale>

                <Pressable
                  onLongPress={() => {
                    triggerSelectionHaptic();
                    suppressNextVersePressRef.current = true;
                    lastVerseTapRef.current = null;
                    const draft = {
                      startVerse: item.verse,
                      endVerse: item.verse,
                    };
                    setSelectionDraft(draft);
                    void openSelectionTools(draft);
                  }}
                  onPress={() => handleVerseTextPress(item.verse, item.text)}
                  style={localStyles.verseTextPressable}
                >
                  <Text
                    style={[
                      localStyles.verseText,
                      startsParagraph
                        ? localStyles.verseTextParagraphStart
                        : null,
                    ]}
                  >
                    {item.text}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}

          {controller.readerSelectedVerse ? (
            <View style={localStyles.crossRefSection}>
              <Text style={localStyles.crossRefTitle}>
                Cross-references - {controller.reader.book}{" "}
                {controller.reader.chapter}:{controller.readerSelectedVerse}
              </Text>
              {controller.readerCrossReferencesLoading ? (
                <View style={styles.rowAlignCenter}>
                  <ActivityIndicator color={T.colors.accent} />
                  <Text style={styles.caption}>Loading references...</Text>
                </View>
              ) : null}
              {controller.readerCrossReferencesError ? (
                <Text style={styles.error}>
                  {controller.readerCrossReferencesError}
                </Text>
              ) : null}
              <View style={styles.suggestionRow}>
                {controller.readerCrossReferences.map((reference) => {
                  const label = `${reference.book} ${reference.chapter}:${reference.verse}`;
                  return (
                    <PressableScale
                      key={label}
                      onPress={() =>
                        void controller.navigateReaderTo(
                          reference.book,
                          reference.chapter,
                        )
                      }
                      style={styles.suggestionChip}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${label}`}
                    >
                      <Text style={styles.suggestionChipLabel}>{label}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={localStyles.chapterFooterSection}>
            {controller.readerFooterLoading ? (
              <Text style={styles.caption}>Loading chapter tools...</Text>
            ) : null}
            {controller.readerFooter ? (
              <>
                <Text style={localStyles.chapterOrientation}>
                  {controller.readerFooter.orientation}
                </Text>
                <Text style={localStyles.footerLabel}>
                  Ways to explore this chapter
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={localStyles.footerCardRow}
                >
                  {controller.readerFooter.cards.map((card, index) => (
                    <PressableScale
                      key={`${card.lens}-${card.title}-${index}`}
                      onPress={() => nav.openChat(card.prompt, true)}
                      style={localStyles.footerCardButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${card.title} in chat`}
                    >
                      <Text style={localStyles.footerCardLens}>
                        {card.lens}
                      </Text>
                      <Text
                        style={localStyles.footerCardTitle}
                        numberOfLines={1}
                      >
                        {card.title}
                      </Text>
                    </PressableScale>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={selectionModalVisible}
        animationType="slide"
        transparent
        onRequestClose={clearSelection}
      >
        <View style={localStyles.modalOverlay}>
          <Pressable onPress={clearSelection} style={localStyles.modalBackdrop} />
          <View style={localStyles.modalCard}>
            <View style={localStyles.modalHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.panelTitle}>Selection tools</Text>
                <Text style={styles.caption}>{selectedVerseLabel}</Text>
              </View>
              <ActionButton
                label="Close"
                variant="ghost"
                onPress={clearSelection}
              />
            </View>

            <ScrollView style={localStyles.modalContent}>
              <View style={localStyles.modalTabRow}>
                <PressableScale
                  onPress={() => {
                    setSelectionView("synopsis");
                    setActiveModalChip("synopsis");
                  }}
                  style={[
                    styles.outlineChip,
                    activeModalChip === "synopsis"
                      ? styles.outlineChipActive
                      : null,
                  ]}
                >
                  <Text style={styles.outlineChipLabel}>Synopsis</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => {
                    setSelectionView("root");
                    setActiveModalChip("root");
                    if (!selectionRoot && !selectionRootLoading) {
                      void loadSelectionRootTranslation();
                    }
                  }}
                  style={[
                    styles.outlineChip,
                    activeModalChip === "root" ? styles.outlineChipActive : null,
                  ]}
                >
                  <Text style={styles.outlineChipLabel}>Root</Text>
                </PressableScale>
              </View>

              {modalFeedbackLabel ? (
                <Text style={localStyles.modalFeedbackText}>
                  {modalFeedbackLabel}
                </Text>
              ) : null}

              {selectionView === "synopsis" ? (
                <View style={localStyles.modalPanel}>
                  {selectionSynopsisLoading ? (
                    <View style={styles.rowAlignCenter}>
                      <ActivityIndicator color={T.colors.accent} />
                      <Text style={styles.caption}>Analyzing selection...</Text>
                    </View>
                  ) : null}
                  {selectionSynopsisError ? (
                    <Text style={styles.error}>{selectionSynopsisError}</Text>
                  ) : null}
                  {selectionSynopsis && !selectionSynopsisLoading ? (
                    <Text style={styles.connectionSynopsis}>
                      {selectionSynopsis.synopsis}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View style={localStyles.modalPanel}>
                  {selectionRootLoading ? (
                    <View style={styles.rowAlignCenter}>
                      <ActivityIndicator color={T.colors.accent} />
                      <Text style={styles.caption}>
                        Loading root translation...
                      </Text>
                    </View>
                  ) : null}
                  {selectionRootError ? (
                    <Text style={styles.error}>{selectionRootError}</Text>
                  ) : null}
                  {selectionRoot ? (
                    <>
                      <Text style={styles.caption}>
                        Language: {selectionRoot.language || "unknown"}
                      </Text>
                      <Text style={styles.connectionSynopsis}>
                        {selectionRoot.lostContext}
                      </Text>
                      {selectionRoot.words.length > 0 ? (
                        <View style={localStyles.rootWordsWrap}>
                          {selectionRoot.words
                            .slice(0, 12)
                            .map((word, index) => (
                              <View
                                key={`${word.english}-${word.strongs}-${index}`}
                                style={localStyles.rootWordChip}
                              >
                                <Text style={localStyles.rootWordTitle}>
                                  {word.english}
                                </Text>
                                <Text style={localStyles.rootWordBody}>
                                  {word.original || word.strongs || "-"}
                                </Text>
                              </View>
                            ))}
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              )}

              <View style={localStyles.modalActionRow}>
                <ActionButton
                  label={selectionMapLoading ? "Tracing..." : "Trace"}
                  variant="primary"
                  disabled={selectionMapLoading}
                  onPress={() => void handleTraceSelection()}
                  style={localStyles.compactPrimaryButton}
                  labelStyle={localStyles.compactPrimaryButtonLabel}
                />
                <ActionButton
                  label={selectionCopySuccess ? "Copied" : "Copy"}
                  variant="ghost"
                  onPress={() => void handleCopySelection()}
                  style={localStyles.compactHeaderAction}
                  labelStyle={localStyles.compactHeaderActionLabel}
                />
                <ActionButton
                  label={selectionShareSuccess ? "Shared" : "Share"}
                  variant="ghost"
                  onPress={() => void handleShareSelection()}
                  style={localStyles.compactHeaderAction}
                  labelStyle={localStyles.compactHeaderActionLabel}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  headerShell: {
    borderBottomWidth: 1,
    borderBottomColor: T.colors.border,
    backgroundColor: "rgba(24,24,27,0.94)",
  },
  headerBar: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 5,
  },
  headerControlsTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
    gap: 8,
  },
  headerCollapsedBar: {
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerCollapsedLabel: {
    flex: 1,
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    fontWeight: "600",
  },
  headerToggleButton: {
    width: 28,
    height: 28,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bookInput: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    color: T.colors.text,
    fontSize: T.typography.caption,
    paddingHorizontal: 8,
  },
  chapterInput: {
    width: 44,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    color: T.colors.text,
    fontSize: T.typography.caption,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  compactPrimaryButton: {
    flex: 0,
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  compactPrimaryButtonLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  compactHeaderAction: {
    flex: 0,
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  compactHeaderActionLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  headerSuggestionRow: {
    gap: 6,
    paddingVertical: 2,
  },
  headerSuggestionChip: {
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.canvasMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectionStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  readerScroll: {
    flex: 1,
  },
  readerContent: {
    paddingHorizontal: 0,
    paddingBottom: 22,
  },
  readingSurface: {
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24,
  },
  verseRow: {
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingVertical: 2,
    flexDirection: "row",
    gap: 2,
    alignItems: "flex-start",
  },
  verseParagraphStart: {
    marginTop: 14,
  },
  verseRowHighlightBase: {
    borderWidth: 1.5,
    borderLeftWidth: 3,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 1,
  },
  verseRowSelection: {
    borderWidth: 1,
    borderRadius: T.radius.sm,
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  verseRowFocused: {
    borderWidth: 1,
    borderRadius: T.radius.sm,
    borderColor: T.colors.pine,
    backgroundColor: T.colors.pineSoft,
  },
  verseNumberButton: {
    minWidth: 12,
    minHeight: 16,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  verseNumberText: {
    color: T.colors.accent,
    fontWeight: "700",
    fontSize: 9,
  },
  verseTextPressable: {
    flex: 1,
    paddingRight: 1,
  },
  verseText: {
    color: T.colors.text,
    fontSize: 18,
    lineHeight: 31,
    fontFamily: T.fonts.serif,
  },
  verseTextParagraphStart: {
    paddingLeft: 8,
  },
  crossRefSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    paddingTop: 10,
    gap: 8,
  },
  crossRefTitle: {
    color: T.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  chapterFooterSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    paddingTop: 14,
    gap: 6,
  },
  chapterOrientation: {
    color: T.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
    paddingHorizontal: 4,
    textAlign: "center",
  },
  footerLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  footerCardRow: {
    gap: 6,
    paddingRight: 8,
  },
  footerCardButton: {
    minWidth: 108,
    borderRadius: T.radius.sm,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
  },
  footerCardLens: {
    color: T.colors.accent,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  footerCardTitle: {
    color: T.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  modalCard: {
    maxHeight: "84%",
    borderTopLeftRadius: T.radius.lg,
    borderTopRightRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.ink,
    padding: T.spacing.md,
    gap: T.spacing.sm,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.spacing.sm,
  },
  modalContent: {
    maxHeight: 540,
  },
  selectionPreviewCard: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    padding: T.spacing.sm,
    marginBottom: T.spacing.sm,
  },
  selectionPreviewText: {
    color: T.colors.text,
    fontFamily: T.fonts.serif,
    fontSize: T.typography.body,
    lineHeight: 28,
  },
  modalTabRow: {
    flexDirection: "row",
    gap: T.spacing.sm,
    marginBottom: T.spacing.sm,
  },
  modalFeedbackText: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    marginBottom: T.spacing.sm,
  },
  modalPanel: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    padding: T.spacing.sm,
    gap: T.spacing.sm,
    marginBottom: T.spacing.sm,
  },
  modalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: T.spacing.sm,
  },
  highlightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: T.spacing.sm,
    marginTop: T.spacing.sm,
    marginBottom: T.spacing.lg,
  },
  highlightColorButton: {
    width: T.touchTarget.min,
    height: T.touchTarget.min,
    borderRadius: T.touchTarget.min,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  rootWordsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: T.spacing.xs,
  },
  rootWordChip: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.canvasMuted,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 6,
    minWidth: 96,
  },
  rootWordTitle: {
    color: T.colors.text,
    fontSize: T.typography.caption,
    fontWeight: "700",
  },
  rootWordBody: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
  },
});
