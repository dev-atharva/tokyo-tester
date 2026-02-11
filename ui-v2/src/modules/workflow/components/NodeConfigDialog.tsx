"use client";
import React, { useState, useMemo } from "react";
import {
  FlowNode,
  ServiceNodeData,
  PortMapping,
  EnvironmentVariable,
} from "../types/react-flow-cots";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServiceConfigForm } from "./ServiceConfigForm";
import { TestConfigForm } from "./TestConfigForm";
import { Button } from "@/components/ui/button";
import { RegistryConfigForm } from "./RegistryConfigForm";

interface NodeConfigProps {
  isOpen: boolean;
  node: FlowNode | null;
  nodes: FlowNode[];
  onClose: () => void;
  onSave: (node: FlowNode) => void;
}

export const NodeConfigDialog: React.FC<NodeConfigProps> = ({
  isOpen,
  node,
  onClose,
  onSave,
  nodes,
}) => {
  const [activeTab, SetactiveTab] = useState<"service" | "tests" | "registry">(
    "service",
  );
  const [editedNode, SetEditedNode] = useState<FlowNode | null>(node);

  React.useEffect(() => {
    SetEditedNode(node);
    SetactiveTab("service");
  }, [node]);

  const availableServices = useMemo(() => {
    if (!editedNode) return [];

    return nodes
      .filter(
        (node) => node.id !== editedNode.id && node.type === "serviceNode",
      )
      .map((node) => ({
        name: node.data.label || node.id,
        ports: (node.data.service?.ports || []).map(
          (p: PortMapping) => p.containerPort,
        ),
        envVars: (node.data.service?.env || []).map(
          (e: EnvironmentVariable) => e.key,
        ),
      }));
  }, [nodes, editedNode]);

  if (!isOpen || !editedNode) return null;

  const handleSave = () => {
    if (editedNode) {
      onSave(editedNode);
      onClose();
    }
  };

  const handleDataChange = (newData: ServiceNodeData) => {
    if (editedNode) {
      SetEditedNode({
        ...editedNode,
        data: newData,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="min-w-[65vw] h-[80vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Service Configuration</DialogTitle>
          <DialogDescription>
            You can do service configuration and tests configuration here.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(v) => SetactiveTab(v as "service" | "tests")}
          className="flex flex-col flex-1"
        >
          <TabsList>
            <TabsTrigger value="service">Service</TabsTrigger>
            <TabsTrigger value="tests">Tests</TabsTrigger>
            <TabsTrigger value="registry">Registry</TabsTrigger>
          </TabsList>
          <TabsContent
            value="service"
            className="flex-1 overflow-auto mt-4 w-full"
          >
            <ServiceConfigForm
              serviceData={editedNode.data}
              onChange={handleDataChange}
              availableServices={availableServices}
            />
          </TabsContent>
          <TabsContent
            value="tests"
            className="flex-1 overflow-auto mt-4 w-full"
          >
            <TestConfigForm
              serviceData={editedNode.data}
              onChange={handleDataChange}
            />
          </TabsContent>
          <TabsContent
            value="registry"
            className="flex-1 overflow-auto mt-4 w-full"
          >
            <RegistryConfigForm
              serviceId={sanitizeName(editedNode.data.label)}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <DialogClose>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function sanitizeName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
