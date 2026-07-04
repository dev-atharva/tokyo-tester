"use client";

import { ViewportPortal } from "@xyflow/react";
import { architectureBounds, ROLE_META } from "../../lib/architecture-view";
import type { FlowNode } from "../../types/react-flow-cots";

const roleStyles = {
  application: "border-sky-500/15 bg-sky-500/[0.025]",
  data: "border-emerald-500/15 bg-emerald-500/[0.025]",
  messaging: "border-amber-500/15 bg-amber-500/[0.025]",
};

export function ArchitectureBackdrop({ nodes }: { nodes: FlowNode[] }) {
  return (
    <ViewportPortal>
      {architectureBounds(nodes).map((region) => (
        <div
          key={region.role}
          className={`pointer-events-none absolute -z-10 rounded-3xl border ${roleStyles[region.role]}`}
          style={{
            left: region.left,
            top: region.top,
            width: region.width,
            height: region.height,
          }}
        >
          <div className="absolute left-5 top-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {ROLE_META[region.role].label}
            </p>
            <p className="mt-0.5 text-[9px] text-muted-foreground/45">
              {ROLE_META[region.role].description}
            </p>
          </div>
        </div>
      ))}
    </ViewportPortal>
  );
}
