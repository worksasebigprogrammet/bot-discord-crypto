#!/bin/bash
set -e

# ─── Variables ───────────────────────────────────────────────────────────────
EC2_USER="ubuntu"
REMOTE_DIR="/home/ubuntu/crypto-bot"

# Allow EC2_IP and PEM_KEY to come from environment or positional arguments
EC2_IP="${EC2_IP:-$1}"
PEM_KEY="${PEM_KEY:-$2}"

if [ -z "$EC2_IP" ] || [ -z "$PEM_KEY" ]; then
  echo "Usage: ./deploy.sh <EC2_IP> <PEM_KEY>"
  echo "  or set EC2_IP and PEM_KEY environment variables."
  exit 1
fi

SSH_CMD="ssh -i $PEM_KEY -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP"

echo "========================================="
echo " Deploying crypto-bot to $EC2_IP"
echo "========================================="

# ─── Step 1: Install dependencies locally ────────────────────────────────────
echo ""
echo "[Step 1/4] Installing local dependencies..."
npm install
echo "Local dependencies installed."

# ─── Step 2: Sync project files to EC2 ──────────────────────────────────────
echo ""
echo "[Step 2/4] Syncing files to EC2..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'data' \
  --exclude 'logs' \
  --exclude '.env' \
  -e "ssh -i $PEM_KEY -o StrictHostKeyChecking=no" \
  ./ "$EC2_USER@$EC2_IP:$REMOTE_DIR/"
echo "Files synced."

# ─── Step 3: Remote install & restart via PM2 ───────────────────────────────
echo ""
echo "[Step 3/4] Installing production dependencies and starting the bot..."
$SSH_CMD << EOF
  cd $REMOTE_DIR
  npm install --production
  pm2 delete crypto-bot || true
  pm2 start ecosystem.config.js
  pm2 save
EOF
echo "Bot started on remote server."

# ─── Step 4: Health check ────────────────────────────────────────────────────
echo ""
echo "[Step 4/4] Running health check..."
$SSH_CMD "pm2 list"

echo ""
echo "========================================="
echo " Deployment complete!"
echo " Server: $EC2_USER@$EC2_IP"
echo " Directory: $REMOTE_DIR"
echo "========================================="
