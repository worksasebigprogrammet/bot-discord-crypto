#!/bin/bash
set -e

echo "========================================="
echo " Initial Server Setup for crypto-bot"
echo "========================================="

# ─── Install Node.js 18 LTS via nvm ─────────────────────────────────────────
echo ""
echo "[1/6] Installing Node.js 18 LTS via nvm..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 18
nvm use 18
nvm alias default 18
echo "Node.js $(node -v) installed."

# ─── Install PM2 globally ───────────────────────────────────────────────────
echo ""
echo "[2/6] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u "$USER" --hp "$HOME" || true
echo "PM2 installed."

# ─── Install nginx ──────────────────────────────────────────────────────────
echo ""
echo "[3/6] Installing nginx..."
sudo apt-get update -y
sudo apt-get install -y nginx
sudo systemctl enable nginx
echo "nginx installed and enabled."

# ─── Configure nginx reverse proxy ──────────────────────────────────────────
echo ""
echo "[4/6] Configuring nginx reverse proxy for port 3000..."
sudo tee /etc/nginx/sites-available/crypto-bot > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/crypto-bot /etc/nginx/sites-enabled/crypto-bot
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
echo "nginx configured."

# ─── Set up UFW firewall ────────────────────────────────────────────────────
echo ""
echo "[5/6] Configuring UFW firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
echo "UFW firewall configured (ports 22, 80, 443 open)."

# ─── Create application directories ─────────────────────────────────────────
echo ""
echo "[6/6] Creating log and data directories..."
mkdir -p /home/ubuntu/crypto-bot/logs
mkdir -p /home/ubuntu/crypto-bot/data
echo "Directories created."

echo ""
echo "========================================="
echo " Setup complete!"
echo " Node.js: $(node -v)"
echo " npm:     $(npm -v)"
echo " PM2:     $(pm2 -v)"
echo "========================================="
