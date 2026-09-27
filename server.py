#!/usr/bin/env python3
"""
IRCC Enterprise Traceability & Field Management Platform Server.
Serves the FastAPI backend API and the static PWA frontend on port 8080.
"""
import os
import sys

PORT = 8080

def main():
    os.chdir(os.path.dirname(__file__))
    print("=======================================================", flush=True)
    print("  IRCC ENTERPRISE TRACEABILITY & FIELD PLATFORM", flush=True)
    print(f"  Local Web App: http://localhost:{PORT}", flush=True)
    print(f"  API Swagger:   http://localhost:{PORT}/docs", flush=True)
    print(f"  Health Check:  http://localhost:{PORT}/api/v1/health", flush=True)
    print("=======================================================", flush=True)
    
    try:
        import uvicorn
        uvicorn.run("backend.app.main:app", host="0.0.0.0", port=PORT, reload=False)
    except Exception as e:
        print(f"Starting fallback HTTP server due to: {e}", flush=True)
        import http.server
        import socketserver
        directory = os.path.join(os.path.dirname(__file__), "public")
        
        class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=directory, **kwargs)
            def end_headers(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-cache")
                super().end_headers()
                
        with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
            httpd.serve_forever()

if __name__ == "__main__":
    main()
