#!/bin/bash
# Obtain the first TLS certificate via certbot before starting nginx.
# Usage: DOMAIN=example.com EMAIL=you@example.com ./nginx/init-letsencrypt.sh

set -e

: "${DOMAIN:?Set DOMAIN before running this script}"
: "${EMAIL:?Set EMAIL before running this script}"

DATA_PATH="./certbot"

echo "### Creating dummy certificate for $DOMAIN …"
mkdir -p "$DATA_PATH/conf/live/$DOMAIN"
docker run --rm \
  -v "$DATA_PATH/conf:/etc/letsencrypt" \
  certbot/certbot \
  certonly --standalone \
    --agree-tos --no-eff-email \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    --staging   # remove --staging for a real cert

echo "### Done. Edit nginx/nginx.conf to replace \${DOMAIN} with your domain if needed, then:"
echo "    docker compose up -d --build"
