import { StyleSheet, View } from "react-native";
import { T } from "../../../theme/mobileStyles";
import { SkeletonBlock } from "./SkeletonNative";

export function ReaderChapterSkeleton() {
  return (
    <View style={localStyles.wrap}>
      <View style={localStyles.heading}>
        <SkeletonBlock width={150} height={34} radius={8} />
        <SkeletonBlock width={56} height={62} radius={10} />
      </View>

      <View style={localStyles.verseFlow}>
        <SkeletonBlock width="18%" height={10} radius={4} />
        <SkeletonBlock width="96%" height={11} radius={5} />
        <SkeletonBlock width="92%" height={11} radius={5} />
        <SkeletonBlock width="84%" height={11} radius={5} />

        <View style={localStyles.paraGap} />

        <SkeletonBlock width="16%" height={10} radius={4} />
        <SkeletonBlock width="98%" height={11} radius={5} />
        <SkeletonBlock width="95%" height={11} radius={5} />
        <SkeletonBlock width="89%" height={11} radius={5} />
        <SkeletonBlock width="76%" height={11} radius={5} />

        <View style={localStyles.paraGap} />

        <SkeletonBlock width="15%" height={10} radius={4} />
        <SkeletonBlock width="97%" height={11} radius={5} />
        <SkeletonBlock width="88%" height={11} radius={5} />
        <SkeletonBlock width="94%" height={11} radius={5} />
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 18,
  },
  heading: {
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212, 175, 55, 0.18)",
    paddingBottom: 20,
    marginBottom: 4,
    gap: 10,
  },
  verseFlow: {
    gap: 11,
    paddingHorizontal: 2,
  },
  paraGap: {
    height: T.spacing.sm,
  },
});
