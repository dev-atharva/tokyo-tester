"use client";
import { IconSettings2 } from "@tabler/icons-react";
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
import { sanitizeName } from "../../utils/scenario-translator";
import {
  EMPTY_REGISTRY_FORM,
  type RegistryFormValue,
  registryConfigFromForm,
  registryFormFromConfig,
  resolveRegistryImage,
  validateRegistryForm,
} from "../lib/registry-config";
import { useRegistrySecretStore } from "../stores/registry-secret-store";
import type {
  EnvironmentVariable,
  FlowNode,
  PortMapping,
  ServiceNodeData,
} from "../types/react-flow-cots";
import { RegistryConfigForm } from "./RegistryConfigForm";
import { ServiceConfigForm } from "./ServiceConfigForm";

interface NodeConfigProps {
  workflowId: string;
  isOpen: boolean;
  node: FlowNode | null;
  nodes: FlowNode[];
  onClose: () => void;
  onSave: (node: FlowNode) => void;
}

export const NodeConfigDialog: React.FC<NodeConfigProps> = ({
  workflowId,
  isOpen,
  node,
  onClose,
  onSave,
  nodes,
}) => {
  const [activeTab, SetactiveTab] = useState<"service" | "registry">("service");
  const [editedNode, SetEditedNode] = useState<FlowNode | null>(node);
  const [registryDraft, setRegistryDraft] = useState<RegistryFormValue>({
    ...EMPTY_REGISTRY_FORM,
  });

  React.useEffect(() => {
    if (!isOpen || !node) return;
    SetEditedNode(node);
    SetactiveTab("service");
    const metadata = node.data.service.registry;
    const runtimeSecret = useRegistrySecretStore
      .getState()
      .getSecret(workflowId, node.id);
    setRegistryDraft(
      registryFormFromConfig(
        metadata
          ? {
              ...runtimeSecret,
              url: metadata.url,
              auth_type: metadata.auth_type,
            }
          : runtimeSecret,
      ),
    );
  }, [isOpen, node, workflowId]);

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
      if (
        editedNode.data.service.type === "generic" &&
        !editedNode.data.service.image?.trim()
      ) {
        SetactiveTab("service");
        requestAnimationFrame(() =>
          document.getElementById("service-container-image")?.focus(),
        );
        return;
      }

      const registryError = validateRegistryForm(registryDraft);
      if (registryError) {
        SetactiveTab("registry");
        requestAnimationFrame(() =>
          document.getElementById(registryError.field)?.focus(),
        );
        return;
      }
      if (registryDraft.enabled) {
        try {
          resolveRegistryImage(
            registryDraft.url,
            editedNode.data.service.image ?? "",
          );
        } catch {
          SetactiveTab("registry");
          requestAnimationFrame(() =>
            document.getElementById("registry-url")?.focus(),
          );
          return;
        }
      }

      const registryConfig = registryConfigFromForm(registryDraft);
      const secretStore = useRegistrySecretStore.getState();
      if (registryConfig && registryConfig.auth_type !== "none") {
        secretStore.setSecret(workflowId, editedNode.id, registryConfig);
      } else {
        secretStore.clearSecret(workflowId, editedNode.id);
      }

      const { registry: _registry, ...serviceWithoutRegistry } =
        editedNode.data.service;
      const service = registryConfig
        ? {
            ...serviceWithoutRegistry,
            registry: {
              url: registryConfig.url,
              auth_type: registryConfig.auth_type,
            },
          }
        : serviceWithoutRegistry;
      onSave({
        ...editedNode,
        data: { ...editedNode.data, service },
      });
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
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
              serviceId={editedNode.id}
              image={editedNode.data.service.image}
              value={registryDraft}
              onChange={setRegistryDraft}
            />
          </TabsContent>
        </Tabs>
        <DialogFooter className="border-t bg-muted/20 px-6 py-3">
          <DialogClose
            render={<Button variant="outline" className="shadow-sm" />}
          >
            Cancel
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={
              editedNode.data.service.type === "generic" &&
              !editedNode.data.service.image?.trim()
            }
            className="shadow-sm"
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
