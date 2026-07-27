import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateId } from "@/lib/generate-id";
import { layoutArchitecture } from "../lib/architecture-view";
import {
  inferEdgeData,
  invalidateRoutesForMovedNodes,
  normalizeEdges,
} from "../lib/edge-model";
import { useWorkflowStore } from "../stores/workflow.store.sync";
import type { EdgeData, FlowEdge, FlowNode } from "../types/react-flow-cots";

export function useWorkflowGraph(workflowId: string) {
  const workflow = useWorkflowStore((s) => s.getWorkflow(workflowId));
  const updateWorkflowGraph = useWorkflowStore((s) => s.updateWorkflowGraph);

  const [nodes, setNodes] = useNodesState<FlowNode>([]);
  const [edges, setEdges] = useEdgesState<FlowEdge>([]);
  const nodesRef = useRef<FlowNode[]>([]);
  const edgesRef = useRef(workflow?.edges ?? []);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Load nodes and edges from workflow when workflow changes
  useEffect(() => {
    if (workflow) {
      setNodes(workflow.nodes);
      setEdges(normalizeEdges(workflow.edges));
    }
  }, [workflow?.id, setEdges, setNodes, workflow]);

  // Delete node
  const deleteNode = useCallback(
    (nodeId: string) => {
      const newNodes = nodesRef.current.filter((n) => n.id !== nodeId);
      const newEdges = edgesRef.current.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      );

      setNodes(newNodes);
      setEdges(newEdges);

      if (workflow) {
        updateWorkflowGraph(workflow.id, newNodes, newEdges);
      }
    },
    [workflow, updateWorkflowGraph, setNodes, setEdges],
  );

  // Update node
  const updateNode = useCallback(
    (updatedNode: FlowNode) => {
      const newNodes = nodesRef.current.map((n) =>
        n.id === updatedNode.id ? updatedNode : n,
      );

      setNodes(newNodes);

      if (workflow) {
        updateWorkflowGraph(workflow.id, newNodes, edgesRef.current);
      }
    },
    [workflow, updateWorkflowGraph, setNodes],
  );

  // Add node
  const addNode = useCallback(
    (node: FlowNode) => {
      const newNodes = [...nodesRef.current, node];

      setNodes(newNodes);

      if (workflow) {
        updateWorkflowGraph(workflow.id, newNodes, edgesRef.current);
      }
    },
    [workflow, updateWorkflowGraph, setNodes],
  );

  // Connect nodes
  const connectNodes = useCallback(
    (connection: Connection) => {
      const source = nodesRef.current.find(
        (node) => node.id === connection.source,
      );
      const target = nodesRef.current.find(
        (node) => node.id === connection.target,
      );
      if (!source || !target) return;
      const newEdge: FlowEdge = {
        ...connection,
        id: `edge-${Date.now()}`,
        type: "dataFlow",
        data: inferEdgeData(source, target),
      };
      const newEdges = addEdge<FlowEdge>(newEdge, edgesRef.current);

      setEdges(newEdges);

      if (workflow) {
        updateWorkflowGraph(workflow.id, nodesRef.current, newEdges);
      }
      setEditingEdgeId(newEdge.id);
    },
    [workflow, updateWorkflowGraph, setEdges],
  );

  const updateEdge = useCallback(
    (edgeId: string, data: EdgeData) => {
      const newEdges = edgesRef.current.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              type: "dataFlow",
              data: { ...data, needsReview: undefined },
            }
          : edge,
      );
      setEdges(newEdges);
      if (workflow) {
        updateWorkflowGraph(workflow.id, nodesRef.current, newEdges);
      }
    },
    [setEdges, updateWorkflowGraph, workflow],
  );

  const saveGuidedEdge = useCallback(
    (definition: {
      edgeId?: string;
      source: string;
      target: string;
      data?: Partial<EdgeData>;
    }) => {
      const source = nodesRef.current.find(
        (node) => node.id === definition.source,
      );
      const target = nodesRef.current.find(
        (node) => node.id === definition.target,
      );
      if (!source || !target || source.id === target.id) return;

      const inferred = inferEdgeData(source, target);
      const data: EdgeData = {
        ...inferred,
        ...definition.data,
        needsReview: undefined,
      };
      const existing = definition.edgeId
        ? edgesRef.current.find((edge) => edge.id === definition.edgeId)
        : edgesRef.current.find(
            (edge) =>
              edge.source === source.id &&
              edge.target === target.id &&
              edge.data?.relation === data.relation,
          );
      const nextEdge: FlowEdge = {
        ...(existing ?? {}),
        id: existing?.id ?? `edge-${generateId()}`,
        source: source.id,
        target: target.id,
        type: "dataFlow",
        data,
      };
      const newEdges = existing
        ? edgesRef.current.map((edge) =>
            edge.id === existing.id ? nextEdge : edge,
          )
        : addEdge<FlowEdge>(nextEdge, edgesRef.current);

      setEdges(newEdges);
      if (workflow) {
        updateWorkflowGraph(workflow.id, nodesRef.current, newEdges);
      }
      return nextEdge;
    },
    [setEdges, updateWorkflowGraph, workflow],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      const newEdges = edgesRef.current.filter((edge) => edge.id !== edgeId);
      setEdges(newEdges);
      if (workflow) {
        updateWorkflowGraph(workflow.id, nodesRef.current, newEdges);
      }
      if (editingEdgeId === edgeId) setEditingEdgeId(null);
    },
    [editingEdgeId, setEdges, updateWorkflowGraph, workflow],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      const newEdges = applyEdgeChanges(changes, edgesRef.current);
      setEdges(newEdges);
      if (workflow && changes.some((change) => change.type === "remove")) {
        updateWorkflowGraph(workflow.id, nodesRef.current, newEdges);
      }
    },
    [setEdges, updateWorkflowGraph, workflow],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const nextNodes = applyNodeChanges(changes, nodesRef.current);
      const movedNodeIds = new Set(
        changes
          .filter((change) => change.type === "position")
          .map((change) => change.id),
      );
      const nextEdges = invalidateRoutesForMovedNodes(
        edgesRef.current,
        movedNodeIds,
      );

      setNodes(nextNodes);
      if (nextEdges !== edgesRef.current) {
        setEdges(nextEdges);
      }

      const dragFinished = changes.some(
        (change) => change.type === "position" && change.dragging === false,
      );
      if (dragFinished && workflow) {
        updateWorkflowGraph(workflow.id, nextNodes, nextEdges);
      }
    },
    [setEdges, setNodes, updateWorkflowGraph, workflow],
  );

  const tidyLayout = useCallback(
    async (options?: { persist?: boolean }) => {
      const layout = await layoutArchitecture(
        nodesRef.current,
        edgesRef.current,
      );
      setNodes(layout.nodes);
      setEdges(layout.edges);
      if (workflow && options?.persist !== false) {
        updateWorkflowGraph(workflow.id, layout.nodes, layout.edges);
      }
      return layout;
    },
    [setEdges, setNodes, updateWorkflowGraph, workflow],
  );

  return {
    workflow,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    setNodes,
    setEdges,
    deleteNode,
    updateNode,
    addNode,
    connectNodes,
    editingEdgeId,
    setEditingEdgeId,
    updateEdge,
    saveGuidedEdge,
    deleteEdge,
    tidyLayout,
  };
}
