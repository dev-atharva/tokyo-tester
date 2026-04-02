"use client";
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import type {
  EnvironmentVariable,
  FlowNode,
  PortMapping,
  ServiceNodeData,
} from "../types/react-flow-cots";
import { sanitizeName } from "../../utils/scenario-translator";
import { RegistryConfigForm } from "./RegistryConfigForm";
import { ServiceConfigForm } from "./ServiceConfigForm";
import { IconSettings2 } from "@tabler/icons-react";

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
  const [activeTab, SetactiveTab] = useState<"service" | "registry">("service");
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
        name: sanitizeName(node.data.label || node.id),
        ports: (node.data.service?.ports || []).map((p: PortMapping) => ({
          hostPort: p.hostPort,
          containerPort: p.containerPort,
        })),
        envVars: (node.data.service?.env || []).map(
          (e: EnvironmentVariable) => ({
            key: e.key,
            value: e.value,
          }),
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
      <DialogContent className="h-[80vh] min-w-[80vw] overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <IconSettings2 className="size-4" />
            </div>
            <div>
              <DialogTitle>Service Configuration</DialogTitle>
              <DialogDescription>
                Configure the service definition and registry settings for this
                node.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(v) => SetactiveTab(v as "service" | "registry")}
          className="flex h-full flex-col overflow-hidden"
        >
          <div className="px-6 pt-5 pb-2">
            <TabsList className="grid w-72 grid-cols-2">
              <TabsTrigger value="service">Service</TabsTrigger>
              <TabsTrigger value="registry">Registry</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="service"
            className="mt-0 h-full overflow-auto px-6 pb-5 w-full"
          >
            <ServiceConfigForm
              serviceData={editedNode.data}
              onChange={handleDataChange}
              availableServices={availableServices}
            />
          </TabsContent>
          <TabsContent
            value="registry"
            className="mt-0 h-full overflow-auto px-6 pb-5 w-full"
          >
            <RegistryConfigForm
              serviceId={sanitizeName(editedNode.data.label)}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter className="border-t bg-muted/20 px-6 py-3">
          <DialogClose>
            <Button variant="outline" className="shadow-sm">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSave} className="shadow-sm">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
