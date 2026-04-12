"use client";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type {
  EnvironmentVariable,
  InitScript,
  PortMapping,
  ServiceNodeData,
} from "../types/react-flow-cots";

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
}: {
  value: string;
  onChange: (val: string) => void;
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
      serviceType: serviceData.service.type,
      image: serviceData.service.image,
      command: (serviceData.service.command || []).map((cmd) => ({
        id: crypto.randomUUID(),
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

  const { control, register, watch } = form;

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

  const handleLoadPresets = () => {
    const presets = getPresetsForServiceType(currentServiceType);
    const existingKeys = new Set(envFields.map((field) => field.key));

    const newPresets = presets.filter(
      (preset) => !existingKeys.has(preset.key),
    );

    newPresets.forEach((preset) => {
      appendEnv({
        id: crypto.randomUUID(),
        key: preset.key,
        value: preset.value,
      });
    });
  };

  return (
    <Form {...form}>
      <div className="space-y-8 py-4">
        {/* BASIC INFO */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
            Basic Information
          </h3>
          <div className="space-y-3">
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Label
              </FormLabel>
              <Input
                {...register("label")}
                placeholder="Service label"
                className="shadow-sm"
              />
            </FormItem>
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Service Type
              </FormLabel>
              <Controller
                control={control}
                name="serviceType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postgres">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL</SelectItem>
                      <SelectItem value="mariadb">MariaDB</SelectItem>
                      <SelectItem value="redis">Redis</SelectItem>
                      <SelectItem value="kafka">Kafka</SelectItem>
                      <SelectItem value="rabbitmq">RabbitMQ</SelectItem>
                      <SelectItem value="mongodb">MongoDB</SelectItem>
                      <SelectItem value="generic">Generic</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormItem>
            <FormItem>
              <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Docker Image
              </FormLabel>
              <Input
                {...register("image")}
                placeholder="postgres:15-alpine"
                className="shadow-sm font-mono text-sm"
              />
            </FormItem>
          </div>
        </section>

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
              onClick={() =>
                appendCommand({ id: crypto.randomUUID(), value: "" })
              }
              className="shadow-sm"
            >
              <IconPlus className="h-4 w-4 mr-1.5" />
              Add
            </Button>
          </div>
          <FormDescription className="text-xs">
            Command-line arguments to pass to the container (e.g. -port=8080,
            -debug=true)
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
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
              Environment Variables
            </h3>
            <div className="flex gap-2">
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
                  appendEnv({ id: crypto.randomUUID(), key: "", value: "" })
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
            <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
              Port Mappings
            </h3>
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
              className="shadow-sm"
            >
              <IconPlus className="h-4 w-4 mr-1.5" />
              Add
            </Button>
          </div>
          <FormDescription className="text-xs">
            Map container ports to host ports. These ports can be referenced by
            other services.
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
                <Label className="text-sm font-semibold">
                  Enable Wait Strategy
                </Label>
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
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="log">Log Message</SelectItem>
                        <SelectItem value="port">Port Ready</SelectItem>
                        <SelectItem value="exec">Execute Command</SelectItem>
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
                  {...register("waitStratergyTimeout", { valueAsNumber: true })}
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
                  id: crypto.randomUUID(),
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
      </div>
    </Form>
  );
};
