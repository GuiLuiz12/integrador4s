#!/usr/bin/env python3
"""Persist the built-in Grafana theme without exporting credentials."""
import base64
import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
THEME = "aubergine"
GRAFANA = "http://127.0.0.1:3001"


def configure_theme(request):
    """Patch only the theme, preserving unrelated organization/user preferences."""
    changed = 0
    for path in ("/api/org/preferences", "/api/user/preferences"):
        if request("GET", path).get("theme") == THEME:
            continue
        request("PATCH", path, {"theme": THEME})
        if request("GET", path).get("theme") != THEME:
            raise RuntimeError("O Grafana não confirmou a preferência de tema.")
        changed += 1
    return changed


def grafana_request(password):
    # Do not send local credentials through a proxy or follow API redirects.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    authorization = "Basic " + base64.b64encode(f"admin:{password}".encode()).decode()

    def request(method, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(GRAFANA + path, data=data, method=method,
                                     headers={"Authorization": authorization, "Content-Type": "application/json"})
        with opener.open(req, timeout=10) as response:
            result = json.load(response)
        if not isinstance(result, dict):
            raise ValueError("Resposta inválida das preferências do Grafana.")
        return result

    return request


def main():
    try:
        if len(sys.argv) != 1:
            raise ValueError("O comando não recebe argumentos.")
        env_file = ROOT / ".env"
        if env_file.is_symlink() or not env_file.is_file():
            raise ValueError("Configuração local inválida.")
        values = dict(line.split("=", 1) for line in env_file.read_text().splitlines()
                      if "=" in line and not line.lstrip().startswith("#"))
        password = values.get("GRAFANA_PASSWORD", "").strip()
        if not password:
            raise ValueError("Senha do Grafana ausente.")
        changed = configure_theme(grafana_request(password))
        print(f"[start] Tema Aubergine confirmado na organização e no administrador ({changed} alterações).")
        return 0
    except Exception:
        # HTTP errors and server responses must never expose authentication data.
        print("[start] Não foi possível confirmar o tema do Grafana. Confira o serviço e GRAFANA_PASSWORD no .env.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
