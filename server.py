"""
Bangla Voice Recognition System - local launcher.

Serves this folder on http://localhost so the browser allows microphone
access, then opens the app in Google Chrome (or Edge / the default browser).

Usage:
    python server.py               # port 8000 (or the next free port)
    python server.py --port 9000
    python server.py --no-browser
"""
from __future__ import annotations

import argparse
import functools
import http.server
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows' registry sometimes maps .js to text/plain; be explicit.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".md": "text/plain; charset=utf-8",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # keep the console quiet
        pass


class Server(http.server.ThreadingHTTPServer):
    # On Windows SO_REUSEADDR lets two servers share a port; we want a clean
    # failure instead so we can move on to the next free port.
    allow_reuse_address = os.name != "nt"
    daemon_threads = True


def bind(port: int, attempts: int = 20) -> Server:
    handler = functools.partial(Handler, directory=str(ROOT))
    last_error: OSError | None = None
    for candidate in range(port, port + attempts):
        try:
            return Server(("127.0.0.1", candidate), handler)
        except OSError as exc:
            last_error = exc
    raise SystemExit(f"Could not find a free port between {port} and {port + attempts - 1}: {last_error}")


def find_browser() -> list[str] | None:
    """Return a command prefix for Chrome (best Bangla support), else Edge."""
    if sys.platform == "win32":
        candidates = []
        for env in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
            base = os.environ.get(env)
            if base:
                candidates.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")
        for env in ("PROGRAMFILES(X86)", "PROGRAMFILES"):
            base = os.environ.get(env)
            if base:
                candidates.append(Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
        for path in candidates:
            if path.is_file():
                return [str(path)]
    elif sys.platform == "darwin":
        if Path("/Applications/Google Chrome.app").exists():
            return ["open", "-a", "Google Chrome"]
    else:
        for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
            exe = shutil.which(name)
            if exe:
                return [exe]
    return None


def open_browser(url: str) -> None:
    command = find_browser()
    if command:
        try:
            subprocess.Popen(command + [url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except OSError:
            pass
    webbrowser.open(url)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Bangla Voice Recognition System locally.")
    parser.add_argument("--port", type=int, default=8000, help="port to listen on (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser window")
    args = parser.parse_args()

    server = bind(args.port)
    port = server.server_address[1]
    url = f"http://localhost:{port}/"

    print()
    print("  Bangla Voice Recognition System")
    print(f"  Running at:  {url}")
    print("  Use Google Chrome for the best Bangla recognition.")
    print("  Press Ctrl+C to stop.")
    print()

    if not args.no_browser:
        threading.Timer(0.6, open_browser, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("  Stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
