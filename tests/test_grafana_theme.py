"""Preference behavior isolated from Docker and real credentials."""
import importlib.util
from contextlib import redirect_stderr
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("grafana_theme", Path(__file__).resolve().parents[1] / "scripts/grafana_theme.py")
theme = importlib.util.module_from_spec(spec)
spec.loader.exec_module(theme)


class GrafanaThemeTests(unittest.TestCase):
    def test_preserves_other_preferences_and_second_run_does_not_write(self):
        preferences = {
            "/api/org/preferences": {"theme": "dark", "timezone": "America/Sao_Paulo", "homeDashboardUID": "saude-v01"},
            "/api/user/preferences": {"theme": "light", "weekStart": "monday", "language": "pt-BR"},
        }
        original = {path: dict(values) for path, values in preferences.items()}
        patches = []

        def request(method, path, payload=None):
            if method == "PATCH":
                patches.append((path, payload))
                preferences[path].update(payload)
            return dict(preferences[path])

        self.assertEqual(theme.configure_theme(request), 2)
        for path, values in original.items():
            self.assertEqual(preferences[path], {**values, "theme": "aubergine"})
        self.assertEqual([payload for _, payload in patches], [{"theme": "aubergine"}] * 2)
        self.assertEqual(theme.configure_theme(request), 0)
        self.assertEqual(len(patches), 2)

    def test_requires_readback_confirmation_and_propagates_api_failure(self):
        def ignored_patch(method, path, payload=None):
            return {"theme": "dark"}

        with self.assertRaisesRegex(RuntimeError, "não confirmou"):
            theme.configure_theme(ignored_patch)

        def unauthorized(method, path, payload=None):
            raise PermissionError("Authentication failed")

        with self.assertRaises(PermissionError):
            theme.configure_theme(unauthorized)

    def test_cli_does_not_print_authentication_details_on_failure(self):
        secret = "test-secret-that-must-not-be-printed"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("GRAFANA_PASSWORD=" + secret + "\n")
            errors = io.StringIO()
            with patch.object(theme, "ROOT", root), patch.object(theme.sys, "argv", ["grafana_theme.py"]), \
                    patch.object(theme, "grafana_request", side_effect=RuntimeError(secret)), redirect_stderr(errors):
                self.assertEqual(theme.main(), 1)
            self.assertNotIn(secret, errors.getvalue())
            self.assertIn("Não foi possível confirmar", errors.getvalue())


if __name__ == "__main__":
    unittest.main()
