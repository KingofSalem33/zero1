import React, { useState } from "react";
import { useChatStream } from "../hooks/useChatStream";
import { StreamingToolIndicators } from "./StreamingToolIndicators";

export const StreamingChatDemo: React.FC = () => {
  const [input, setInput] = useState("");
  const { streamingMessage, isStreaming, error, startStream, cancelStream } =
    useChatStream();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    await startStream(input, "demo-user");
    setInput("");
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl border border-gray-700 p-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-4">
          🚀 Streaming Chat Demo
        </h2>

        {/* Message display */}
        {streamingMessage && (
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4 min-h-[100px]">
            {/* Tool indicators */}
            <StreamingToolIndicators
              activeTools={streamingMessage.activeTools}
              completedTools={streamingMessage.completedTools}
              erroredTools={streamingMessage.erroredTools}
            />

            {/* Content */}
            <div className="text-gray-200 whitespace-pre-wrap">
              {streamingMessage.content}
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse" />
              )}
            </div>

            {/* Citations */}
            {streamingMessage.citations &&
              streamingMessage.citations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-sm text-gray-400 mb-2">Sources:</p>
                  <ul className="text-xs text-blue-400 space-y-1">
                    {streamingMessage.citations.map((citation, idx) => (
                      <li key={idx}>
                        <a
                          href={citation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {citation}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Status */}
            {streamingMessage.isComplete && (
              <div className="mt-2 text-xs text-green-400">✓ Complete</div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4 text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Try: 'Search the web for the latest AI news' or 'Calculate 123 * 456'"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            disabled={isStreaming}
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isStreaming ? "Streaming..." : "Send Message"}
            </button>

            {isStreaming && (
              <button
                type="button"
                onClick={cancelStream}
                className="px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Example queries */}
        <div className="mt-4 text-xs text-gray-400">
          <p className="mb-2">Example queries that trigger tools:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Search the web for the latest AI news</li>
            <li>Calculate the square root of 12345</li>
            <li>What's 15% of 2500?</li>
            <li>Search for information about quantum computing</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
