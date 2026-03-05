import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getBibleBookSuggestions,
  getBibleChapterCount,
  resolveBibleBookName,
} from "@zero1/shared";
import { ActionButton } from "../components/native/ActionButton";
import { PressableScale } from "../components/native/PressableScale";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { fetchTraceBundle } from "../lib/api";
import { MOBILE_ENV } from "../lib/env";
import { styles, T } from "../theme/mobileStyles";
import { formatRelativeDate } from "./common/EntityCards";
import { isVisualContextBundle } from "../types/visualization";

export function ReaderScreen({
  nav,
}: {
  nav: {
    openChat: (prompt: string, autoSend?: boolean) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
  };
}) {
  const controller = useMobileApp();
  const listRef = useRef<FlatList<{ verse: number; text: string }> | null>(
    null,
  );
  const [bookInput, setBookInput] = useState(controller.reader.book);
  const [chapterInput, setChapterInput] = useState(
    String(controller.reader.chapter),
  );
  const [mapBusyVerse, setMapBusyVerse] = useState<number | null>(null);

  useEffect(() => {
    setBookInput(controller.reader.book);
    setChapterInput(String(controller.reader.chapter));
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [controller.reader.book, controller.reader.chapter]);

  const bookSuggestions = useMemo(() => {
    const query = bookInput.trim();
    if (!query) {
      return [];
    }
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
    return maxChapter ? `Chapters 1-${maxChapter}` : null;
  }, [bookInput]);

  async function handleGoToChapter() {
    const canonical = resolveBibleBookName(bookInput);
    const parsedChapter = Number(chapterInput.trim());
    if (!canonical || !Number.isInteger(parsedChapter)) {
      return;
    }
    await controller.navigateReaderTo(canonical, parsedChapter);
  }

  function buildGoDeeperPrompt(verse: number, text: string): string {
    return `Explore ${controller.reader.book} ${controller.reader.chapter}:${verse} in depth.\n\n${text}`;
  }

  async function handleOpenMapForVerse(verse: number, text: string) {
    setMapBusyVerse(verse);
    try {
      const bundle = await fetchTraceBundle({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: `${controller.reader.book} ${controller.reader.chapter}:${verse} ${text}`,
        accessToken: controller.session?.access_token,
      });
      if (!isVisualContextBundle(bundle)) {
        throw new Error("Map response was malformed.");
      }
      nav.openMapViewer(
        `${controller.reader.book} ${controller.reader.chapter}:${verse}`,
        bundle,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("aborted")) {
         
        console.warn("[ReaderScreen] Failed to open map:", message);
      }
    } finally {
      setMapBusyVerse(null);
    }
  }

  return (
    <View style={styles.tabScreen}>
      <SurfaceCard>
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Bible Reader</Text>
            <Text style={styles.panelSubtitle}>
              Read chapter-by-chapter with verse tools for bookmarks,
              highlights, and cross-references.
            </Text>
          </View>
          <ActionButton
            disabled={controller.readerLoading}
            label={controller.readerLoading ? "Loading..." : "Refresh"}
            onPress={() =>
              void controller.navigateReaderTo(
                controller.reader.book,
                controller.reader.chapter,
              )
            }
            variant="ghost"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, styles.flex1]}>
            <Text style={styles.helperText}>Book</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="Book"
              accessibilityLabel="Reader book"
              placeholderTextColor={T.colors.textMuted}
              style={styles.input}
              value={bookInput}
              onChangeText={setBookInput}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.helperText}>Chapter</Text>
            <TextInput
              keyboardType="number-pad"
              placeholder="Chapter"
              accessibilityLabel="Reader chapter"
              placeholderTextColor={T.colors.textMuted}
              style={[styles.input, styles.inputCompact]}
              value={chapterInput}
              onChangeText={setChapterInput}
            />
          </View>
        </View>

        {chapterHint ? <Text style={styles.caption}>{chapterHint}</Text> : null}
        {bookSuggestions.length > 0 ? (
          <View style={styles.suggestionRow}>
            {bookSuggestions.map((book) => (
              <PressableScale
                key={book}
                onPress={() => setBookInput(book)}
                style={styles.suggestionChip}
                accessibilityRole="button"
                accessibilityLabel={`Select ${book}`}
              >
                <Text style={styles.suggestionChipLabel}>{book}</Text>
              </PressableScale>
            ))}
          </View>
        ) : null}

        <View style={styles.row}>
          <ActionButton
            disabled={controller.readerLoading}
            label="Go"
            onPress={() => void handleGoToChapter()}
            variant="primary"
          />
          <ActionButton
            disabled={controller.readerLoading}
            label="Prev"
            onPress={() => void controller.goToPreviousReaderChapter()}
            variant="secondary"
          />
          <ActionButton
            disabled={controller.readerLoading}
            label="Next"
            onPress={() => void controller.goToNextReaderChapter()}
            variant="secondary"
          />
        </View>

        {controller.readerLoadedAt ? (
          <Text style={styles.caption}>
            Last sync {formatRelativeDate(controller.readerLoadedAt)}
          </Text>
        ) : null}
        {controller.readerError ? (
          <Text style={styles.error}>{controller.readerError}</Text>
        ) : null}
      </SurfaceCard>

      <FlatList
        ref={listRef}
        data={controller.reader.verses}
        keyExtractor={(item) =>
          `${controller.reader.book}-${controller.reader.chapter}-${item.verse}`
        }
        contentContainerStyle={styles.listContent}
        refreshing={controller.readerLoading}
        onRefresh={() =>
          void controller.navigateReaderTo(
            controller.reader.book,
            controller.reader.chapter,
          )
        }
        ListHeaderComponent={
          <SurfaceCard>
            <Text style={styles.panelTitle}>
              {controller.reader.book} {controller.reader.chapter}
            </Text>
            <Text style={styles.panelSubtitle}>
              Tap a verse to open tools and references.
            </Text>
            {controller.readerFooterLoading ? (
              <Text style={styles.caption}>Loading chapter tools...</Text>
            ) : null}
            {controller.readerFooter ? (
              <View style={styles.readerFooterWrap}>
                <Text style={styles.readerOrientationText}>
                  {controller.readerFooter.orientation}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.readerToolCardRow}
                >
                  {controller.readerFooter.cards.map((card, index) => (
                    <View
                      key={`${card.lens}-${card.title}-${index}`}
                      style={styles.readerToolCard}
                    >
                      <Text style={styles.readerToolLens}>{card.lens}</Text>
                      <Text style={styles.readerToolTitle}>{card.title}</Text>
                      <Text style={styles.readerToolPrompt} numberOfLines={3}>
                        {card.prompt}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {controller.readerFooterError ? (
              <Text style={styles.caption}>
                Tool cards unavailable: {controller.readerFooterError}
              </Text>
            ) : null}
          </SurfaceCard>
        }
        renderItem={({ item }) => {
          const selected = controller.readerSelectedVerse === item.verse;
          return (
            <PressableScale
              style={[
                styles.readerVerseCard,
                selected ? styles.readerVerseCardSelected : null,
              ]}
              onPress={() => void controller.selectReaderVerse(item.verse)}
              accessibilityRole="button"
              accessibilityLabel={`Verse ${item.verse}`}
            >
              <View style={styles.readerVerseHeaderRow}>
                <Text style={styles.readerVerseNumber}>{item.verse}</Text>
                {selected ? (
                  <Text style={styles.metaPill}>Selected</Text>
                ) : null}
              </View>
              <Text style={styles.readerVerseText}>{item.text}</Text>
              {selected ? (
                <View style={styles.quickActionsRow}>
                  <PressableScale
                    onPress={() =>
                      void controller.handleReaderBookmarkVerse(item.verse)
                    }
                    style={styles.quickActionButton}
                    accessibilityRole="button"
                    accessibilityLabel="Bookmark verse"
                  >
                    <Text style={styles.quickActionButtonLabel}>Bookmark</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() =>
                      void controller.handleReaderHighlightVerse(
                        item.verse,
                        item.text,
                      )
                    }
                    style={styles.quickActionButton}
                    accessibilityRole="button"
                    accessibilityLabel="Highlight verse"
                  >
                    <Text style={styles.quickActionButtonLabel}>Highlight</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() =>
                      nav.openChat(
                        buildGoDeeperPrompt(item.verse, item.text),
                        true,
                      )
                    }
                    style={styles.quickActionButton}
                    accessibilityRole="button"
                    accessibilityLabel="Go deeper in chat"
                  >
                    <Text style={styles.quickActionButtonLabel}>Go Deeper</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() =>
                      void handleOpenMapForVerse(item.verse, item.text)
                    }
                    style={styles.quickActionButton}
                    disabled={mapBusyVerse === item.verse}
                    accessibilityRole="button"
                    accessibilityLabel="Open verse map"
                  >
                    <Text style={styles.quickActionButtonLabel}>
                      {mapBusyVerse === item.verse ? "Mapping..." : "Map"}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => controller.clearReaderVerseSelection()}
                    style={styles.quickActionButton}
                    accessibilityRole="button"
                    accessibilityLabel="Close verse actions"
                  >
                    <Text style={styles.quickActionButtonLabel}>Close</Text>
                  </PressableScale>
                </View>
              ) : null}
            </PressableScale>
          );
        }}
        ListFooterComponent={
          controller.readerSelectedVerse ? (
            <SurfaceCard>
              <Text style={styles.panelTitle}>
                Cross-references for {controller.reader.book}{" "}
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
              {controller.readerCrossReferences.length === 0 &&
              !controller.readerCrossReferencesLoading &&
              !controller.readerCrossReferencesError ? (
                <Text style={styles.caption}>
                  No cross-references returned for this verse.
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
            </SurfaceCard>
          ) : null
        }
        ListEmptyComponent={
          controller.readerLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={T.colors.accent} />
              <Text style={styles.emptyTitle}>Loading chapter...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No verses loaded</Text>
              <Text style={styles.emptySubtitle}>
                Choose a valid book and chapter, then press Go.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
