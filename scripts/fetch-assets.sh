#!/bin/sh
set -e
cd "$(dirname "$0")/.."
mkdir -p public/models
rm -rf public/wasm
cp -r node_modules/@mediapipe/tasks-vision/wasm public/wasm
curl -sSfL -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
