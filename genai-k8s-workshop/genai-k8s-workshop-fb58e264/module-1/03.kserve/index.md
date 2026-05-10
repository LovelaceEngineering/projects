---
kind: lesson

title: "Lab 3: KServe InferenceService"

description: |
  Deploy a model using the KServe InferenceService CRD.

name: kserve
slug: kserve

createdAt: 2026-04-23
updatedAt: 2026-04-24

playground:
  name: k3s
  machines:
  - name: dev-machine
    resources:
      cpuCount: 2
      ramSize: "4Gi"
  - name: cplane-01
  - name: node-01
    resources:
      cpuCount: 2
      ramSize: "4Gi"
  - name: node-02
    resources:
      cpuCount: 2
      ramSize: "4Gi"
  tabs:
  - kind: ide
  - kind: kexp
  - machine: dev-machine

tasks:
  init_setup:
    init: true
    machine: dev-machine
    user: root
    run: |
      #!/bin/bash
      set -euo pipefail
      while ! kubectl get nodes 2>/dev/null | grep -q " Ready"; do sleep 2; done
      curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash >/dev/null 2>&1
      kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.3/cert-manager.yaml >/dev/null 2>&1
      kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=120s >/dev/null 2>&1 || true
      kubectl delete runtimeclass nvidia 2>/dev/null || true
---
