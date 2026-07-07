#!/bin/bash
# Dev server watchdog — restarts next dev if it dies
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting next dev..."
  node node_modules/.bin/next dev -p 3000 > dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] next dev exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done
