import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

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
  onRegenerate,
  onEdit,
  showActions = true,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (onCopy) {
      onCopy();
    }
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      {/* Markdown content */}
      <div className="prose prose-invert prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
          components={{
            // Code blocks with syntax highlighting
            code({ inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              return !inline ? (
                <div className="relative group/code">
                  {match && (
                    <div className="absolute right-2 top-2 text-xs text-gray-400 font-mono">
                      {match[1]}
                    </div>
                  )}
                  <pre className="!bg-gray-900 !p-4 !rounded-lg overflow-x-auto">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              ) : (
                <code
                  className="!bg-gray-800 !text-blue-300 !px-1.5 !py-0.5 !rounded"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            // Tables with better styling
            table({ children }) {
              return (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full divide-y divide-gray-700 border border-gray-700 rounded-lg">
                    {children}
                  </table>
                </div>
              );
            },
            thead({ children }) {
              return <thead className="bg-gray-800/50">{children}</thead>;
            },
            th({ children }) {
              return (
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="px-4 py-2 text-sm text-gray-200 border-t border-gray-700">
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
                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                >
                  {children}
                </a>
              );
            },
            // Blockquotes
            blockquote({ children }) {
              return (
                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-300 my-4">
                  {children}
                </blockquote>
              );
            },
            // Lists
            ul({ children }) {
              return (
                <ul className="list-disc list-inside space-y-1 text-gray-200 my-2">
                  {children}
                </ul>
              );
            },
            ol({ children }) {
              return (
                <ol className="list-decimal list-inside space-y-1 text-gray-200 my-2">
                  {children}
                </ol>
              );
            },
            // Headings
            h1({ children }) {
              return (
                <h1 className="text-2xl font-bold text-white mt-6 mb-3">
                  {children}
                </h1>
              );
            },
            h2({ children }) {
              return (
                <h2 className="text-xl font-bold text-white mt-5 mb-2">
                  {children}
                </h2>
              );
            },
            h3({ children }) {
              return (
                <h3 className="text-lg font-semibold text-white mt-4 mb-2">
                  {children}
                </h3>
              );
            },
            // Paragraphs
            p({ children }) {
              return (
                <p className="text-gray-200 leading-relaxed my-2">{children}</p>
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

      {/* Action buttons */}
      {showActions && !isStreaming && (
        <div className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {onCopy && (
            <button
              onClick={handleCopy}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors text-xs"
              title="Copy message"
            >
              {copied ? "✓" : "📋"}
            </button>
          )}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors text-xs"
              title="Regenerate"
            >
              🔄
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-white transition-colors text-xs"
              title="Edit message"
            >
              ✏️
            </button>
          )}
        </div>
      )}
    </div>
  );
};
