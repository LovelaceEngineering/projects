---
kind: unit
title: "Lab 6: KAITO Workspace"
name: kaito-practice
---


# Lab 6: KAITO — Kubernetes AI Toolchain Operator

## Goal

Deploy KAITO and create a Workspace CRD — see how one manifest replaces the 6+ steps you did in Labs 1-2 (cluster setup, GPU provisioning, model download, deployment, service, scaling).

## Background

**KAITO** (CNCF Sandbox) is the Kubernetes AI Toolchain Operator from Microsoft. It automates:
1. GPU node provisioning (via Node Autoprovision on cloud)
2. Model download from a curated catalog
3. Inference server deployment (vLLM, transformers, etc.)
4. Service creation and health checks
5. Scaling and updates

**One CRD** — the `Workspace` — replaces all of that.

## Steps

### 1. Install KAITO CRDs

```bash
kubectl apply -f https://raw.githubusercontent.com/kaito-project/kaito/main/config/crd/bases/kaito.sh_workspaces.yaml 2>/dev/null || \
cat <<EOF | kubectl apply -f -
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: workspaces.kaito.sh
spec:
  group: kaito.sh
  names:
    kind: Workspace
    plural: workspaces
    singular: workspace
  scope: Namespaced
  versions:
  - name: v1alpha1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            x-kubernetes-preserve-unknown-fields: true
          status:
            type: object
            x-kubernetes-preserve-unknown-fields: true
    subresources:
      status: {}
EOF

sleep 3
```

### 2. Create a KAITO Workspace

This is what a real KAITO deployment looks like — one CRD:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: kaito.sh/v1alpha1
kind: Workspace
metadata:
  name: llama3-inference
spec:
  resource:
    instanceType: "Standard_NC24ads_A100_v4"
    labelSelector:
      matchLabels:
        apps: llama3
    count: 1
  inference:
    preset:
      name: "llama-3-8b-instruct"
    adapters:
    - source:
        name: "custom-lora"
        image: "ghcr.io/my-org/lora-adapter:v1"
EOF
```

### 3. Examine the Workspace

```bash
kubectl get workspace llama3-inference -o yaml
```

Notice what you declared:
- **Instance type** — KAITO provisions the right GPU node
- **Preset name** — KAITO knows how to download and serve Llama 3 8B
- **LoRA adapter** — custom fine-tuned weights, pulled from an OCI image

### 4. Compare: manual vs KAITO

**Manual (what you did in Labs 1-3):**
```
1. Create cluster          ← you did this
2. Install GPU operator    ← you did this
3. Label/taint GPU nodes   ← you did this
4. Pull model weights      ← you did this
5. Write Deployment YAML   ← you did this
6. Create Service          ← you did this
7. Configure readiness     ← you did this
```

**KAITO:**
```
1. Apply Workspace CRD     ← done
```

### 5. Explore the model catalog

KAITO ships with presets for popular models:

| Preset | Model | GPU Memory |
|--------|-------|------------|
| `llama-3-8b-instruct` | Meta Llama 3 8B | 1x A100 (80GB) |
| `phi-4` | Microsoft Phi-4 | 1x A100 (40GB) |
| `mistral-7b-instruct` | Mistral 7B | 1x A100 (40GB) |
| `falcon-40b` | TII Falcon 40B | 2x A100 (80GB) |
| `deepseek-r1` | DeepSeek R1 | 4x A100 (80GB) |

## What to Notice

- KAITO is **cloud-aware** — it provisions GPU nodes via cloud APIs (AKS Node Autoprovision, Karpenter)
- The Workspace CRD is the **application developer's interface** — no GPU/infra knowledge needed
- KAITO now integrates with **Gateway API Inference Extension** for smart routing (Lab 5!)
- On non-cloud clusters (like this workshop): KAITO falls back to existing nodes with matching labels

## Discussion

- How does KAITO compare to KServe? (KAITO handles infrastructure + model; KServe handles serving + scaling)
- Could you combine them? (Yes — KAITO can use KServe as its serving backend)
- What about fine-tuning? (KAITO supports `tuning:` spec for QLoRA/LoRA)
