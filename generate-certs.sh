#!/bin/bash
# Generate self-signed SSL certificates for HTTPS

set -e

CERT_DIR="certs"
DOMAIN="5.78.72.160"
DAYS=365

echo "🔐 Generating self-signed SSL certificates..."

# Create certificate directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Generate private key
openssl genrsa -out "$CERT_DIR/server.key" 2048

# Generate certificate signing request with proper configuration
cat > "$CERT_DIR/openssl.conf" << EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = $DOMAIN

[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = $DOMAIN
IP.2 = 127.0.0.1
EOF

# Generate certificate
openssl req -new -x509 -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" -days $DAYS -config "$CERT_DIR/openssl.conf"

# Set proper permissions
chmod 600 "$CERT_DIR/server.key"
chmod 644 "$CERT_DIR/server.crt"

echo "✅ SSL certificates generated successfully!"
echo "   - Certificate: $CERT_DIR/server.crt"
echo "   - Private Key: $CERT_DIR/server.key"
echo "   - Valid for: $DAYS days"
