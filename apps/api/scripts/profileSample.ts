import { fetch, type RequestInit } from "undici";
import { TextDecoder } from "util";

type RequestSpec = {
  name: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  count: number;
  pauseMs?: number;
  responseType?: "json" | "text" | "sse" | "arraybuffer";
};

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

const baseUrl = getArg("--base") || "http://localhost:3001";
const configPath = getArg("--config");

const defaultRequests: RequestSpec[] = [
  {
    name: "health",
    method: "GET",
    path: "/health",
    count: 50,
    responseType: "json",
  },
  {
    name: "health_db",
    method: "GET",
    path: "/api/health/db",
    count: 50,
    responseType: "json",
  },
  {
    name: "pericope_random",
    method: "GET",
    path: "/api/pericope/random",
    count: 50,
    responseType: "json",
  },
  {
    name: "verse_get",
    method: "GET",
    path: "/api/verse/John%203:16",
    count: 50,
    responseType: "json",
  },
  {
    name: "verse_cross_refs",
    method: "GET",
    path: "/api/verse/John%203:16/cross-references",
    count: 50,
    responseType: "json",
  },
  {
    name: "synopsis",
    method: "POST",
    path: "/api/synopsis",
    body: {
      text: "In the beginning God created the heaven and the earth.",
      maxWords: 34,
    },
    count: 50,
    responseType: "json",
  },
  {
    name: "semantic_connection",
    method: "POST",
    path: "/api/semantic-connection/synopsis",
    body: {
      verseIds: [88334, 88330],
      connectionType: "GOLD",
      similarity: 0.92,
    },
    count: 50,
    responseType: "json",
  },
  {
    name: "discover_connections",
    method: "POST",
    path: "/api/discover-connections",
    body: {
      verseIds: [88334, 88330, 90602],
    },
    count: 50,
    responseType: "json",
  },
  {
    name: "chat",
    method: "POST",
    path: "/api/chat",
    body: {
      message: "Explain John 3:16 in brief.",
      format: "text",
      history: [],
    },
    count: 50,
    responseType: "json",
  },
  {
    name: "chat_stream",
    method: "POST",
    path: "/api/chat/stream",
    headers: { Accept: "text/event-stream" },
    body: {
      message: "Explain John 3:16 in brief.",
      promptMode: "go_deeper_short",
    },
    count: 50,
    responseType: "sse",
  },
];

const loadConfig = async (): Promise<RequestSpec[]> => {
  if (!configPath) return defaultRequests;
  const fs = await import("fs");
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as RequestSpec[];
  return parsed;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runRequest = async (spec: RequestSpec) => {
  const url = `${baseUrl}${spec.path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(spec.headers || {}),
  };

  const init: RequestInit = {
    method: spec.method,
    headers,
  };

  if (spec.body && spec.method !== "GET") {
    init.body = JSON.stringify(spec.body);
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${spec.name} ${response.status}: ${text}`);
  }

  switch (spec.responseType) {
    case "arraybuffer":
      await response.arrayBuffer();
      break;
    case "sse": {
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes("event: done") || chunk.includes("event: error")) {
          done = true;
        }
      }
      break;
    }
    case "text":
      await response.text();
      break;
    case "json":
    default:
      await response.json();
  }
};

const run = async () => {
  const specs = await loadConfig();
  for (const spec of specs) {
    console.log(`[profileSample] Running ${spec.name} (${spec.count}x)`);
    for (let i = 0; i < spec.count; i++) {
      try {
        await runRequest(spec);
      } catch (error) {
        console.error(
          `[profileSample] ${spec.name} failed on run ${i + 1}:`,
          error,
        );
      }
      if (spec.pauseMs) {
        await sleep(spec.pauseMs);
      }
    }
  }
};

run().catch((error) => {
  console.error("[profileSample] Fatal:", error);
  process.exit(1);
});
