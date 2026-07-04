import v8 from "node:v8";

// BSON 7 probes Node's startup snapshot state while initializing ObjectId.
// Bun exposes the API but throws ERR_NOT_IMPLEMENTED when it is called.
// A normal Bun process is not building a Node startup snapshot, so false is
// the equivalent answer until Bun implements the probe.
const isBuildingSnapshot = v8.startupSnapshot?.isBuildingSnapshot;
if (typeof isBuildingSnapshot === "function") {
  try {
    isBuildingSnapshot();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as Error & { code?: string }).code === "ERR_NOT_IMPLEMENTED"
    ) {
      v8.startupSnapshot.isBuildingSnapshot = () => false;
    } else {
      throw error;
    }
  }
}
