import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { MermaidDiagram } from "./MermaidDiagram";

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
      <div className="prose prose-invert prose-neutral max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
          components={{
            // Code blocks with syntax highlighting and Mermaid support
            code({ inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const language = match ? match[1] : "";

              // Handle Mermaid diagrams
              if (!inline && language === "mermaid") {
                const code = String(children).replace(/\n$/, "");
                return <MermaidDiagram chart={code} />;
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

      {/* Action buttons */}
      {showActions && !isStreaming && (
        <div className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {onCopy && (
            <button
              onClick={handleCopy}
              className="btn-icon-secondary text-xs w-7 h-7"
              title="Copy message"
            >
              {copied ? "✓" : "📋"}
            </button>
          )}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="btn-icon-secondary text-xs w-7 h-7"
              title="Regenerate"
            >
              🔄
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              className="btn-icon-secondary text-xs w-7 h-7"
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
