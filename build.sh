#!/usr/bin/env bash
set -euo pipefail

IMAGE="hmip-hcu-homeconnect"
TAG="0.5.2"
PLATFORM="linux/arm64"
OUT="${IMAGE}-${TAG}.tar"
OUT_GZ="${OUT}.gz"

if ! docker buildx version >/dev/null 2>&1; then
    echo "ERROR: docker buildx is not available." ; exit 1
fi

if ! docker buildx inspect hcubuild >/dev/null 2>&1; then
    docker buildx create --name hcubuild --use >/dev/null
else
    docker buildx use hcubuild >/dev/null
fi

echo ">> Building ${IMAGE}:${TAG} for ${PLATFORM}"
docker buildx build --platform "${PLATFORM}" --tag "${IMAGE}:${TAG}" --load .

echo ">> Saving image to ${OUT}"
docker save "${IMAGE}:${TAG}" -o "${OUT}"

echo ">> Compressing to ${OUT_GZ}"
gzip -f "${OUT}"

echo ">> Done: $(pwd)/${OUT_GZ}"
echo "   Upload this file in HCUweb -> Plugins -> Install from file."


