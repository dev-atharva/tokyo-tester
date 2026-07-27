import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("inspect_repository.py")


class InspectRepositoryTests(unittest.TestCase):
    def test_discovers_relevant_evidence_without_secret_or_generated_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = {
                "Dockerfile": "FROM scratch\n",
                "package.json": '{"scripts":{"test":"vitest"}}\n',
                "compose.yaml": "services: {}\n",
                "services/api/openapi.yaml": "openapi: 3.1.0\n",
                "services/api/.env.example": "PORT=8080\n",
                "services/api/.env": "TOKEN=secret\n",
                "services/api/migrations/001_create.sql": "create table item(id int);\n",
                "services/api/handler_test.go": "package api\n",
                "node_modules/dependency/package.json": "{}\n",
                ".git/config": "[core]\n",
            }
            for relative, content in files.items():
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")

            completed = subprocess.run(
                [sys.executable, str(SCRIPT), str(root)],
                check=True,
                capture_output=True,
                text=True,
            )
            manifest = json.loads(completed.stdout)
            paths = [item["path"] for item in manifest["evidence"]]

            self.assertEqual(manifest["schemaVersion"], 1)
            self.assertEqual(paths, sorted(paths))
            self.assertIn("Dockerfile", paths)
            self.assertIn("services/api/openapi.yaml", paths)
            self.assertIn("services/api/.env.example", paths)
            self.assertIn("services/api/migrations/001_create.sql", paths)
            self.assertNotIn("services/api/.env", paths)
            self.assertNotIn("node_modules/dependency/package.json", paths)
            self.assertNotIn(".git/config", paths)
            self.assertFalse(manifest["truncated"])

    def test_file_budget_is_explicit_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ["c/package.json", "a/go.mod", "b/Dockerfile"]:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("test\n", encoding="utf-8")

            completed = subprocess.run(
                [sys.executable, str(SCRIPT), str(root), "--max-files", "2"],
                check=True,
                capture_output=True,
                text=True,
            )
            manifest = json.loads(completed.stdout)

            self.assertTrue(manifest["truncated"])
            self.assertEqual(manifest["filesVisited"], 2)
            self.assertLessEqual(len(manifest["evidence"]), 2)


if __name__ == "__main__":
    unittest.main()
