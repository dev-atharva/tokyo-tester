import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      className="mx-auto grid max-w-[1680px] gap-4 p-6"
      aria-label="Loading workflow run"
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-80 max-w-[70vw]" />
        </div>
        <Skeleton className="h-8 w-64 max-w-[25vw]" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Skeleton className="h-[560px] w-full" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    </main>
  );
}
