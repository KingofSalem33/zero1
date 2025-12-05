import React, { useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";
import { VerseNode } from "./VerseNode";
import type { VisualContextBundle } from "../../types/goldenThread";

const nodeTypes = {
  verseNode: VerseNode,
};

interface NarrativeMapProps {
  bundle: VisualContextBundle | null;
  highlightedRefs: string[]; // ["John 3:16", "Romans 5:8"]
}

export const NarrativeMap: React.FC<NarrativeMapProps> = ({
  bundle,
  highlightedRefs,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [expandedNodes, setExpandedNodes] = React.useState<Set<number>>(
    new Set(),
  );

  // Handler for expanding collapsed branches
  const handleExpandNode = React.useCallback((nodeId: number) => {
    console.log(`[NarrativeMap] Expanding node ${nodeId}`);
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  }, []);

  // Layout algorithm using dagre
  const getLayoutedElements = (
    bundle: VisualContextBundle,
    expandedIds: Set<number>,
    onExpand: (nodeId: number) => void,
  ) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    // Compact layout: tight spacing for at-a-glance tree view
    dagreGraph.setGraph({
      rankdir: "TB", // Top to Bottom
      ranksep: 40, // Vertical spacing between levels (was 80, now tighter)
      nodesep: 30, // Horizontal spacing between nodes (was 50, now tighter)
      marginx: 20,
      marginy: 20,
    });

    // Filter to visible nodes: (1) spine by default OR (2) child of an expanded node
    const visibleNodes = bundle.nodes.filter((node) => {
      // Always show spine nodes
      if (node.isVisible) return true;

      // Show if parent is expanded
      if (node.parentId && expandedIds.has(node.parentId)) return true;

      return false;
    });
    console.log(
      `[NarrativeMap] Rendering ${visibleNodes.length} visible nodes out of ${bundle.nodes.length} total`,
    );

    // Create nodes (only visible ones)
    const reactFlowNodes: Node[] = visibleNodes.map((verse) => {
      const nodeId = verse.id.toString();
      const isAnchor = verse.id === bundle.rootId;
      const isHighlighted = highlightedRefs.some((ref) => {
        const refLower = ref.toLowerCase();
        return (
          refLower.includes(
            `${verse.book_name.toLowerCase()} ${verse.chapter}:${verse.verse}`,
          ) ||
          refLower.includes(
            `${verse.book_abbrev.toLowerCase()} ${verse.chapter}:${verse.verse}`,
          )
        );
      });

      // Compact node size for at-a-glance view
      dagreGraph.setNode(nodeId, { width: 120, height: 50 });

      // Recalculate collapsed count based on what's already expanded
      const allChildren = bundle.nodes.filter((n) => n.parentId === verse.id);
      const visibleChildren = allChildren.filter(
        (child) =>
          child.isVisible ||
          (child.parentId && expandedIds.has(child.parentId)),
      );
      const actualCollapsedCount = allChildren.length - visibleChildren.length;

      return {
        id: nodeId,
        type: "verseNode",
        data: {
          verse,
          isHighlighted,
          isAnchor,
          collapsedChildCount: actualCollapsedCount,
          onExpand: () => onExpand(verse.id),
        },
        position: { x: 0, y: 0 }, // Will be set by dagre
      };
    });

    // Create edges (only between visible nodes)
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const reactFlowEdges: Edge[] = bundle.edges
      .filter(
        (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to),
      )
      .map((edge) => {
        const fromId = edge.from.toString();
        const toId = edge.to.toString();

        dagreGraph.setEdge(fromId, toId);

        const isHighlighted = highlightedRefs.some(() => {
          const fromVerse = visibleNodes.find((v) => v.id === edge.from);
          const toVerse = visibleNodes.find((v) => v.id === edge.to);
          if (!fromVerse || !toVerse) return false;

          const fromMatch = highlightedRefs.some((ref) => {
            const refLower = ref.toLowerCase();
            return (
              refLower.includes(
                `${fromVerse.book_name.toLowerCase()} ${fromVerse.chapter}:${fromVerse.verse}`,
              ) ||
              refLower.includes(
                `${fromVerse.book_abbrev.toLowerCase()} ${fromVerse.chapter}:${fromVerse.verse}`,
              )
            );
          });
          const toMatch = highlightedRefs.some((ref) => {
            const refLower = ref.toLowerCase();
            return (
              refLower.includes(
                `${toVerse.book_name.toLowerCase()} ${toVerse.chapter}:${toVerse.verse}`,
              ) ||
              refLower.includes(
                `${toVerse.book_abbrev.toLowerCase()} ${toVerse.chapter}:${toVerse.verse}`,
              )
            );
          });

          return fromMatch && toMatch;
        });

        return {
          id: `e${fromId}-${toId}`,
          source: fromId,
          target: toId,
          type: isHighlighted ? "default" : "step",
          animated: isHighlighted,
          style: {
            stroke: isHighlighted ? "#DAA520" : "#CCC",
            strokeWidth: isHighlighted ? 3 : 1,
            strokeDasharray: isHighlighted ? "0" : "5 5",
          },
        };
      });

    // Run layout
    dagre.layout(dagreGraph);

    // Apply positions (center nodes based on new compact size: 120x50)
    reactFlowNodes.forEach((node) => {
      const dagreNode = dagreGraph.node(node.id);
      node.position = {
        x: dagreNode.x - 60, // width / 2 = 120 / 2 = 60
        y: dagreNode.y - 25, // height / 2 = 50 / 2 = 25
      };
    });

    return { nodes: reactFlowNodes, edges: reactFlowEdges };
  };

  // Update layout when bundle, highlights, or expanded nodes change
  useEffect(() => {
    console.log("[NarrativeMap] useEffect triggered, bundle:", bundle);
    if (!bundle) {
      console.log("[NarrativeMap] No bundle, returning");
      return;
    }

    console.log(
      "[NarrativeMap] Processing bundle with",
      bundle.nodes?.length,
      "nodes",
    );
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      bundle,
      expandedNodes,
      handleExpandNode,
    );
    console.log(
      "[NarrativeMap] Layout complete, setting",
      layoutedNodes.length,
      "nodes and",
      layoutedEdges.length,
      "edges",
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [bundle, highlightedRefs, expandedNodes, handleExpandNode]);

  if (!bundle) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">📖</div>
          <div className="text-lg font-semibold">
            Golden Thread Visualization
          </div>
          <div className="text-sm mt-2">
            Ask a biblical question to see the map
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.15, // Smaller padding for more compact view
          minZoom: 0.2,
          maxZoom: 1.2,
        }}
        minZoom={0.2}
        maxZoom={2.0}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background color="#f0f0f0" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.data.isAnchor) return "#FFD700";
            if (node.data.isHighlighted) return "#FFF8DC";
            return "#F0F0F0";
          }}
        />
      </ReactFlow>
    </div>
  );
};
