ALTER TABLE `agent_token`
  ADD COLUMN `lastUsedAt` TIMESTAMP NULL,
  ADD COLUMN `revokedAt` TIMESTAMP NULL;

CREATE INDEX `agent_token_active_idx`
  ON `agent_token` (`userId`, `projectId`, `revokedAt`, `expiresAt`);
