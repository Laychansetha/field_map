#!/usr/bin/env python3
"""
Threaded local development and testing server for Ibis Rice Field Navigator.
Serves the 'public/' directory with proper MIME types for GeoJSON, PWA manifest, etc.
"""
import http.server
import socketserver
import os
import sys

PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(__file__), "public")

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".webmanifest"):
            return "application/manifest+json"
        if path.endswith(".geojson"):
            return "application/geo+json"
        if path.endswith(".json"):
            return "application/json"
        return super().guess_type(path)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def main():
    os.chdir(os.path.dirname(__file__))
    with ThreadedTCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
        print(f"=======================================================", flush=True)
        print(f"  IBIS RICE FIELD NAVIGATOR SERVER RUNNING", flush=True)
        print(f"  Local URL:   http://localhost:{PORT}", flush=True)
        print(f"  Serving dir: {DIRECTORY}", flush=True)
        print(f"=======================================================", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...", flush=True)

if __name__ == "__main__":
    main()
