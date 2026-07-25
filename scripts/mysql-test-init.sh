#!/usr/bin/env sh

set -eu

MYSQL_PWD=${MYSQL_ROOT_PASSWORD} mysql --protocol=socket --user=root <<'SQL'
CREATE DATABASE IF NOT EXISTS `ui_projects_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `ui_integration_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SQL
