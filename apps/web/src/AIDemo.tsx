import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function AIDemo() {
  const [prompt, setPrompt] = useState("Say hello in 10 words.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function run() {
    setLoading(true);
    setResult("");
    try {
      const res = await fetch(`${API_URL}/api/ai/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setResult(
        data?.ok ? data.text || "" : `Error: ${data?.error || "Unknown"}`,
      );
    } catch {
      setResult("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3 p-4">
      <h2 className="text-xl font-semibold">AI Demo</h2>
      <textarea
        className="w-full border rounded p-2"
        rows={5}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {loading ? "Thinking…" : "Ask AI"}
      </button>
      {result && (
        <pre className="whitespace-pre-wrap border rounded p-3 bg-gray-50">
          {result}
        </pre>
      )}
    </div>
  );
}
