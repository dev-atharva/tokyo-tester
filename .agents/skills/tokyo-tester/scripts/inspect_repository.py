#!/usr/bin/env python3
"""Emit a deterministic, secret-safe manifest of workflow-authoring evidence."""

import argparse
import json
import os
import sys
from pathlib import Path, PurePosixPath
from typing import Dict, List, Optional


PRUNED_DIRECTORIES = {
    ".git",
    ".next",
    ".turbo",
    ".venv",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
}
SAFE_ENV_FILES = {".env.example", ".env.sample", ".env.template"}
MANIFEST_FILES = {
    "build.gradle",
    "build.gradle.kts",
    "cargo.toml",
    "go.mod",
    "makefile",
    "package.json",
    "pom.xml",
    "pyproject.toml",
    "requirements.txt",
}
COMPOSE_FILES = {
    "compose.yaml",
    "compose.yml",
    "docker-compose.yaml",
    "docker-compose.yml",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List repository files that may provide Tokyo Tester workflow evidence."
    )
    parser.add_argument("root", nargs="?", default=".", help="repository or workspace root")
    parser.add_argument(
        "--max-files",
        type=int,
        default=10_000,
        help="maximum files to visit before reporting a truncated manifest (default: 10000)",
    )
    args = parser.parse_args()
    if args.max_files < 1 or args.max_files > 200_000:
        parser.error("--max-files must be between 1 and 200000")
    return args


def classify(relative: PurePosixPath) -> Optional[str]:
    name = relative.name
    lower_name = name.lower()
    lower_parts = [part.lower() for part in relative.parts]

    if lower_name in SAFE_ENV_FILES:
        return "environment-template"
    if lower_name == ".env" or lower_name.startswith(".env."):
        return None
    if lower_name == "dockerfile" or lower_name.startswith("dockerfile."):
        return "container-build"
    if lower_name in COMPOSE_FILES:
        return "service-topology"
    if lower_name in MANIFEST_FILES:
        return "build-manifest"
    if lower_name in {"openapi.json", "openapi.yaml", "openapi.yml", "swagger.json", "swagger.yaml", "swagger.yml"}:
        return "api-contract"
    if any(part in {"migration", "migrations"} for part in lower_parts[:-1]):
        return "database-migration"
    if (
        lower_name.endswith("_test.go")
        or lower_name.startswith("test_") and lower_name.endswith(".py")
        or lower_name.endswith((".spec.js", ".spec.jsx", ".spec.ts", ".spec.tsx", ".test.js", ".test.jsx", ".test.ts", ".test.tsx"))
    ):
        return "test"
    return None


def relative_path(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def inspect(root: Path, max_files: int) -> Dict[str, object]:
    evidence: List[Dict[str, object]] = []
    repository_roots = set()
    files_visited = 0
    truncated = False

    if (root / ".git").exists():
        repository_roots.add(".")

    for current_text, directory_names, file_names in os.walk(root, followlinks=False):
        current = Path(current_text)
        if ".git" in directory_names:
            repository_roots.add(relative_path(root, current) or ".")
        directory_names[:] = sorted(
            name for name in directory_names if name not in PRUNED_DIRECTORIES
        )
        for file_name in sorted(file_names):
            if files_visited >= max_files:
                truncated = True
                break
            files_visited += 1
            path = current / file_name
            if path.is_symlink():
                continue
            relative = PurePosixPath(relative_path(root, path))
            category = classify(relative)
            if category is None:
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            evidence.append({"category": category, "path": relative.as_posix(), "sizeBytes": size})
        if truncated:
            break

    evidence.sort(key=lambda item: str(item["path"]))
    return {
        "schemaVersion": 1,
        "root": ".",
        "repositoryRoots": sorted(repository_roots),
        "filesVisited": files_visited,
        "truncated": truncated,
        "evidence": evidence,
    }


def main() -> int:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        print(f"error: repository root is not a directory: {root}", file=sys.stderr)
        return 2
    json.dump(inspect(root, args.max_files), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
