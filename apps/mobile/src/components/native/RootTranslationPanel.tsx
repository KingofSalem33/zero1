import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootTranslationWord } from "../../lib/api";
import { chunkLostContext } from "../../utils/lostContextChunker";
import { styles, T } from "../../theme/mobileStyles";
import { ChipButton } from "./ChipButton";
import { IconButton } from "./IconButton";
import { PressableScale } from "./PressableScale";
import { SkeletonBlock, SkeletonTextLines } from "./loading/SkeletonNative";

interface RootTranslationPanelProps {
  isLoading: boolean;
  language: string;
  words: RootTranslationWord[];
  lostContext: string;
  fallbackText: string;
  selectedWordIndex: number | null;
  onSelectWord: (index: number | null) => void;
  onBack: () => void;
  backLabel?: string;
}

export function RootTranslationPanel({
  isLoading,
  language: _language,
  words,
  lostContext,
  fallbackText,
  selectedWordIndex,
  onSelectWord,
  onBack,
  backLabel = "Back to synopsis",
}: RootTranslationPanelProps) {
  const insets = useSafeAreaInsets();
  const [lostContextPage, setLostContextPage] = useState(0);

  const lostContextChunks = useMemo(
    () => chunkLostContext(lostContext),
    [lostContext],
  );
  const lostContextTotal = lostContextChunks.length;
  const lostContextCurrent = lostContextChunks[lostContextPage] || lostContext;
  const canPrevLostContext = lostContextPage > 0;
  const canNextLostContext = lostContextPage < lostContextTotal - 1;

  useEffect(() => {
    setLostContextPage(0);
  }, [lostContext]);

  const selectedWord =
    selectedWordIndex !== null ? (words[selectedWordIndex] ?? null) : null;

  return (
    <BottomSheetScrollView
      style={localStyles.scrollView}
      contentContainerStyle={[
        localStyles.rootWrap,
        { paddingBottom: Math.max(T.spacing.xl, insets.bottom + T.spacing.md) },
      ]}
      showsVerticalScrollIndicator
    >
      <ChipButton
        accessibilityLabel={backLabel}
        motionPreset="quiet"
        onPress={onBack}
        label={backLabel}
        style={localStyles.backButton}
        labelStyle={localStyles.backButtonLabel}
      />

      {isLoading ? (
        <View style={localStyles.loadingPanel}>
          <SkeletonBlock width={144} height={12} radius={6} />
          <SkeletonTextLines
            lines={["100%", "100%", "96%", "88%", "92%", "74%"]}
            gap={10}
          />
        </View>
      ) : words.length > 0 || lostContext.length > 0 ? (
        <View style={localStyles.contentWrap}>
          {words.length > 0 ? (
            <View style={localStyles.wordsSection}>
              <View style={localStyles.wordWrap}>
                {words.map((word, index) => {
                  const hasStrongs = Boolean(word.strongs);
                  const selected = selectedWordIndex === index;
                  const originalLabel = word.original
                    ? `(${word.original})`
                    : "";
                  return (
                    <PressableScale
                      key={`${word.english}-${word.strongs || "none"}-${index}`}
                      accessibilityRole={hasStrongs ? "button" : undefined}
                      accessibilityLabel={
                        hasStrongs
                          ? `Strong's ${word.strongs || ""}`
                          : `Word ${word.english}`
                      }
                      motionPreset="quiet"
                      disabled={!hasStrongs}
                      onPress={() => {
                        if (!hasStrongs) return;
                        onSelectWord(selected ? null : index);
                      }}
                      style={[
                        localStyles.wordChip,
                        selected ? localStyles.wordChipSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.wordEnglish,
                          hasStrongs ? localStyles.wordEnglishActive : null,
                          selected ? localStyles.wordEnglishSelected : null,
                        ]}
                      >
                        {word.english}
                      </Text>
                      {originalLabel ? (
                        <Text style={localStyles.wordOriginal}>
                          {originalLabel}
                        </Text>
                      ) : null}
                    </PressableScale>
                  );
                })}
              </View>

              {selectedWord ? (
                <View style={localStyles.definitionCard}>
                  <Text style={localStyles.definitionMeta}>
                    Strong's {selectedWord.strongs || "-"}
                  </Text>
                  <Text style={localStyles.definitionBody}>
                    {selectedWord.definition || "Definition unavailable."}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {lostContext.length > 0 ? (
            <View style={localStyles.lostSection}>
              <Text style={localStyles.lostTitle}>Lost in translation</Text>
              <Text style={localStyles.lostBody}>{lostContextCurrent}</Text>

              {lostContextTotal > 1 ? (
                <View style={localStyles.lostPagerRow}>
                  <IconButton
                    accessibilityLabel="Previous lost context page"
                    motionPreset="quiet"
                    disabled={!canPrevLostContext}
                    onPress={() =>
                      setLostContextPage((current) => Math.max(current - 1, 0))
                    }
                    icon={
                      <Ionicons
                        name="chevron-back"
                        size={14}
                        color={
                          canPrevLostContext
                            ? "rgba(228, 228, 231, 0.88)"
                            : "rgba(228, 228, 231, 0.36)"
                        }
                      />
                    }
                    style={
                      !canPrevLostContext
                        ? localStyles.pagerButtonDisabled
                        : undefined
                    }
                  />
                  <Text style={localStyles.pagerCounterLabel}>
                    {lostContextPage + 1}/{lostContextTotal}
                  </Text>
                  <IconButton
                    accessibilityLabel="Next lost context page"
                    motionPreset="quiet"
                    disabled={!canNextLostContext}
                    onPress={() =>
                      setLostContextPage((current) =>
                        Math.min(current + 1, lostContextTotal - 1),
                      )
                    }
                    icon={
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={
                          canNextLostContext
                            ? "rgba(228, 228, 231, 0.88)"
                            : "rgba(228, 228, 231, 0.36)"
                        }
                      />
                    }
                    style={
                      !canNextLostContext
                        ? localStyles.pagerButtonDisabled
                        : undefined
                    }
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.connectionSynopsis}>
          {fallbackText || "Root translation unavailable."}
        </Text>
      )}
    </BottomSheetScrollView>
  );
}

const localStyles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  rootWrap: {
    gap: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: T.spacing.md,
    paddingVertical: 8,
  },
  backButtonLabel: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    fontWeight: "700",
  },
  contentWrap: {
    gap: T.spacing.sm,
  },
  loadingPanel: {
    gap: 14,
  },
  wordsSection: {
    gap: T.spacing.sm,
  },
  wordWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: T.spacing.xs,
  },
  wordChip: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.pill,
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  wordChipSelected: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  wordEnglish: {
    color: T.colors.text,
    fontSize: T.typography.caption,
    fontWeight: "600",
  },
  wordEnglishActive: {
    color: T.colors.accent,
  },
  wordEnglishSelected: {
    color: T.colors.accentStrong,
  },
  wordOriginal: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
  },
  definitionCard: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: T.spacing.sm,
    gap: 4,
  },
  definitionMeta: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  definitionBody: {
    color: T.colors.text,
    fontSize: T.typography.caption,
    lineHeight: 18,
  },
  lostSection: {
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    paddingTop: T.spacing.sm,
    gap: T.spacing.sm,
  },
  lostTitle: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  lostBody: {
    color: T.colors.text,
    fontSize: T.typography.caption,
    lineHeight: 22,
  },
  lostPagerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  pagerArrowButton: {
    width: T.touchTarget.min,
    height: T.touchTarget.min,
  },
  pagerCounterLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    minWidth: 34,
    textAlign: "center",
  },
  pagerButtonDisabled: {
    opacity: 0.45,
  },
});
