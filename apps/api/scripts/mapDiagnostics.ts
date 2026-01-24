import { getVerseId, buildVisualBundle } from "../src/bible/graphWalker";
import { parseExplicitReference } from "../src/bible/referenceParser";
import type { VisualContextBundle } from "../src/bible/types";

type QueryCase = {
  label: string;
  reference: string;
  query: string;
};

const CASES: QueryCase[] = [
  {
    label: "Genesis creation",
    reference: "Genesis 1:1",
    query: "creation in the beginning",
  },
  {
    label: "Psalm shepherd",
    reference: "Psalms 23:1",
    query: "the Lord is my shepherd",
  },
  {
    label: "Suffering servant",
    reference: "Isaiah 53:5",
    query: "suffering servant prophecy",
  },
  {
    label: "John 3:16",
    reference: "John 3:16",
    query: "God so loved the world",
  },
  {
    label: "Romans 8:1",
    reference: "Romans 8:1",
    query: "no condemnation in Christ",
  },
];

const summarizeBundle = (bundle: VisualContextBundle) => {
  const edgeCounts: Record<string, number> = {};
  bundle.edges.forEach((edge) => {
    edgeCounts[edge.type] = (edgeCounts[edge.type] ?? 0) + 1;
  });

  const bookCounts: Record<string, number> = {};
  bundle.nodes.forEach((node) => {
    const book = node.book_abbrev?.toLowerCase() || "unknown";
    bookCounts[book] = (bookCounts[book] ?? 0) + 1;
  });

  const depthCounts: Record<number, number> = {};
  bundle.nodes.forEach((node) => {
    depthCounts[node.depth] = (depthCounts[node.depth] ?? 0) + 1;
  });

  return {
    nodeCount: bundle.nodes.length,
    edgeCount: bundle.edges.length,
    edgeCounts,
    bookCounts,
    depthCounts,
  };
};

const formatCounts = (counts: Record<string | number, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");

const runCase = async (
  label: string,
  anchorId: number,
  query: string,
  modeLabel: string,
  selectionOverrides: Record<string, unknown>,
) => {
  const bundle = (await buildVisualBundle(
    anchorId,
    {
      selection: {
        mode: "hybrid",
        query,
        versePoolSize: 100,
        pericopePoolSize: 30,
        pericopeMaxVerses: 300,
        strongPercentile: 0.85,
        ...selectionOverrides,
      },
      adaptive: {
        enabled: true,
        startLimit: 12,
        minLimit: 2,
        multiplier: 2,
        signalThreshold: 0.8,
      },
    },
    {
      includeDEEPER: true,
      includeROOTS: true,
      includeECHOES: true,
      includePROPHECY: true,
      includeGENEALOGY: false,
    },
  )) as VisualContextBundle;

  const summary = summarizeBundle(bundle);
  console.log(
    `[${label}] ${modeLabel} nodes=${summary.nodeCount} edges=${summary.edgeCount} depth=${formatCounts(
      summary.depthCounts,
    )}`,
  );
  console.log(
    `[${label}] ${modeLabel} edges: ${formatCounts(summary.edgeCounts)}`,
  );
  console.log(
    `[${label}] ${modeLabel} books: ${formatCounts(summary.bookCounts)}`,
  );
};

const resolveAnchor = async (reference: string) => {
  const parsed = parseExplicitReference(reference);
  if (!parsed) return null;
  return getVerseId(parsed.book, parsed.chapter, parsed.verse);
};

const main = async () => {
  for (const testCase of CASES) {
    const anchorId = await resolveAnchor(testCase.reference);
    if (!anchorId) {
      console.error(
        `[${testCase.label}] Failed to resolve ${testCase.reference}`,
      );
      continue;
    }

    await runCase(testCase.label, anchorId, testCase.query, "baseline", {
      minStrongSim: 0,
      edgeWeightBonus: 0,
      coherenceBonus: 0,
      diversityMaxPerBook: 0,
      edgeTypeBonuses: {},
      fallbackLimit: 0,
    });

    await runCase(testCase.label, anchorId, testCase.query, "enhanced", {
      minStrongSim: 0.12,
      edgeWeightBonus: 0.12,
      coherenceBonus: 0.06,
      diversityMaxPerBook: 2,
      queryWeight: 0.35,
      anchorWeight: 1.0,
    });
  }
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[mapDiagnostics] Failed:", err);
    process.exit(1);
  });
