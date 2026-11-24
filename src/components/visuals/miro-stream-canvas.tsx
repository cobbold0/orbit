"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Move,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { CompleteTaskButton } from "@/components/modals/complete-task-button";
import { startTaskAction } from "@/app/actions/orbit-actions";

export type StreamNodeType = "AREA" | "PROJECT" | "MILESTONE" | "TASK" | "ROUTINE";

export interface StreamNodeData {
  id: string;
  type: StreamNodeType;
  title: string;
  subtitle?: string;
  colorToken: string;
  status?: string;
  progressPercent?: number;
  timeLabel?: string;
  waitingOnPerson?: string | null;
  lifeAreaName?: string;
  lifeAreaSlug?: string;
  parentId?: string | null;
  x: number;
  y: number;
}

export interface StreamEdgeData {
  id: string;
  sourceId: string;
  targetId: string;
  colorToken?: string;
}

interface MiroStreamCanvasProps {
  initialNodes: StreamNodeData[];
  initialEdges: StreamEdgeData[];
  lifeAreas: { id: string; name: string; slug: string; colorToken: string }[];
}

export function MiroStreamCanvas({
  initialNodes,
  initialEdges,
  lifeAreas,
}: MiroStreamCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Canvas Viewport State (Pan and Zoom)
  const [pan, setPan] = useState({ x: 80, y: 60 });
  const [zoom, setZoom] = useState(1);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>("ALL");

  // Draggable Node State
  const [nodes, setNodes] = useState<StreamNodeData[]>(initialNodes);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Canvas Panning State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Active / Selected Node Modal or Focus
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Sync initial nodes if server data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  // Zoom handlers
  const handleZoom = useCallback((delta: number, clientX?: number, clientY?: number) => {
    setZoom((prevZoom) => {
      const newZoom = Math.min(Math.max(prevZoom + delta, 0.35), 2.2);
      if (clientX !== undefined && clientY !== undefined && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const cursorX = clientX - rect.left;
        const cursorY = clientY - rect.top;
        const scale = newZoom / prevZoom;
        setPan((prevPan) => ({
          x: cursorX - (cursorX - prevPan.x) * scale,
          y: cursorY - (cursorY - prevPan.y) * scale,
        }));
      }
      return newZoom;
    });
  }, []);

  const resetView = useCallback(() => {
    setPan({ x: 100, y: 80 });
    setZoom(1);
    setSelectedAreaFilter("ALL");
    setFocusedNodeId(null);
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.005;
        handleZoom(delta, e.clientX, e.clientY);
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    },
    [handleZoom]
  );

  // Start Canvas Pan
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left-click
    if ((e.target as HTMLElement).closest(".miro-card")) return; // Don't pan if clicking card

    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Node Drag Start
  const handleNodeMouseDown = (e: React.MouseEvent, node: StreamNodeData) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) {
      return;
    }

    setDraggingNodeId(node.id);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - node.x,
      y: (e.clientY - pan.y) / zoom - node.y,
    });
  };

  // Global Mouse Move for Canvas Pan or Node Drag
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingNodeId) {
        const newX = (e.clientX - pan.x) / zoom - dragOffset.x;
        const newY = (e.clientY - pan.y) / zoom - dragOffset.y;
        setNodes((prev) =>
          prev.map((n) => (n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n))
        );
      } else if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [draggingNodeId, isPanning, pan.x, pan.y, panStart.x, panStart.y, dragOffset.x, dragOffset.y, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingNodeId(null);
  }, []);

  // Filter nodes based on selected area stream
  const visibleNodes = useMemo(() => {
    if (selectedAreaFilter === "ALL") return nodes;
    return nodes.filter(
      (n) =>
        n.lifeAreaSlug === selectedAreaFilter ||
        n.lifeAreaName?.toLowerCase() === selectedAreaFilter.toLowerCase()
    );
  }, [nodes, selectedAreaFilter]);

  const visibleNodeMap = useMemo(() => {
    return new Map(visibleNodes.map((n) => [n.id, n]));
  }, [visibleNodes]);

  // Connector lines between nodes
  const visibleEdges = useMemo(() => {
    return initialEdges.filter(
      (edge) => visibleNodeMap.has(edge.sourceId) && visibleNodeMap.has(edge.targetId)
    );
  }, [initialEdges, visibleNodeMap]);

  return (
    <div className="relative w-full h-full min-h-[680px] rounded-2xl border border-base-300/80 bg-white overflow-hidden shadow-xs select-none">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Stream Filter Pills */}
        <div className="flex items-center gap-1.5 p-1.5 bg-white/95 backdrop-blur-md rounded-2xl border border-base-300/80 shadow-sm pointer-events-auto overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setSelectedAreaFilter("ALL")}
            className={`btn btn-xs rounded-xl font-medium transition-all ${
              selectedAreaFilter === "ALL" ? "btn-neutral shadow-xs" : "btn-ghost text-base-content/70"
            }`}
          >
            All Streams
          </button>
          {lifeAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setSelectedAreaFilter(area.slug)}
              className={`btn btn-xs rounded-xl font-medium transition-all gap-1.5 ${
                selectedAreaFilter === area.slug
                  ? "btn-neutral shadow-xs"
                  : "btn-ghost text-base-content/70"
              }`}
            >
              <span className={`h-2 w-2 rounded-full bg-${area.colorToken}-500`} />
              <span>{area.name}</span>
            </button>
          ))}
        </div>

        {/* Viewport Zoom & Reset Controls */}
        <div className="flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-2xl border border-base-300/80 shadow-sm pointer-events-auto">
          <button
            type="button"
            onClick={() => handleZoom(0.15)}
            className="btn btn-ghost btn-xs btn-square text-base-content/80"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold tabular px-1 text-base-content/70">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => handleZoom(-0.15)}
            className="btn btn-ghost btn-xs btn-square text-base-content/80"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <div className="h-3 w-px bg-base-300 mx-0.5" />
          <button
            type="button"
            onClick={resetView}
            className="btn btn-ghost btn-xs rounded-lg gap-1 text-base-content/70"
            title="Reset View"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-xs">Reset</span>
          </button>
        </div>
      </div>

      {/* Miro Helper Legend at Bottom Left */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none hidden sm:flex items-center gap-3 p-2.5 bg-white/90 backdrop-blur-md rounded-xl border border-base-200 text-xs text-base-content/60 shadow-xs">
        <span className="flex items-center gap-1.5 font-medium text-base-content/80">
          <Move className="h-3.5 w-3.5" />
          Drag canvas to pan &bull; Drag cards to organize
        </span>
      </div>

      {/* Interactive Infinite Canvas Space */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden ${
          isPanning ? "cursor-grabbing" : ""
        }`}
        style={{
          backgroundColor: "#ffffff",
          backgroundImage:
            "radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Canvas World Transform Container */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Connection Lines Layer */}
          <svg
            className="absolute top-0 left-0 overflow-visible pointer-events-none"
            style={{ width: "8000px", height: "8000px" }}
          >
            <defs>
              <marker
                id="stream-arrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#94a3b8" />
              </marker>
            </defs>
            {visibleEdges.map((edge) => {
              const source = visibleNodeMap.get(edge.sourceId);
              const target = visibleNodeMap.get(edge.targetId);
              if (!source || !target) return null;

              // Compute center / attachment points
              const startX = source.x + 220;
              const startY = source.y + 45;
              const endX = target.x;
              const endY = target.y + 45;
              const dx = Math.max(Math.abs(endX - startX) * 0.5, 40);

              const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${
                endX - dx
              } ${endY}, ${endX} ${endY}`;

              return (
                <path
                  key={edge.id}
                  d={pathD}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="2.5"
                  strokeDasharray={target.type === "TASK" ? "4 4" : undefined}
                  markerEnd="url(#stream-arrow)"
                  className="transition-all duration-75"
                />
              );
            })}
          </svg>

          {/* Render Interactive Nodes */}
          {visibleNodes.map((node) => {
            const isDragging = draggingNodeId === node.id;
            const isFocused = focusedNodeId === node.id;

            let cardBg = "bg-white border-base-300/80";
            let typeBadge = "badge-neutral";
            let typeLabel = "Task";

            if (node.type === "AREA") {
              cardBg = "bg-base-50/70 border-base-300 ring-2 ring-base-content/10";
              typeBadge = "badge-primary";
              typeLabel = "Life Stream";
            } else if (node.type === "PROJECT") {
              cardBg = "bg-white border-base-300 ring-1 ring-base-300";
              typeBadge = "badge-info";
              typeLabel = "Project";
            } else if (node.type === "MILESTONE") {
              cardBg = "bg-amber-50/40 border-amber-200 ring-1 ring-amber-300/40";
              typeBadge = "badge-warning";
              typeLabel = "Milestone";
            } else if (node.type === "ROUTINE") {
              cardBg = "bg-emerald-50/40 border-emerald-200";
              typeBadge = "badge-success";
              typeLabel = "Routine";
            }

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={() => setFocusedNodeId(node.id)}
                className={`miro-card pointer-events-auto absolute w-[240px] rounded-2xl border p-3.5 shadow-sm transition-shadow duration-150 cursor-grab active:cursor-grabbing hover:shadow-md ${cardBg} ${
                  isDragging ? "shadow-xl ring-2 ring-primary scale-[1.02] z-40" : "z-10"
                } ${isFocused ? "ring-2 ring-primary" : ""}`}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  touchAction: "none",
                }}
              >
                {/* Header Type & Area Tag */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className={`badge badge-xs font-semibold uppercase tracking-wider ${typeBadge}`}>
                    {typeLabel}
                  </span>
                  {node.lifeAreaName && (
                    <span className="text-[11px] font-medium text-base-content/60 truncate">
                      {node.lifeAreaName}
                    </span>
                  )}
                </div>

                {/* Node Title */}
                <h3
                  className={`text-sm font-semibold text-base-content leading-snug tracking-tight mb-1 ${
                    node.status === "COMPLETED" ? "line-through opacity-50" : ""
                  }`}
                >
                  {node.title}
                </h3>

                {/* Subtitle / Description / Notes */}
                {node.subtitle && (
                  <p className="text-xs text-base-content/70 line-clamp-2 leading-relaxed mb-2">
                    {node.subtitle}
                  </p>
                )}

                {/* Metadata Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-base-content/60 mt-2">
                  {node.timeLabel && (
                    <span className="badge badge-xs badge-neutral gap-1 tabular font-medium">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{node.timeLabel}</span>
                    </span>
                  )}
                  {node.waitingOnPerson && (
                    <span className="badge badge-xs badge-warning gap-1">
                      <span>Waiting: {node.waitingOnPerson}</span>
                    </span>
                  )}
                  {node.progressPercent !== undefined && (
                    <div className="w-full mt-1">
                      <div className="flex justify-between text-[10px] text-base-content/50 mb-0.5">
                        <span>Progress</span>
                        <span>{node.progressPercent}%</span>
                      </div>
                      <progress
                        className="progress progress-primary w-full h-1.5"
                        value={node.progressPercent}
                        max="100"
                      />
                    </div>
                  )}
                </div>

                {/* Quick Interactive Actions for Tasks */}
                {node.type === "TASK" && node.status !== "COMPLETED" && (
                  <div className="mt-2.5 pt-2 border-t border-base-200/80 flex items-center justify-between gap-1">
                    <form action={startTaskAction}>
                      <input type="hidden" name="taskId" value={node.id} />
                      <button
                        type="submit"
                        className="btn btn-ghost btn-xs text-primary gap-1 px-1.5"
                        title="Focus on this task"
                      >
                        <Play className="h-3 w-3" />
                        <span>Focus</span>
                      </button>
                    </form>

                    <CompleteTaskButton
                      taskId={node.id}
                      taskTitle={node.title}
                      className="btn btn-ghost btn-xs text-success hover:bg-success/10 gap-1 px-1.5"
                      label="Done"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
