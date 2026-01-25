"use client";
import { useEffect, useState } from "react";
import {
  EnvironmentVariable,
  InitScript,
  PortMapping,
  ServiceNodeData,
} from "../types/react-flow-cots";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import {
  FormItem,
  FormLabel,
  FormDescription,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ServiceConfigFormProps {
  serviceData: ServiceNodeData;
  onChange: (data: ServiceNodeData) => void;
  availableServices: Array<{
    name: string;
    ports: string[];
    envVars: string[];
  }>;
}

interface ServiceFormData {
  label: string;
  serviceType: string;
  image?: string;
  env: EnvironmentVariable[];
  ports: PortMapping[];
  waitStratergyEnabled: boolean;
  waitStratergyType: "log" | "port" | "exec";
  waitStratergyTarget?: string;
  waitStratergyTimeout?: number;
  initScripts: InitScript[];
}

// FIXED: EnvVariableValueInput component with proper return statement
const EnvVariableValueInput = ({
  value,
  onChange,
  availableServices,
}: {
  value: string;
  onChange: (val: string) => void;
  availableServices: Array<{
    name: string;
    ports: string[];
    envVars: string[];
  }>;
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Generate suggestions based on available services
  useEffect(() => {
    const allSuggestions: string[] = [];

    availableServices.forEach((service) => {
      // Add host reference
      allSuggestions.push(`\${${service.name}.host}`);

      // Add port references
      service.ports.forEach((port) => {
        allSuggestions.push(`\${${service.name}.port.${port}}`);
      });

      // Add env references
      service.envVars.forEach((envVar) => {
        allSuggestions.push(`\${${service.name}.env.${envVar}}`);
      });
    });

    setSuggestions(allSuggestions);
  }, [availableServices]);

  // Filter suggestions based on current input
  const filteredSuggestions = suggestions.filter((s) =>
    s.toLowerCase().includes(value.toLowerCase()),
  );

  return (
    <div className="relative flex-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Value or ${service.field}"
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredSuggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100"
              onMouseDown={() => {
                onChange(suggestion);
                setShowSuggestions(false);
              }}
            >
              <code className="text-sm">{suggestion}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper function to get presets for different service types
const getPresetsForServiceType = (
  serviceType: string,
): Array<{ key: string; value: string }> => {
  const presets: Record<string, Array<{ key: string; value: string }>> = {
    postgres: [
      { key: "POSTGRES_USER", value: "postgres" },
      { key: "POSTGRES_PASSWORD", value: "postgres" },
      { key: "POSTGRES_DB", value: "mydb" },
    ],
    mysql: [
      { key: "MYSQL_ROOT_PASSWORD", value: "root" },
      { key: "MYSQL_DATABASE", value: "mydb" },
      { key: "MYSQL_USER", value: "user" },
      { key: "MYSQL_PASSWORD", value: "password" },
    ],
    redis: [{ key: "REDIS_PASSWORD", value: "" }],
  };
  return presets[serviceType] || [];
};

export const ServiceConfigForm: React.FC<ServiceConfigFormProps> = ({
  serviceData,
  onChange,
  availableServices,
}) => {
  const form = useForm<ServiceFormData>({
    defaultValues: {
      label: serviceData.label,
      serviceType: serviceData.service.type,
      image: serviceData.service.image,
      env: serviceData.service.env || [],
      ports: serviceData.service.ports || [],
      waitStratergyEnabled: serviceData.service.waitStratergy?.enabled ?? false,
      waitStratergyType: serviceData.service.waitStratergy?.type ?? "log",
      waitStratergyTarget: serviceData.service.waitStratergy?.target,
      waitStratergyTimeout: serviceData.service.waitStratergy?.timeout,
      initScripts: serviceData.service.initScripts || [],
    },
  });

  const { control, register, watch } = form;
  const {
    fields: envFields,
    append: appendEnv,
    remove: removeEnv,
  } = useFieldArray({ control, name: "env" });

  const {
    fields: portFields,
    append: appendPort,
    remove: removePort,
  } = useFieldArray({ control, name: "ports" });

  const {
    fields: initScriptFields,
    append: appendInitScript,
    remove: removeInitScript,
  } = useFieldArray({ control, name: "initScripts" });

  const waitEnabled = watch("waitStratergyEnabled");
  const currentServiceType = watch("serviceType");

  useEffect(() => {
    const sub = watch((value) => {
      onChange({
        ...serviceData,
        label: value.label ?? serviceData.label,
        service: {
          ...serviceData.service,
          type: (value.serviceType ?? serviceData.service.type) as any,
          image: value.image,
          env: value.env
            ?.filter((e): e is NonNullable<typeof e> => Boolean(e))
            .map((e) => ({
              id: e.id ?? crypto.randomUUID(),
              key: e.key ?? "",
              value: e.value ?? "",
            })),
          ports: value.ports
            ?.filter((p): p is NonNullable<typeof p> => Boolean(p))
            .map((p) => ({
              id: p.id ?? crypto.randomUUID(),
              hostPort: p.hostPort ?? "",
              containerPort: p.containerPort ?? "",
            })),
          waitStratergy: value.waitStratergyEnabled
            ? {
                enabled: true,
                type: value.waitStratergyType ?? "log",
                target: value.waitStratergyTarget,
                timeout: value.waitStratergyTimeout,
              }
            : undefined,
          initScripts: value.initScripts
            ?.filter((s): s is NonNullable<typeof s> => Boolean(s))
            .map((s) => ({
              id: s.id ?? crypto.randomUUID(),
              order: s.order ?? 0,
              script: s.script ?? "",
              description: s.description,
            })),
        },
      });
    });

    return () => sub.unsubscribe();
  }, [watch, onChange, serviceData]);

  // Handler to load service type presets
  const handleLoadPresets = () => {
    const presets = getPresetsForServiceType(currentServiceType);
    presets.forEach((preset) => {
      appendEnv({
        id: crypto.randomUUID(),
        key: preset.key,
        value: preset.value,
      });
    });
  };

  return (
    <Form {...form}>
      <div className="space-y-6">
        {/* BASIC INFO */}
        <div className="space-y-3">
          <FormItem>
            <FormLabel>Label</FormLabel>
            <Input {...register("label")} placeholder="Service label" />
          </FormItem>

          <FormItem>
            <FormLabel>Service Type</FormLabel>
            <Controller
              control={control}
              name="serviceType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="redis">Redis</SelectItem>
                    <SelectItem value="generic">Generic</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FormItem>

          <FormItem>
            <FormLabel>Docker Image</FormLabel>
            <Input {...register("image")} placeholder="postgres:15-alpine" />
          </FormItem>
        </div>

        <Separator />

        {/* ENV VARS - UPDATED SECTION */}
        <FormItem>
          <div className="flex justify-between items-center mb-2">
            <FormLabel>Environment Variables</FormLabel>
            <div className="flex gap-2">
              {currentServiceType !== "generic" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleLoadPresets}
                >
                  Load {currentServiceType} Presets
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  appendEnv({ id: crypto.randomUUID(), key: "", value: "" })
                }
              >
                <IconPlus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          <FormDescription className="text-xs mb-3">
            Use ${"{"}SERVICE_NAME.host{"}"}, ${"{"}
            SERVICE_NAME.port.CONTAINER_PORT{"}"}, or ${"{"}
            SERVICE_NAME.env.VAR_NAME{"}"} to reference other services
          </FormDescription>

          <div className="space-y-2">
            {envFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  {...register(`env.${index}.key`)}
                  placeholder="Key"
                  className="w-1/3"
                />
                <Controller
                  control={control}
                  name={`env.${index}.value`}
                  render={({ field }) => (
                    <EnvVariableValueInput
                      value={field.value || ""}
                      onChange={field.onChange}
                      availableServices={availableServices}
                    />
                  )}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  onClick={() => removeEnv(index)}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </FormItem>

        <Separator />

        {/* PORTS */}
        <FormItem>
          <div className="flex justify-between items-center mb-2">
            <FormLabel>Ports</FormLabel>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                appendPort({
                  id: crypto.randomUUID(),
                  hostPort: "",
                  containerPort: "",
                })
              }
            >
              <IconPlus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          <FormDescription className="text-xs mb-3">
            Map container ports to host ports. These ports can be referenced by
            other services.
          </FormDescription>

          <div className="space-y-2">
            {portFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  {...register(`ports.${index}.hostPort`)}
                  placeholder="Host Port"
                />
                <Input
                  {...register(`ports.${index}.containerPort`)}
                  placeholder="Container Port"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  onClick={() => removePort(index)}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </FormItem>

        <Separator />

        {/* WAIT STRATEGY */}
        <FormItem>
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="waitStratergyEnabled"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label>Enable Wait Strategy</Label>
          </div>
          <FormDescription className="text-xs">
            Wait for the service to be ready before starting dependent services
          </FormDescription>
        </FormItem>

        {waitEnabled && (
          <div className="space-y-3 pl-4 border-l">
            <Controller
              control={control}
              name="waitStratergyType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="log">Log</SelectItem>
                    <SelectItem value="port">Port</SelectItem>
                    <SelectItem value="exec">Exec</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />

            <Input
              {...register("waitStratergyTarget")}
              placeholder="Target (log message / port / command)"
            />

            <Input
              type="number"
              {...register("waitStratergyTimeout", { valueAsNumber: true })}
              placeholder="Timeout (seconds)"
            />
          </div>
        )}

        <Separator />

        {/* INIT SCRIPTS */}
        <FormItem>
          <div className="flex justify-between items-center mb-2">
            <FormLabel>Init Scripts</FormLabel>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                appendInitScript({
                  id: crypto.randomUUID(),
                  order: initScriptFields.length + 1,
                  script: "",
                  description: "",
                })
              }
            >
              <IconPlus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          <FormDescription className="text-xs mb-3">
            Scripts to run when the service starts (executed in order)
          </FormDescription>

          <div className="space-y-2">
            {initScriptFields.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-col gap-2 p-3 border rounded"
              >
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    {...register(`initScripts.${index}.order`, {
                      valueAsNumber: true,
                    })}
                    placeholder="Order"
                    className="w-20"
                  />
                  <Input
                    {...register(`initScripts.${index}.description`)}
                    placeholder="Description (optional)"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    onClick={() => removeInitScript(index)}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>

                <Input
                  {...register(`initScripts.${index}.script`)}
                  placeholder="Script content or command"
                />
              </div>
            ))}
          </div>
        </FormItem>
      </div>
    </Form>
  );
};
