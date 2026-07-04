"use client";
import type { NodeProps } from "@xyflow/react";
import type { ElementType } from "react";
import { BaseExecutionNode } from "@/components/react-flow/base-execution-node";
import {
  architectureRole,
  friendlyName,
  ROLE_META,
} from "../lib/architecture-view";
import type { FlowNode } from "../types/react-flow-cots";
import { DockerIcon } from "./logos/DockerIcon";
import { ApacheKafkaIcon } from "./logos/KafkaIcon";
import { MariaDBIcon } from "./logos/MariadbIcon";
import { MongoDBIcon } from "./logos/MongoDBIcon";
import { MySQLIcon } from "./logos/MysqlIcon";
import { PostgreSQLIcon } from "./logos/PostgresIcon";
import { RabbitMQIcon } from "./logos/RabbitMQIcon";
import { RedisIcon } from "./logos/RedisIcon";

export function ServiceNode(props: NodeProps<FlowNode>) {
  const { data } = props;
  let icon: ElementType;
  switch (data.service.type) {
    case "postgres":
      icon = PostgreSQLIcon;
      break;
    case "mysql":
      icon = MySQLIcon;
      break;
    case "mariadb":
      icon = MariaDBIcon;
      break;
    case "redis":
      icon = RedisIcon;
      break;
    case "kafka":
      icon = ApacheKafkaIcon;
      break;
    case "mongodb":
      icon = MongoDBIcon;
      break;
    case "rabbitmq":
      icon = RabbitMQIcon;
      break;
    default:
      icon = DockerIcon;
  }

  const technology =
    data.service.type === "generic"
      ? (data.service.image ?? "Generic Service")
      : data.service.type.toUpperCase();
  const role = architectureRole(data.service.type);

  return (
    <BaseExecutionNode
      {...props}
      icon={icon}
      name={friendlyName(data.label)}
      role={ROLE_META[role].label
        .replace(" services", "")
        .replace(" and cache", "")}
      description={data.description}
      technology={technology}
    />
  );
}
