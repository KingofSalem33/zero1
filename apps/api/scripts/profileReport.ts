import fs from "fs";
import path from "path";

type StageRecord = {
  name: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  meta?: Record<string, unknown>;
};

type RequestRecord = {
  id: string;
  method: string;
  path: string;
  pipeline: string;
  status: number;
  start_iso: string;
  duration_ms: number;
  stages: StageRecord[];
  meta?: Record<string, unknown>;
};

type Stats = {
  count: number;
  mean: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p99: number;
  stddev: number;
  cv: number;
};

type PipelineSummary = {
  count: number;
  duration: Stats;
  stages: Record<string, Stats>;
  correlation_ids: string[];
};

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

const inputPath =
  getArg("--input") ||
  path.resolve(process.cwd(), "apps", "api", "profiling", "requests.jsonl");
const outputDir =
  getArg("--out") || path.resolve(process.cwd(), "apps", "api", "profiling");

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
};

const computeStats = (values: number[]): Stats => {
  if (values.length === 0) {
    return {
      count: 0,
      mean: 0,
      min: 0,
      max: 0,
      p50: 0,
      p90: 0,
      p99: 0,
      stddev: 0,
      cv: 0,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / count;
  const variance =
    sorted.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / count;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 0;
  return {
    count,
    mean,
    min,
    max,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    stddev,
    cv,
  };
};

const heatSymbol = (cv: number) => {
  if (cv <= 0.1) return ".";
  if (cv <= 0.25) return ":";
  if (cv <= 0.5) return "+";
  if (cv <= 1.0) return "#";
  return "!";
};

const fmt = (n: number) => n.toFixed(2);

const raw = fs.existsSync(inputPath) ? fs.readFileSync(inputPath, "utf-8") : "";
const lines = raw
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const records: RequestRecord[] = [];
for (const line of lines) {
  try {
    records.push(JSON.parse(line) as RequestRecord);
  } catch (error) {
    console.warn("[profileReport] Skipping bad line:", error);
  }
}

const pipelines = new Map<
  string,
  { durations: number[]; stages: Map<string, number[]>; ids: string[] }
>();

for (const record of records) {
  const entry =
    pipelines.get(record.pipeline) ||
    ({
      durations: [],
      stages: new Map<string, number[]>(),
      ids: [],
    } as const);
  entry.durations.push(record.duration_ms);
  entry.ids.push(record.id);
  for (const stage of record.stages || []) {
    const list = entry.stages.get(stage.name) || [];
    list.push(stage.duration_ms);
    entry.stages.set(stage.name, list);
  }
  pipelines.set(record.pipeline, entry);
}

const pipelineSummaries: Record<string, PipelineSummary> = {};
const latencyContributors: Array<{
  pipeline: string;
  stage: string;
  mean_ms: number;
  p90_ms: number;
  p99_ms: number;
  count: number;
}> = [];

let markdown = `# API Profiling Report\n\n`;
markdown += `Input: \`${inputPath}\`\n\n`;
markdown += `Total samples: ${records.length}\n\n`;

for (const [pipeline, data] of pipelines.entries()) {
  const durationStats = computeStats(data.durations);
  const stageStats: Record<string, Stats> = {};

  markdown += `## Pipeline: ${pipeline}\n\n`;
  markdown += `Runs: ${durationStats.count}\n\n`;
  markdown += `Duration (ms): mean ${fmt(
    durationStats.mean,
  )} | p50 ${fmt(durationStats.p50)} | p90 ${fmt(
    durationStats.p90,
  )} | p99 ${fmt(durationStats.p99)} | min ${fmt(
    durationStats.min,
  )} | max ${fmt(durationStats.max)}\n\n`;

  markdown +=
    "| Stage | Count | Mean | p50 | p90 | p99 | Min | Max | CV | Heat |\n";
  markdown += "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";

  for (const [stageName, durations] of data.stages.entries()) {
    const stats = computeStats(durations);
    stageStats[stageName] = stats;
    markdown += `| ${stageName} | ${stats.count} | ${fmt(
      stats.mean,
    )} | ${fmt(stats.p50)} | ${fmt(stats.p90)} | ${fmt(
      stats.p99,
    )} | ${fmt(stats.min)} | ${fmt(stats.max)} | ${fmt(
      stats.cv,
    )} | ${heatSymbol(stats.cv)} |\n`;

    latencyContributors.push({
      pipeline,
      stage: stageName,
      mean_ms: stats.mean,
      p90_ms: stats.p90,
      p99_ms: stats.p99,
      count: stats.count,
    });
  }

  markdown += "\n";

  pipelineSummaries[pipeline] = {
    count: durationStats.count,
    duration: durationStats,
    stages: stageStats,
    correlation_ids: data.ids.slice(0, 10),
  };
}

const topContributors = latencyContributors
  .sort((a, b) => b.mean_ms - a.mean_ms)
  .slice(0, 15);

markdown += "## Variance Heatmap (Stage CV)\n\n";
markdown +=
  "Legend: . (low) : (moderate) + (high) # (very high) ! (extreme)\n\n";

for (const [pipeline, data] of pipelines.entries()) {
  markdown += `- ${pipeline}\n`;
  for (const [stageName, durations] of data.stages.entries()) {
    const stats = computeStats(durations);
    markdown += `  ${heatSymbol(stats.cv)} ${stageName} (cv ${fmt(
      stats.cv,
    )})\n`;
  }
}

markdown += "\n## Top Latency Contributors (by mean stage duration)\n\n";
markdown +=
  "| Rank | Pipeline | Stage | Mean | p90 | p99 | Count |\n| --- | --- | --- | --- | --- | --- | --- |\n";
topContributors.forEach((entry, idx) => {
  markdown += `| ${idx + 1} | ${entry.pipeline} | ${entry.stage} | ${fmt(
    entry.mean_ms,
  )} | ${fmt(entry.p90_ms)} | ${fmt(entry.p99_ms)} | ${entry.count} |\n`;
});

const reportJson = {
  generated_at: new Date().toISOString(),
  input: inputPath,
  total_samples: records.length,
  pipelines: pipelineSummaries,
  top_latency_contributors: topContributors,
};

ensureDir(outputDir);
fs.writeFileSync(
  path.join(outputDir, "report.json"),
  JSON.stringify(reportJson, null, 2),
  "utf-8",
);
fs.writeFileSync(path.join(outputDir, "report.md"), markdown, "utf-8");

console.log(
  `[profileReport] Wrote report to ${path.join(outputDir, "report.md")}`,
);
