#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [ ! -f Dockerfile ]; then
  echo "Dockerfile is required for runtime verification."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to verify the production container."
  exit 1
fi

if ! grep -Eq '^USER[[:space:]]+nextjs$' Dockerfile; then
  echo "Dockerfile must switch to the non-root nextjs user."
  exit 1
fi

image_tag="picreature:guardrail-check"
container_name="picreature-guardrail-$$"

docker build -t "$image_tag" .

container_id="$(docker run -d --rm --name "$container_name" -e GEMINI_API_KEY=guardrail-test -p 127.0.0.1::3000 "$image_tag")"
cleanup() {
  docker rm -f "$container_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT

host_port="$(docker port "$container_id" 3000/tcp | awk -F: 'NR==1 {print $NF}')"
if [ -z "$host_port" ]; then
  echo "Unable to determine published container port."
  exit 1
fi

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${host_port}/api/health" >/dev/null; then
    exit 0
  fi
  sleep 1
done

echo "Container health endpoint did not become ready."
docker logs "$container_id" || true
exit 1
