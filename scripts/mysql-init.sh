#!/usr/bin/env sh

set -eu

MYSQL_PWD=${MYSQL_ROOT_PASSWORD} mysql --protocol=socket --user=root <<'SQL'
CREATE DATABASE IF NOT EXISTS `tokyo_ui`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON `tokyo_ui`.* TO 'tokyo'@'%';
FLUSH PRIVILEGES;
SQL
