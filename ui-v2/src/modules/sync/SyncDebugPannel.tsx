import { useState, useEffect } from "react";
import { syncService } from "@/modules/sync/sync-service";
import { useWorkflowStore } from "../workflow/stores/workflow.store.sync";
import { Button } from "@/components/ui/button";

export function SyncDebugPanel() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const createWorkflow = useWorkflowStore((state) => state.createWorkflow);

  useEffect(() => {
    const interval = setInterval(() => {
      setDebugInfo((syncService as any).getDebugInfo());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleManualQueue = () => {
    console.log("=== MANUAL QUEUE TEST ===");
    syncService.queueChange({
      entity_type: "workflow",
      entity_id: "manual-test-" + Date.now(),
      change_type: "insert",
      data: {
        id: "manual-test-" + Date.now(),
        name: "Manual Test",
        nodes_config: [],
        edges_config: [],
        metadata: {},
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_id: "test",
        is_deleted: false,
      },
    });
  };

  const handleManualFlush = async () => {
    console.log("=== MANUAL FLUSH TEST ===");
    const result = await syncService.flush();
    console.log("Flush result:", result);
  };

  const handleCreateWorkflow = () => {
    console.log("=== CREATE WORKFLOW TEST ===");
    const id = createWorkflow("Test Workflow " + Date.now());
    console.log("Created workflow:", id);
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white border rounded-lg shadow-lg p-4 w-96 max-h-96 overflow-auto">
      <h3 className="font-bold mb-2">Sync Debug Panel</h3>

      <div className="space-y-2 text-xs mb-4">
        <div>Running: {debugInfo?.isRunning ? "✅" : "❌"}</div>
        <div>Enabled: {debugInfo?.enabled ? "✅" : "❌"}</div>
        <div>Queue Size: {debugInfo?.queueSize}</div>
        <div>Flush Count: {debugInfo?.flushCount}</div>
        <div>Interval: {debugInfo?.syncInterval}ms</div>
        <div>Base URL: {debugInfo?.baseUrl}</div>
      </div>

      <div className="space-y-2">
        <Button onClick={handleManualQueue} size="sm" className="w-full">
          Manual Queue
        </Button>
        <Button onClick={handleManualFlush} size="sm" className="w-full">
          Manual Flush
        </Button>
        <Button onClick={handleCreateWorkflow} size="sm" className="w-full">
          Create Workflow (via Store)
        </Button>
      </div>

      {debugInfo?.queue && debugInfo.queue.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold text-xs mb-1">Queue:</h4>
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(debugInfo.queue, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
