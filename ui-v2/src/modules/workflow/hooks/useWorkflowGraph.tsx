import { useCallback, useEffect, useRef } from "react";
import {
  addEdge,
  type Connection,
  type Node,
  useEdgesState,
  useNodesState,
} from "reactflow";
import { useWorkflowStore } from "../stores/workflow.store.sync";
import type {
  EdgeData,
  FlowNode,
  ServiceNodeData,
} from "../types/react-flow-cots";

export function useWorkflowGraph(workflowId: string) {
  const workflow = useWorkflowStore((s) => s.getWorkflow(workflowId));
  const updateWorkflowGraph = useWorkflowStore((s) => s.updateWorkflowGraph);

  const [nodes, setNodes, onNodesChange] = useNodesState<ServiceNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeData>([]);
  const nodesRef = useRef<FlowNode[]>([]);
  const edgesRef = useRef(workflow?.edges ?? []);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Load nodes and edges from workflow when workflow changes
  useEffect(() => {
    if (workflow) {
      console.log("Loading workflow graph:", {
        nodes: workflow.nodes.length,
        edges: workflow.edges.length,
      });

      setNodes(workflow.nodes);
      setEdges(workflow.edges);
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
        console.log("Deleting node, updating graph:", {
          nodes: newNodes.length,
          edges: newEdges.length,
        });

        updateWorkflowGraph(workflow.id, newNodes, newEdges);
      }
    },
    [workflow, updateWorkflowGraph, setNodes, setEdges],
  );

  // Update node
  const updateNode = useCallback(
    (updatedNode: FlowNode) => {
      const newNodes = nodesRef.current.map((n) =>
        n.id === updatedNode.id ? (updatedNode as Node) : n,
      );

      setNodes(newNodes);

      if (workflow) {
        console.log("Updating node, saving graph:", {
          nodes: newNodes.length,
          edges: edgesRef.current.length,
        });

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
        console.log("Adding node, saving graph:", {
          nodes: newNodes.length,
          edges: edgesRef.current.length,
        });

        updateWorkflowGraph(workflow.id, newNodes, edgesRef.current);
      }
    },
    [workflow, updateWorkflowGraph, setNodes],
  );

  // Connect nodes
  const connectNodes = useCallback(
    (connection: Connection) => {
      const newEdge = { ...connection, data: { dependencyType: "service" } };
      const newEdges = addEdge(newEdge, edgesRef.current);

      setEdges(newEdges);

      if (workflow) {
        console.log("Connecting nodes, saving graph:", {
          nodes: nodesRef.current.length,
          edges: newEdges.length,
        });

        updateWorkflowGraph(workflow.id, nodesRef.current, newEdges);
      }
    },
    [workflow, updateWorkflowGraph, setEdges],
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
  };
}
