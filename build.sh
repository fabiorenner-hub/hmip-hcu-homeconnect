#!/usr/bin/env bash
set -euo pipefail

# Reads version from package.json so this script never goes stale.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"

IMAGE="hmip-hcu-homeconnect"
TAG="${VERSION}"
PLATFORM="linux/arm64"

DIST_DIR="${ROOT_DIR}/dist"
mkdir -p "${DIST_DIR}"

OUT="${DIST_DIR}/${IMAGE}-${TAG}.tar"
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

# Mirror the latest tarball into the repo root and remove older ones.
ROOT_NAME="$(basename "${OUT_GZ}")"
find "${ROOT_DIR}" -maxdepth 1 -name "${IMAGE}-*.tar.gz" -type f \
    ! -name "${ROOT_NAME}" -delete
cp -f "${OUT_GZ}" "${ROOT_DIR}/${ROOT_NAME}"

echo ">> Done:"
echo "   ${OUT_GZ}"
echo "   ${ROOT_DIR}/${ROOT_NAME}"
echo "   Upload this file in HCUweb -> Plugins -> Install from file."
