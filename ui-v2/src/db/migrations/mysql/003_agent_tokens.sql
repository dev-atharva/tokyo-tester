CREATE TABLE IF NOT EXISTS `agent_token` (
  `id` VARCHAR(255) PRIMARY KEY NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `tokenHash` VARCHAR(255) NOT NULL UNIQUE,
  `userId` VARCHAR(255) NOT NULL,
  `projectId` VARCHAR(255) NOT NULL,
  `scopes` TEXT NOT NULL,
  `expiresAt` TIMESTAMP NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_agent_token_user`
    FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_token_project`
    FOREIGN KEY (`projectId`) REFERENCES `project`(`id`) ON DELETE CASCADE
);

CREATE INDEX `agent_token_user_idx` ON `agent_token`(`userId`);
CREATE INDEX `agent_token_project_idx` ON `agent_token`(`projectId`);
