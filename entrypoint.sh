#!/bin/sh
set -e

# A bind-mounted ./uploads is created by Docker as root; make it writable for the app
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads
  find /app/uploads ! -user nextjs -exec chown nextjs:nodejs {} +
  exec su-exec nextjs "$0" "$@"
fi

# Start Next.js
echo "Starting Next.js..."
exec node server.js
