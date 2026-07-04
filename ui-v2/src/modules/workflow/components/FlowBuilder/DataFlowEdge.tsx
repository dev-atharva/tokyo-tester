"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";
import { relationLabel } from "../../lib/edge-model";
import type { EdgeData } from "../../types/react-flow-cots";

export function DataFlowEdge(props: EdgeProps) {
  const data = props.data as EdgeData | undefined;
  const fallback = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 10,
    offset: 28,
  });
  const route = data?.layoutPoints;
  const path = route?.length
    ? route
        .map(
          (point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
        )
        .join(" ")
    : fallback[0];
  const labelPoint = route?.[Math.floor(route.length / 2)];
  const labelX = labelPoint?.x ?? fallback[1];
  const labelY = labelPoint?.y ?? fallback[2];

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={20}
      />
      {data?.showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute flex items-center gap-1 rounded-full border bg-background/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data?.needsReview ? (
              <IconAlertTriangle className="size-3 text-amber-500" />
            ) : null}
            {relationLabel(data)}
            {data.protocol ? ` · ${data.protocol}` : ""}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
