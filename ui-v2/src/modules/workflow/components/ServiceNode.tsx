"use client";
import { NodeProps } from "reactflow";
import { ServiceNodeData } from "../types/react-flow-cots";
import { PostgreSQLIcon } from "./logos/PostgresIcon";
import { BaseExecutionNode } from "@/components/react-flow/base-execution-node";
import { MySQLIcon } from "./logos/MysqlIcon";
import { MariaDBIcon } from "./logos/MariadbIcon";
import { RedisIcon } from "./logos/RedisIcon";
import { ApacheKafkaIcon } from "./logos/KafkaIcon";
import { DockerIcon } from "./logos/DockerIcon";

export function ServiceNode(props: NodeProps<ServiceNodeData>) {
  const { data } = props;
  let icon;
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
    default:
      icon = DockerIcon;
  }

  const description =
    data.service.type === "generic"
      ? (data.service.image ?? "Generic Service")
      : data.service.type.toUpperCase();

  return (
    <>
      <BaseExecutionNode
        {...props}
        icon={icon}
        name={data.label}
        description={description}
      />
    </>
  );
}
