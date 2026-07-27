"use client";

import {
  IconBrowser,
  IconCheck,
  IconCreditCard,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { ApacheKafkaIcon } from "@/modules/workflow/components/logos/KafkaIcon";
import { PostgreSQLIcon } from "@/modules/workflow/components/logos/PostgresIcon";
import styles from "../landing.module.css";

interface GraphNodeProps {
  category: string;
  className: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}

function GraphNode({
  category,
  className,
  description,
  icon: Icon,
  label,
}: GraphNodeProps) {
  return (
    <div className={cn(styles.graphNode, className)}>
      <div className={styles.nodeIcon}>
        <Icon aria-hidden="true" />
      </div>
      <div className={styles.nodeCopy}>
        <span>{category}</span>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <div className={styles.nodeStatus} aria-hidden="true">
        <span className={styles.statusStarting}>Starting…</span>
        <span className={styles.statusHealthy}>Healthy</span>
        <span className={styles.statusPassed}>Passed</span>
      </div>
    </div>
  );
}

export function LandingExecutionVisual() {
  return (
    <div
      className={styles.executionFrame}
      role="img"
      aria-label="An isolated payment service environment starts, becomes healthy, passes an end-to-end scenario, and is cleaned up."
    >
      <div className={styles.frameGlow} aria-hidden="true" />
      <div className={styles.frameHeader} aria-hidden="true">
        <div className={styles.windowControls}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.runIdentity}>
          <span className={styles.liveDot} />
          run / payment-smoke
        </div>
        <span className={styles.runNumber}>#0182</span>
      </div>

      <div className={styles.graph} aria-hidden="true">
        <div className={styles.graphGrid} />

        <svg
          className={styles.edges}
          viewBox="0 0 720 400"
          preserveAspectRatio="none"
        >
          <title>Service connections</title>
          <path
            className={styles.edge}
            pathLength="1"
            d="M184 198 C218 198 245 198 278 198"
          />
          <path
            className={styles.edge}
            pathLength="1"
            d="M452 198 C500 198 494 80 536 80"
          />
          <path
            className={styles.edge}
            pathLength="1"
            d="M452 198 C486 198 502 198 536 198"
          />
          <path
            className={styles.edge}
            pathLength="1"
            d="M452 198 C500 198 494 316 536 316"
          />

          <path
            className={cn(styles.packet, styles.packetPrimary)}
            pathLength="1"
            d="M184 198 C218 198 245 198 278 198"
          />
          <path
            className={cn(styles.packet, styles.packetDatabase)}
            pathLength="1"
            d="M452 198 C500 198 494 80 536 80"
          />
          <path
            className={cn(styles.packet, styles.packetKafka)}
            pathLength="1"
            d="M452 198 C486 198 502 198 536 198"
          />
          <path
            className={cn(styles.packet, styles.packetFraud)}
            pathLength="1"
            d="M452 198 C500 198 494 316 536 316"
          />
        </svg>

        <GraphNode
          className={cn(styles.nodeFrontend, styles.nodeDelayOne)}
          icon={IconBrowser}
          category="Application"
          label="Frontend"
          description="web:latest"
        />
        <GraphNode
          className={cn(styles.nodePayment, styles.nodeDelayTwo)}
          icon={IconCreditCard}
          category="Application"
          label="Payment API"
          description="payments:latest"
        />
        <GraphNode
          className={cn(styles.nodePostgres, styles.nodeDelayThree)}
          icon={PostgreSQLIcon}
          category="Data"
          label="PostgreSQL"
          description="postgres:17"
        />
        <GraphNode
          className={cn(styles.nodeKafka, styles.nodeDelayFour)}
          icon={ApacheKafkaIcon}
          category="Messaging"
          label="Kafka"
          description="kafka:4"
        />
        <GraphNode
          className={cn(styles.nodeFraud, styles.nodeDelayFive)}
          icon={IconShieldCheck}
          category="Application"
          label="Fraud Service"
          description="fraud:latest"
        />

        <div className={styles.scenarioRail}>
          <span className={styles.scenarioName}>Checkout scenario</span>
          <div className={styles.scenarioSteps}>
            {["Create payment", "Publish event", "Verify record"].map(
              (step, index) => (
                <span key={step} className={styles.scenarioStep}>
                  <IconCheck
                    className={cn(
                      styles.scenarioCheck,
                      styles[`check${index + 1}`],
                    )}
                  />
                  {step}
                </span>
              ),
            )}
          </div>
        </div>

        <div className={styles.cleanupBadge}>
          <span className={styles.cleanupCheck}>
            <IconCheck />
          </span>
          <div>
            <strong>Run passed</strong>
            <span>8 checks · environment cleaned up</span>
          </div>
        </div>
      </div>
    </div>
  );
}
