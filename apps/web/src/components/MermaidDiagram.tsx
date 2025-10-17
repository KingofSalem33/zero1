import React, { useEffect, useRef } from "react";

interface MermaidDiagramProps {
  chart: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        // Dynamically import mermaid from CDN
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(window as any).mermaid) {
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
          script.type = "module";

          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });

          // Initialize mermaid
          await import(
            "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"
          ).then((m) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).mermaid = m.default;
            m.default.initialize({
              startOnLoad: false,
              theme: "dark",
              themeVariables: {
                primaryColor: "#3b82f6",
                primaryTextColor: "#fff",
                primaryBorderColor: "#1e40af",
                lineColor: "#6b7280",
                secondaryColor: "#4b5563",
                tertiaryColor: "#374151",
                background: "#1f2937",
                mainBkg: "#1f2937",
                secondBkg: "#111827",
                textColor: "#e5e7eb",
                fontSize: "14px",
              },
            });
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mermaid = (window as any).mermaid;

        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // Render the diagram
        const { svg } = await mermaid.render(id, chart);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Mermaid rendering error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to render diagram",
        );
      }
    };

    renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 my-4">
        <p className="text-red-400 text-sm font-mono">
          Failed to render diagram: {error}
        </p>
        <details className="mt-2">
          <summary className="text-xs text-red-300 cursor-pointer">
            Show diagram code
          </summary>
          <pre className="text-xs text-gray-400 mt-2 overflow-x-auto">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram bg-gray-900/50 border border-gray-700 rounded-lg p-4 my-4 overflow-x-auto"
    />
  );
};
