import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { RootTranslationWord } from "../../lib/api";
import { chunkLostContext } from "../../utils/lostContextChunker";
import { styles, T } from "../../theme/mobileStyles";
import { PressableScale } from "./PressableScale";

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
  language,
  words,
  lostContext,
  fallbackText,
  selectedWordIndex,
  onSelectWord,
  onBack,
  backLabel = "Back to synopsis",
}: RootTranslationPanelProps) {
  const [lostContextPage, setLostContextPage] = useState(0);
  const touchStartXRef = useRef<number | null>(null);

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
    <View style={localStyles.rootWrap}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        motionPreset="quiet"
        onPress={onBack}
        style={localStyles.backButton}
      >
        <Text style={localStyles.backButtonLabel}>{backLabel}</Text>
      </PressableScale>

      {isLoading ? (
        <View style={styles.rowAlignCenter}>
          <ActivityIndicator color={T.colors.accent} />
          <Text style={styles.caption}>
            Translating from original {language || "Hebrew/Greek"}...
          </Text>
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
            <View
              style={localStyles.lostSection}
              onTouchStart={(event) => {
                touchStartXRef.current = event.nativeEvent.locationX;
              }}
              onTouchEnd={(event) => {
                const startX = touchStartXRef.current;
                if (startX === null) return;
                const endX = event.nativeEvent.locationX;
                const delta = startX - endX;
                if (Math.abs(delta) < 40) return;
                if (delta > 0 && canNextLostContext) {
                  setLostContextPage((current) =>
                    Math.min(current + 1, lostContextTotal - 1),
                  );
                } else if (delta < 0 && canPrevLostContext) {
                  setLostContextPage((current) => Math.max(current - 1, 0));
                }
              }}
            >
              <Text style={localStyles.lostTitle}>Lost in translation</Text>
              <Text style={styles.connectionSynopsis}>
                {lostContextCurrent}
              </Text>

              {lostContextTotal > 1 ? (
                <View style={localStyles.lostPagerRow}>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Previous lost context page"
                    motionPreset="quiet"
                    disabled={!canPrevLostContext}
                    onPress={() =>
                      setLostContextPage((current) => Math.max(current - 1, 0))
                    }
                    style={[
                      styles.outlineChip,
                      !canPrevLostContext
                        ? localStyles.pagerButtonDisabled
                        : null,
                    ]}
                  >
                    <Text style={styles.outlineChipLabel}>Prev</Text>
                  </PressableScale>
                  <Text style={styles.caption}>
                    {lostContextPage + 1}/{lostContextTotal}
                  </Text>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Next lost context page"
                    motionPreset="quiet"
                    disabled={!canNextLostContext}
                    onPress={() =>
                      setLostContextPage((current) =>
                        Math.min(current + 1, lostContextTotal - 1),
                      )
                    }
                    style={[
                      styles.outlineChip,
                      !canNextLostContext
                        ? localStyles.pagerButtonDisabled
                        : null,
                    ]}
                  >
                    <Text style={styles.outlineChipLabel}>
                      {canNextLostContext ? "Read more" : "Next"}
                    </Text>
                  </PressableScale>
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
    </View>
  );
}

const localStyles = StyleSheet.create({
  rootWrap: {
    gap: T.spacing.sm,
  },
  backButton: {
    alignSelf: "flex-start",
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 5,
    backgroundColor: T.colors.surface,
  },
  backButtonLabel: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    fontWeight: "600",
  },
  contentWrap: {
    gap: T.spacing.sm,
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
  lostPagerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: T.spacing.sm,
  },
  pagerButtonDisabled: {
    opacity: 0.45,
  },
});
