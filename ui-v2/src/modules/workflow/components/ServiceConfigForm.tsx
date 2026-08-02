"use client";
import { IconAdjustments, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Form,
  FormDescription,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { generateId } from "@/lib/generate-id";
import { serviceTypeDefaults } from "../lib/workflow-defaults";
import type {
  EnvironmentVariable,
  InitScript,
  PortMapping,
  ServiceNodeData,
  ServiceType,
} from "../types/react-flow-cots";
import { ContextHelp } from "./BuilderHelp";
import { MockServerExpectationEditor } from "./MockServerExpectationEditor";

interface ServiceConfigFormProps {
  serviceData: ServiceNodeData;
  onChange: (data: ServiceNodeData) => void;
  availableServices: Array<{
    name: string;
    ports: { hostPort: string; containerPort: string }[];
    envVars: { key: string; value: string }[];
  }>;
}

interface ServiceFormData {
  label: string;
  description?: string;
  serviceType: string;
  image?: string;
  command: { id: string; value: string }[];
  env: EnvironmentVariable[];
  ports: PortMapping[];
  waitStratergyEnabled: boolean;
  waitStratergyType: "log" | "port" | "exec";
  waitStratergyTarget?: string;
  waitStratergyTimeout?: number;
  initScripts: InitScript[];
}

function toReferenceToken(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

const EnvVariableValueInput = ({
  value,
  onChange,
  availableServices,
  ariaLabel,
}: {
  value: string;
  onChange: (val: string) => void;
  ariaLabel: string;
  availableServices: Array<{
    name: string;
    ports: { hostPort: string; containerPort: string }[];
    envVars: { key: string; value: string }[];
  }>;
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const allSuggestions = new Set<string>();

    availableServices.forEach((service) => {
      const serviceName = toReferenceToken(service.name);
      if (!serviceName) return;

      // Host reference
      allSuggestions.add(`\${${serviceName}.host}`);

      // Ports
      (service.ports || []).forEach((port) => {
        const containerPort = toReferenceToken(port?.containerPort);
        if (containerPort) {
          allSuggestions.add(`\${${serviceName}.port.${containerPort}}`);
        }
      });

      // Env vars
      (service.envVars || []).forEach((envVar) => {
        const envKey = toReferenceToken(envVar?.key);
        if (envKey) {
          allSuggestions.add(`\${${serviceName}.env.${envKey}}`);
        }
      });
    });

    setSuggestions(Array.from(allSuggestions));
  }, [availableServices]);

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
        aria-label={ariaLabel}
        className="shadow-sm font-mono text-sm"
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-popover border border-border/60 rounded-lg shadow-lg max-h-60 overflow-auto">
          {filteredSuggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
              onMouseDown={() => {
                onChange(suggestion);
                setShowSuggestions(false);
              }}
            >
              <code className="text-xs text-foreground">{suggestion}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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
    mariadb: [
      { key: "MARIA_DB", value: "mydb" },
      { key: "MARIA_USER", value: "root" },
      { key: "MARIA_PASSWORD", value: "root" },
    ],
    redis: [{ key: "REDIS_PASSWORD", value: "" }],
    kafka: [
      { key: "CLUSTER_ID", value: "test-cluster" },
      { key: "KAFKA_BROKERS", value: "Broker1,Broker2" },
      { key: "KAFKA_PROTOCOL", value: "PLAINTEXT" },
    ],
    rabbitmq: [
      { key: "RABBITMQ_DEFAULT_USER", value: "guest" },
      { key: "RABBITMQ_DEFAULT_PASS", value: "guest" },
    ],
    mongodb: [
      { key: "MONGO_INITDB_DATABASE", value: "testdb" },
      { key: "MONGO_INITDB_ROOT_USERNAME", value: "admin" },
      { key: "MONGO_INITDB_ROOT_PASSWORD", value: "admin" },
    ],
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
      description: serviceData.description,
      serviceType: serviceData.service.type,
      image: serviceData.service.image,
      command: (serviceData.service.command || []).map((cmd) => ({
        id: generateId(),
        value: cmd,
      })),
      env: serviceData.service.env || [],
      ports: serviceData.service.ports || [],
      waitStratergyEnabled: serviceData.service.waitStratergy?.enabled ?? false,
      waitStratergyType: serviceData.service.waitStratergy?.type ?? "log",
      waitStratergyTarget: serviceData.service.waitStratergy?.target,
      waitStratergyTimeout: serviceData.service.waitStratergy?.timeout,
      initScripts: serviceData.service.initScripts || [],
    },
  });

  const { control, formState, register, setValue, watch } = form;

  const {
    fields: commandFields,
    append: appendCommand,
    remove: removeCommand,
  } = useFieldArray({ control, name: "command" });

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
        description: value.description,
        service: {
          ...serviceData.service,
          type: (value.serviceType ??
            serviceData.service.type) as ServiceNodeData["service"]["type"],
          image: value.image,
          command: value.command
            ?.filter((c): c is NonNullable<typeof c> => Boolean(c))
            .map((c) => c.value ?? "")
            .filter((v) => v.trim() !== ""),
          env: value.env
            ?.filter((e): e is NonNullable<typeof e> => Boolean(e))
            .map((e) => ({
              id: e.id ?? generateId(),
              key: e.key ?? "",
              value: e.value ?? "",
            })),
          ports: value.ports
            ?.filter((p): p is NonNullable<typeof p> => Boolean(p))
            .map((p) => ({
              id: p.id ?? generateId(),
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
              id: s.id ?? generateId(),
              order: s.order ?? 0,
              script: s.script ?? "",
              description: s.description,
            })),
          mockServer:
            value.serviceType === "mockserver"
              ? (serviceData.service.mockServer ?? { expectations: [] })
              : undefined,
        },
      });
    });
    return () => sub.unsubscribe();
  }, [watch, onChange, serviceData]);

  const handleLoadPresets = () => {
    const presets = getPresetsForServiceType(currentServiceType);
    const existingKeys = new Set(envFields.map((field) => field.key));

    const newPresets = presets.filter(
      (preset) => !existingKeys.has(preset.key),
    );

    newPresets.forEach((preset) => {
      appendEnv({
        id: generateId(),
        key: preset.key,
        value: preset.value,
      });
    });
  };

  const handleServiceTypeChange = (type: ServiceType) => {
    const defaults = serviceTypeDefaults(type).service;
    setValue("serviceType", type, { shouldDirty: true });
    if (!formState.dirtyFields.image) {
      setValue("image", defaults.image, { shouldDirty: false });
    }
    if (!formState.dirtyFields.env) {
      setValue("env", defaults.env ?? [], { shouldDirty: false });
    }
    if (!formState.dirtyFields.ports) {
      setValue("ports", defaults.ports ?? [], { shouldDirty: false });
    }
    if (!formState.dirtyFields.waitStratergyEnabled) {
      setValue("waitStratergyEnabled", true, { shouldDirty: false });
      setValue("waitStratergyType", "port", { shouldDirty: false });
      setValue("waitStratergyTarget", defaults.waitStratergy?.target, {
        shouldDirty: false,
      });
      setValue("waitStratergyTimeout", defaults.waitStratergy?.timeout, {
        shouldDirty: false,
      });
    }
  };

  return (
    <Form {...form}>
      <div className="flex flex-col gap-8 py-4">
        {/* BASIC INFO */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
            Basic Information
          </h3>
          <div className="space-y-3">
            <FormItem>
              <FormLabel
                htmlFor="service-label"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
              >
                Label
              </FormLabel>
              <Input
                id="service-label"
                {...register("label")}
                placeholder="Service label"
                className="shadow-sm"
              />
            </FormItem>
            <FormItem>
              <FormLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plain-language purpose
              </FormLabel>
              <Input
                {...register("description")}
                placeholder="Accepts payments and coordinates settlement"
                className="shadow-sm"
              />
              <FormDescription>
                Shown in Overview mode for people who do not know the
                implementation.
              </FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Service Type
              </FormLabel>
              <Controller
                control={control}
                name="serviceType"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) =>
                      handleServiceTypeChange(
                        (value ?? "generic") as ServiceType,
                      )
                    }
                  >
                    <SelectTrigger className="shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="generic">Application</SelectItem>
                        <SelectItem value="postgres">PostgreSQL</SelectItem>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="mariadb">MariaDB</SelectItem>
                        <SelectItem value="redis">Redis</SelectItem>
                        <SelectItem value="memcached">Memcached</SelectItem>
                        <SelectItem value="kafka">Kafka</SelectItem>
                        <SelectItem value="rabbitmq">RabbitMQ</SelectItem>
                        <SelectItem value="mongodb">MongoDB</SelectItem>
                        <SelectItem value="nginx">Nginx</SelectItem>
                        <SelectItem value="mockserver">MockServer</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormItem>
            <FormItem>
              <div className="flex items-center gap-1">
                <FormLabel
                  htmlFor="service-container-image"
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Docker Image
                </FormLabel>
                <ContextHelp label="Docker image">
                  This is the exact container image started for the workflow.
                  Application services require one; managed providers start with
                  a tested default.
                </ContextHelp>
              </div>
              <Input
                id="service-container-image"
                {...register("image")}
                placeholder={
                  currentServiceType === "generic"
                    ? "ghcr.io/your-team/application:latest"
                    : "Container image"
                }
                aria-invalid={
                  currentServiceType === "generic" && !watch("image")?.trim()
                }
                className="shadow-sm font-mono text-sm"
              />
              <FormDescription>
                {currentServiceType === "generic"
                  ? "Required for application services. Use the image that should be tested."
                  : "A recommended image is selected automatically and can be changed."}
              </FormDescription>
              {currentServiceType === "generic" && !watch("image")?.trim() ? (
                <p className="text-xs text-destructive" role="alert">
                  Enter the application image before saving this service.
                </p>
              ) : null}
            </FormItem>
          </div>
        </section>

        {currentServiceType === "mockserver" ? (
          <MockServerExpectationEditor
            expectations={serviceData.service.mockServer?.expectations ?? []}
            onChange={(expectations) =>
              onChange({
                ...serviceData,
                service: {
                  ...serviceData.service,
                  type: "mockserver",
                  mockServer: { expectations },
                },
              })
            }
          />
        ) : null}

        <Collapsible>
          <CollapsibleTrigger
            render={<Button type="button" variant="outline" />}
          >
            <IconAdjustments data-icon="inline-start" />
            Advanced runtime settings
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-8 pt-4">
            <Separator />

            {/* COMMAND ARGUMENTS */}
            <section className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                  Command Arguments
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => appendCommand({ id: generateId(), value: "" })}
                  className="shadow-sm"
                >
                  <IconPlus className="h-4 w-4 mr-1.5" />
                  Add
                </Button>
              </div>
              <FormDescription className="text-xs">
                Command-line arguments to pass to the container (e.g.
                -port=8080, -debug=true)
              </FormDescription>
              {commandFields.length === 0 ? (
                <div className="flex items-center justify-center py-6 rounded-lg border border-dashed border-border/60">
                  <p className="text-xs text-muted-foreground italic">
                    No command arguments
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {commandFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        {...register(`command.${index}.value`)}
                        placeholder="Argument (e.g. -port=8080)"
                        className="flex-1 shadow-sm font-mono text-sm"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        onClick={() => removeCommand(index)}
                        className="shadow-sm"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ENV VARS */}
            <section className="space-y-3">
              <div className="flex items-center gap-1">
                <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                  Environment Variables
                </h3>
                <ContextHelp label="service references">
                  Reference another service by its workflow name so Tokyo Tester
                  can resolve its internal host, port, or environment value when
                  the run starts.
                </ContextHelp>
                <div className="ml-auto flex gap-2">
                  {currentServiceType !== "generic" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleLoadPresets}
                      className="shadow-sm"
                    >
                      Load Presets
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      appendEnv({ id: generateId(), key: "", value: "" })
                    }
                    className="shadow-sm"
                  >
                    <IconPlus className="h-4 w-4 mr-1.5" />
                    Add
                  </Button>
                </div>
              </div>
              <FormDescription className="text-xs">
                Use{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  ${"{"}SERVICE_NAME.host{"}"}
                </code>
                ,{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  ${"{"}SERVICE_NAME.port.PORT{"}"}
                </code>
                , or{" "}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  ${"{"}SERVICE_NAME.env.VAR{"}"}
                </code>{" "}
                to reference other services
              </FormDescription>
              {envFields.length === 0 ? (
                <div className="flex items-center justify-center py-6 rounded-lg border border-dashed border-border/60">
                  <p className="text-xs text-muted-foreground italic">
                    No environment variables
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {envFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2">
                      <Input
                        {...register(`env.${index}.key`)}
                        placeholder="Key"
                        aria-label={`Environment variable ${index + 1} key`}
                        className="w-1/3 shadow-sm font-mono text-sm"
                      />
                      <Controller
                        control={control}
                        name={`env.${index}.value`}
                        render={({ field }) => (
                          <EnvVariableValueInput
                            value={field.value || ""}
                            onChange={field.onChange}
                            availableServices={availableServices}
                            ariaLabel={`Environment variable ${index + 1} value`}
                          />
                        )}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        onClick={() => removeEnv(index)}
                        className="shadow-sm"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* PORTS */}
            <section className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                    Port Mappings
                  </h3>
                  <ContextHelp label="container and host ports">
                    Container ports are used between workflow services. Host
                    ports are only needed when something outside the isolated
                    network must connect.
                  </ContextHelp>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    appendPort({
                      id: generateId(),
                      hostPort: "",
                      containerPort: "",
                    })
                  }
                  className="shadow-sm"
                >
                  <IconPlus className="h-4 w-4 mr-1.5" />
                  Add
                </Button>
              </div>
              <FormDescription className="text-xs">
                Map container ports to host ports. These ports can be referenced
                by other services.
              </FormDescription>
              {portFields.length === 0 ? (
                <div className="flex items-center justify-center py-6 rounded-lg border border-dashed border-border/60">
                  <p className="text-xs text-muted-foreground italic">
                    No port mappings
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {portFields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-center">
                      <Input
                        {...register(`ports.${index}.hostPort`)}
                        placeholder="Host Port"
                        className="flex-1 shadow-sm font-mono text-sm"
                      />
                      <span className="text-muted-foreground">→</span>
                      <Input
                        {...register(`ports.${index}.containerPort`)}
                        placeholder="Container Port"
                        className="flex-1 shadow-sm font-mono text-sm"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        onClick={() => removePort(index)}
                        className="shadow-sm"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* WAIT STRATEGY */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
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
                  <div>
                    <div className="flex items-center gap-1">
                      <Label className="text-sm font-semibold">
                        Enable Wait Strategy
                      </Label>
                      <ContextHelp label="wait strategy">
                        A wait strategy proves the container is ready before a
                        dependent service or scenario tries to use it.
                      </ContextHelp>
                    </div>
                    <FormDescription className="text-xs mt-0.5">
                      Wait for the service to be ready before starting dependent
                      services
                    </FormDescription>
                  </div>
                </div>
              </div>

              {waitEnabled && (
                <div className="space-y-3 pl-6 py-3 border-l-2 border-primary/30 bg-muted/20 rounded-r-lg pr-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Strategy Type
                    </Label>
                    <Controller
                      control={control}
                      name="waitStratergyType"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="shadow-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="log">Log Message</SelectItem>
                            <SelectItem value="port">Port Ready</SelectItem>
                            <SelectItem value="exec">
                              Execute Command
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Target
                    </Label>
                    <Input
                      {...register("waitStratergyTarget")}
                      placeholder="Log message / port number / command"
                      className="shadow-sm font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Timeout (seconds)
                    </Label>
                    <Input
                      type="number"
                      {...register("waitStratergyTimeout", {
                        valueAsNumber: true,
                      })}
                      placeholder="30"
                      className="shadow-sm"
                    />
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* INIT SCRIPTS */}
            <section className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                  Init Scripts
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    appendInitScript({
                      id: generateId(),
                      order: initScriptFields.length + 1,
                      script: "",
                      description: "",
                    })
                  }
                  className="shadow-sm"
                >
                  <IconPlus className="h-4 w-4 mr-1.5" />
                  Add
                </Button>
              </div>
              <FormDescription className="text-xs">
                Scripts to run when the service starts (executed in order)
                {currentServiceType === "redis" &&
                  " • Redis commands, e.g., SET key value"}
                {currentServiceType === "kafka" &&
                  " • Kafka CLI commands, e.g., kafka-topics --create --topic orders"}
                {currentServiceType === "rabbitmq" &&
                  " • RabbitMQ commands, e.g., rabbitmqadmin declare queue name=orders"}
              </FormDescription>
              {initScriptFields.length === 0 ? (
                <div className="flex items-center justify-center py-6 rounded-lg border border-dashed border-border/60">
                  <p className="text-xs text-muted-foreground italic">
                    No init scripts
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {initScriptFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="flex flex-col gap-2 p-4 border border-border/60 rounded-lg bg-muted/20 shadow-sm"
                    >
                      <div className="flex gap-2 items-center">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">
                            Order:
                          </Label>
                          <Input
                            type="number"
                            {...register(`initScripts.${index}.order`, {
                              valueAsNumber: true,
                            })}
                            placeholder="1"
                            className="w-16 shadow-sm text-center"
                          />
                        </div>
                        <Input
                          {...register(`initScripts.${index}.description`)}
                          placeholder="Description (optional)"
                          className="flex-1 shadow-sm"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          onClick={() => removeInitScript(index)}
                          className="shadow-sm"
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        {...register(`initScripts.${index}.script`)}
                        placeholder={
                          currentServiceType === "redis"
                            ? "Redis command (e.g., SET mykey myvalue)"
                            : currentServiceType === "kafka"
                              ? "Kafka CLI command (e.g., kafka-topics --create --topic orders --partitions 3)"
                              : currentServiceType === "rabbitmq"
                                ? "RabbitMQ command (e.g., rabbitmqadmin declare queue name=orders)"
                                : "Script content or command"
                        }
                        className="shadow-sm font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Form>
  );
};
