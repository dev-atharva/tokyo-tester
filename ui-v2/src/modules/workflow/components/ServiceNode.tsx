"use client";
import type { ElementType } from "react";
import type { NodeProps } from "reactflow";
import { BaseExecutionNode } from "@/components/react-flow/base-execution-node";
import type { ServiceNodeData } from "../types/react-flow-cots";
import { DockerIcon } from "./logos/DockerIcon";
import { ApacheKafkaIcon } from "./logos/KafkaIcon";
import { MariaDBIcon } from "./logos/MariadbIcon";
import { MongoDBIcon } from "./logos/MongoDBIcon";
import { MySQLIcon } from "./logos/MysqlIcon";
import { PostgreSQLIcon } from "./logos/PostgresIcon";
import { RabbitMQIcon } from "./logos/RabbitMQIcon";
import { RedisIcon } from "./logos/RedisIcon";

export function ServiceNode(props: NodeProps<ServiceNodeData>) {
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

  const description =
    data.service.type === "generic"
      ? (data.service.image ?? "Generic Service")
      : data.service.type.toUpperCase();

  return (
    <BaseExecutionNode
      {...props}
      icon={icon}
      name={data.label}
      description={description}
    />
  );
}
