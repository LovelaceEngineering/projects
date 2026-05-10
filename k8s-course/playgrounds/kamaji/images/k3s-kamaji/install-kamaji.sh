#!/usr/bin/env bash
# First-boot installer for the Kamaji playground mgmt node.
# Runs once (idempotent) as a systemd oneshot after k3s is up.
set -euo pipefail

MARKER=/var/lib/kamaji-bootstrap.done
[[ -f $MARKER ]] && exit 0

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Wait for k3s API to respond
until kubectl get --raw=/readyz >/dev/null 2>&1; do sleep 2; done

# cert-manager (prerequisite of Kamaji)
helm upgrade --install cert-manager /opt/kamaji/charts/cert-manager-*.tgz \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true --wait --timeout 5m

# Kamaji
helm upgrade --install kamaji /opt/kamaji/charts/kamaji-*.tgz \
  --namespace kamaji-system --create-namespace --wait --timeout 5m

kubectl wait --for=condition=Available deploy/kamaji \
  -n kamaji-system --timeout=180s

# laborant kubeconfig
install -d -o laborant -g laborant /home/laborant/.kube
install -o laborant -g laborant -m 0600 \
  /etc/rancher/k3s/k3s.yaml /home/laborant/.kube/config

touch "$MARKER"
