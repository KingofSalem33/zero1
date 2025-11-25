import React, { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { useUserPreferences } from "../hooks/useUserPreferences";

interface MarkdownMessageProps {
  content: string;
  isStreaming?: boolean;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  showActions?: boolean;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({
  content,
  isStreaming = false,
  onCopy,
  onRegenerate: _onRegenerate,
  onEdit: _onEdit,
  showActions = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { preferences } = useUserPreferences();

  // Suppress no-undef for browser APIs
  /* global Audio, URL, alert, HTMLAudioElement */

  const handleCopy = async () => {
    if (onCopy) {
      onCopy();
    }
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVoicePlayback = async () => {
    // Stop if already playing
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    // Start loading
    setIsLoading(true);

    try {
      // OpenAI TTS has a 4096 character limit, so truncate if needed
      const maxLength = 4000; // Leave some buffer for safety
      const textToSpeak =
        content.length > maxLength
          ? content.substring(0, maxLength) + "..."
          : content;

      // Call OpenAI TTS API via our backend
      const response = await fetch("http://localhost:3001/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: textToSpeak,
          voice: preferences.voice, // Use user's selected voice (onyx or nova)
          model: "tts-1", // Standard model (cost-effective)
          speed: 1.0, // Normal speed
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate speech");
      }

      // Get audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create or update audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      audioRef.current.src = audioUrl;
      audioRef.current.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl); // Cleanup
      };
      audioRef.current.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
        // eslint-disable-next-line no-console
        console.error("Audio playback error");
      };

      // Play audio
      await audioRef.current.play();
      setIsPlaying(true);
      setIsLoading(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("TTS error:", error);
       
      alert("Failed to generate speech. Please try again.");
      setIsLoading(false);
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  return (
    <div className="group relative">
      {/* Markdown content */}
      <div className="prose prose-invert prose-neutral max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
          components={{
            // Code blocks with syntax highlighting and Mermaid support
            code({ inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const language = match ? match[1] : "";

              // Mermaid diagrams removed for clean slate
              if (!inline && language === "mermaid") {
                return (
                  <div className="bg-neutral-800 p-4 rounded">
                    <code>{children}</code>
                  </div>
                );
              }

              return !inline ? (
                <div className="relative group/code my-4">
                  {match && (
                    <div className="absolute right-3 top-3 text-xs text-neutral-400 font-mono">
                      {language}
                    </div>
                  )}
                  <pre className="!bg-neutral-900/80 !p-4 !rounded-xl overflow-x-auto border border-neutral-800/50">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              ) : (
                <code
                  className="!bg-neutral-800/60 !text-brand-primary-300 !px-1.5 !py-0.5 !rounded"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            // Tables with better styling
            table({ children }) {
              return (
                <div className="overflow-x-auto my-5">
                  <table className="min-w-full divide-y divide-neutral-700 border border-neutral-700/50 rounded-xl">
                    {children}
                  </table>
                </div>
              );
            },
            thead({ children }) {
              return <thead className="bg-neutral-800/50">{children}</thead>;
            },
            th({ children }) {
              return (
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="px-4 py-3 text-sm text-neutral-200 border-t border-neutral-700/50">
                  {children}
                </td>
              );
            },
            // Links with better styling
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-primary-400 hover:text-brand-primary-300 underline decoration-brand-primary-400/30 hover:decoration-brand-primary-300 transition-colors"
                >
                  {children}
                </a>
              );
            },
            // Blockquotes
            blockquote({ children }) {
              return (
                <blockquote className="border-l-4 border-brand-primary-500/50 pl-4 italic text-neutral-300 my-5 bg-neutral-800/30 py-3 rounded-r-lg">
                  {children}
                </blockquote>
              );
            },
            // Lists
            ul({ children }) {
              return (
                <ul className="list-disc list-inside space-y-2 text-neutral-200 my-3 ml-1">
                  {children}
                </ul>
              );
            },
            ol({ children }) {
              return (
                <ol className="list-decimal list-inside space-y-2 text-neutral-200 my-3 ml-1">
                  {children}
                </ol>
              );
            },
            // Headings
            h1({ children }) {
              return (
                <h1 className="text-2xl font-bold text-white mt-8 mb-4 first:mt-0">
                  {children}
                </h1>
              );
            },
            h2({ children }) {
              return (
                <h2 className="text-xl font-bold text-white mt-6 mb-3 first:mt-0">
                  {children}
                </h2>
              );
            },
            h3({ children }) {
              return (
                <h3 className="text-lg font-semibold text-white mt-5 mb-2.5 first:mt-0">
                  {children}
                </h3>
              );
            },
            // Paragraphs
            p({ children }) {
              return (
                <p className="text-neutral-200 leading-relaxed my-3 first:mt-0 last:mb-0">
                  {children}
                </p>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>

        {/* Streaming cursor */}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse" />
        )}
      </div>

      {/* Action buttons - always visible */}
      {showActions && !isStreaming && (
        <div className="flex items-center gap-2 mt-3">
          {/* Voice playback button */}
          <button
            onClick={handleVoicePlayback}
            disabled={isLoading}
            className="p-1 rounded-md hover:bg-neutral-800/60 text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              isLoading
                ? "Generating speech..."
                : isPlaying
                  ? "Stop playback"
                  : `Read aloud (${preferences.voice} voice)`
            }
          >
            {isLoading ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : isPlaying ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 10h6v4H9z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            )}
          </button>

          {/* Copy button */}
          {onCopy && (
            <button
              onClick={handleCopy}
              className="p-1 rounded-md hover:bg-neutral-800/60 text-neutral-500 hover:text-neutral-300 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
