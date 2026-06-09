#!/bin/sh
set -e

cd /app/backend
gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:5001 \
    --workers 2 \
    --timeout 120 &

nginx -g "daemon off;"
