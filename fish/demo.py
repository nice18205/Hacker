from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import socket
import ssl
import subprocess
import webbrowser


ROOT = Path(__file__).resolve().parent
HOST = "0.0.0.0"
DEFAULT_HTTP_PORT = 8000
DEFAULT_HTTPS_PORT = 8443
CERT_DIR = ROOT / ".cert"
CERT_FILE = CERT_DIR / "demo-local.crt"
KEY_FILE = CERT_DIR / "demo-local.key"
OPENSSL_CONFIG = CERT_DIR / "openssl.cnf"


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Permissions-Policy",
            "accelerometer=(self), gyroscope=(self), magnetometer=(self)",
        )
        super().end_headers()


def find_free_port(host, start_port):
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind((host, port))
            except OSError:
                port += 1
                continue
            return port


def get_lan_ips():
    ips = set()
    hostname = socket.gethostname()
    for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
        ip = info[4][0]
        if not ip.startswith(("127.", "169.254.")):
            ips.add(ip)

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("8.8.8.8", 80))
            ip = probe.getsockname()[0]
            if not ip.startswith(("127.", "169.254.")):
                ips.add(ip)
        except OSError:
            pass

    return sorted(ips)


def ensure_certificate(lan_ips):
    alt_names = ["DNS.1 = localhost", "IP.1 = 127.0.0.1"]
    for index, ip in enumerate(lan_ips, start=2):
        alt_names.append(f"IP.{index} = {ip}")
    config_text = "\n".join(
        [
            "[req]",
            "distinguished_name = dn",
            "x509_extensions = v3_req",
            "prompt = no",
            "",
            "[dn]",
            "CN = 3d-gyro-demo.local",
            "",
            "[v3_req]",
            "subjectAltName = @alt_names",
            "",
            "[alt_names]",
            *alt_names,
            "",
        ]
    )

    if (
        CERT_FILE.exists()
        and KEY_FILE.exists()
        and OPENSSL_CONFIG.exists()
        and OPENSSL_CONFIG.read_text(encoding="utf-8") == config_text
    ):
        return

    CERT_DIR.mkdir(exist_ok=True)
    if CERT_FILE.exists():
        CERT_FILE.unlink()
    if KEY_FILE.exists():
        KEY_FILE.unlink()
    OPENSSL_CONFIG.write_text(config_text, encoding="utf-8")
    command = [
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        str(KEY_FILE),
        "-out",
        str(CERT_FILE),
        "-days",
        "365",
        "-config",
        str(OPENSSL_CONFIG),
    ]
    subprocess.run(command, check=True, cwd=str(ROOT), stdout=subprocess.DEVNULL)


def build_server(port, use_https, lan_ips):
    server = ThreadingHTTPServer((HOST, port), DemoHandler)
    if use_https:
        ensure_certificate(lan_ips)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def main():
    parser = argparse.ArgumentParser(description="Serve the 3D gyro fishing demo.")
    parser.add_argument("--http", action="store_true", help="Use plain HTTP instead of HTTPS.")
    parser.add_argument("--port", type=int, help="Preferred port.")
    args = parser.parse_args()

    use_https = not args.http
    lan_ips = get_lan_ips()
    preferred_port = args.port or (DEFAULT_HTTPS_PORT if use_https else DEFAULT_HTTP_PORT)
    port = find_free_port(HOST, preferred_port)
    scheme = "https" if use_https else "http"
    server = build_server(port, use_https, lan_ips)

    local_url = f"{scheme}://127.0.0.1:{port}/demo.html"
    print(f"Serving demo at {local_url}")
    for ip in lan_ips:
        print(f"Phone URL: {scheme}://{ip}:{port}/demo.html")
    if use_https:
        print("On the phone, accept the local certificate warning before enabling gyroscope.")
    else:
        print("HTTP mode is for desktop fallback; phone gyroscope usually requires HTTPS.")
    webbrowser.open(local_url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
