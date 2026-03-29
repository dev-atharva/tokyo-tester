import { useCallback, useEffect } from "react";
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

  // Load nodes and edges from workflow when workflow changes
  useEffect(() => {
    if (workflow) {
      console.log("Loading workflow graph:", {
        nodes: workflow.nodes.length,
        edges: workflow.edges.length,
      });

      // Set edges from workflow
      setEdges(workflow.edges);
    }
  }, [workflow?.id, setEdges, workflow.edges, workflow]); // Don't include setNodes to avoid conflicts

  // Delete node
  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nodes) => {
        const newNodes = nodes.filter((n) => n.id !== nodeId);

        setEdges((edges) => {
          const newEdges = edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId,
          );

          if (workflow) {
            // Get current test order and remove this node
            const currentOrder = new Map(
              Object.entries(workflow.customTestOrder),
            );
            currentOrder.delete(nodeId);

            console.log("Deleting node, updating graph:", {
              nodes: newNodes.length,
              edges: newEdges.length,
            });

            updateWorkflowGraph(workflow.id, newNodes, newEdges, currentOrder);
          }

          return newEdges;
        });

        return newNodes;
      });
    },
    [workflow, updateWorkflowGraph, setNodes, setEdges],
  );

  // Update node
  const updateNode = useCallback(
    (updatedNode: FlowNode) => {
      setNodes((nodes) => {
        const newNodes = nodes.map((n) =>
          n.id === updatedNode.id ? (updatedNode as Node) : n,
        );

        if (workflow) {
          const currentOrder = new Map(
            Object.entries(workflow.customTestOrder),
          );

          console.log("Updating node, saving graph:", {
            nodes: newNodes.length,
            edges: edges.length,
          });

          updateWorkflowGraph(workflow.id, newNodes, edges, currentOrder);
        }

        return newNodes;
      });
    },
    [workflow, edges, updateWorkflowGraph, setNodes],
  );

  // Add node
  const addNode = useCallback(
    (node: FlowNode) => {
      setNodes((nodes) => {
        const newNodes = [...nodes, node];

        if (workflow) {
          const currentOrder = new Map(
            Object.entries(workflow.customTestOrder),
          );

          console.log("Adding node, saving graph:", {
            nodes: newNodes.length,
            edges: edges.length,
          });

          updateWorkflowGraph(workflow.id, newNodes, edges, currentOrder);
        }

        return newNodes;
      });
    },
    [workflow, edges, updateWorkflowGraph, setNodes],
  );

  // Connect nodes
  const connectNodes = useCallback(
    (connection: Connection) => {
      const newEdge = { ...connection, data: { dependencyType: "service" } };
      setEdges((eds) => {
        const newEdges = addEdge(newEdge, eds);

        if (workflow) {
          const currentOrder = new Map(
            Object.entries(workflow.customTestOrder),
          );

          console.log("Connecting nodes, saving graph:", {
            nodes: nodes.length,
            edges: newEdges.length,
          });

          updateWorkflowGraph(workflow.id, nodes, newEdges, currentOrder);
        }

        return newEdges;
      });
    },
    [nodes, workflow, updateWorkflowGraph, setEdges],
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
