# MCP connection and authorization

The skill and MCP server solve different problems. The skill is local, readable guidance; MCP is the remote, authenticated interface to Tokyo Tester. Installing the skill does not transmit repository contents or grant access.

## Connect

Use the MCP URL shown in Tokyo Tester's **Agent setup** page.

- In OAuth mode, add the per-project URL to an MCP client and complete the provider's browser authorization flow. The access token must be issued for that exact MCP resource.
- In controlled self-hosted mode, create a short-lived project token and configure it as an `Authorization: Bearer ...` header. Store it only in the MCP client's secret/config facility and revoke it when no longer needed.

Do not paste tokens into prompts, workflow bundles, source files, shell history, logs, or exported artifacts.

## Scopes

- `read`: projects, workflows, capabilities, validation, run status, and diagnostics.
- `workflow:write`: revisions and workflow imports.
- `run`: workflow execution.

Tokyo Tester also enforces the user's current project role. A token cannot elevate a user's permissions.

## Fail safely

- `401`: authorization is missing, expired, revoked, or for the wrong project. Ask the user to reconnect.
- `403`: the token or project role lacks a required scope. Explain which operation is unavailable.
- Validation tool error: repair only the reported fields, then validate again.
- Execution tool error: retrieve diagnostics, preserve evidence, and propose the smallest repair before asking to rerun.

Never switch projects, import, restore, or execute merely to test a connection. Use `tokyo_list_projects` as the safe connection check.
