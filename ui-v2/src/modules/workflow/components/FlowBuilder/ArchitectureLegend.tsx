"use client";

const items = [
  { label: "Calls", className: "bg-sky-500" },
  { label: "Reads", className: "border-t-2 border-dashed border-emerald-500" },
  { label: "Writes", className: "bg-emerald-500" },
  { label: "Publishes", className: "bg-amber-500" },
  { label: "Consumes", className: "border-t-2 border-dashed border-amber-500" },
];

export function ArchitectureLegend() {
  return (
    <div className="flex max-w-[calc(100vw-2rem)] items-center gap-3 overflow-x-auto rounded-lg border bg-background/90 px-3 py-2 shadow-sm backdrop-blur-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Data flow
      </span>
      {items.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
        >
          <span className={`h-0.5 w-5 ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
