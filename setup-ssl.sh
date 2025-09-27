#!/bin/bash
# EDT SSL Setup Script

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔒 EDT SSL Configuration${NC}"
echo "========================"

# Install Nginx if not present
if ! command -v nginx > /dev/null 2>&1; then
    echo -e "${YELLOW}Installing Nginx...${NC}"
    sudo apt-get update
    sudo apt-get install -y nginx certbot python3-certbot-nginx
else
    echo -e "${GREEN}✅ Nginx already installed${NC}"
fi

# Create self-signed certificate for testing
echo -e "${BLUE}Creating self-signed certificate...${NC}"
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/edt.key \
    -out /etc/nginx/ssl/edt.crt \
    -subj "/C=US/ST=State/L=City/O=EDT/OU=IT/CN=5.78.72.160"

# Create Nginx configuration
echo -e "${BLUE}Configuring Nginx...${NC}"
sudo tee /etc/nginx/sites-available/edt > /dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name 5.78.72.160;

    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name 5.78.72.160;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/edt.crt;
    ssl_certificate_key /etc/nginx/ssl/edt.key;
    
    # Strong SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to EDT application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site and disable default
sudo ln -sf /etc/nginx/sites-available/edt /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
echo -e "${BLUE}Testing Nginx configuration...${NC}"
sudo nginx -t

# Restart Nginx
echo -e "${BLUE}Restarting Nginx...${NC}"
sudo service nginx restart

echo -e "${GREEN}✅ SSL configuration complete!${NC}"
echo ""
echo -e "${YELLOW}Access your application at:${NC}"
echo -e "  ${BLUE}https://5.78.72.160${NC} (with self-signed certificate warning)"
echo -e "  ${BLUE}http://5.78.72.160${NC} (will redirect to HTTPS)"
echo ""
echo -e "${YELLOW}Note: You'll see a certificate warning because it's self-signed.${NC}"
echo -e "${YELLOW}For production, use Let's Encrypt with a domain name.${NC}"