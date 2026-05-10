---
kind: unit
title: "Lab 7: llm-d Disaggregated Inference"
name: llm-d-practice
---


# Lab 7: llm-d — Disaggregated Inference

## Goal

Understand llm-d's disaggregated inference architecture — separating prefill and decode phases across different GPU pools — and explore its Kubernetes-native CRDs.

## Background

Traditional LLM serving runs both phases on the same GPU:
1. **Prefill** — process the entire input prompt (compute-heavy, parallel)
2. **Decode** — generate tokens one at a time (memory-heavy, sequential)

These phases have opposite hardware profiles:
- Prefill wants **high FLOPS** (fast matrix multiply)
- Decode wants **high memory bandwidth** (fast KV cache access)

**llm-d** (Red Hat, CNCF Sandbox candidate) disaggregates them:

```
                    ┌──────────────┐
  Request ────────► │   Router     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
    ┌─────────────────┐     ┌─────────────────┐
    │  Prefill Pool   │     │  Decode Pool    │
    │  (high FLOPS)   │────►│  (high BW)      │
    │  H100 SXM       │ KV  │  A100 / L40     │
    └─────────────────┘cache└─────────────────┘
```

**Results:** 2-3x throughput improvement, better GPU utilization, independent scaling.

## Steps

### 1. Explore the llm-d architecture

llm-d consists of:
- **Router** — receives requests, sends prompts to prefill, tokens to decode
- **Prefill Pool** — vLLM instances optimized for prompt processing
- **Decode Pool** — vLLM instances optimized for token generation
- **KV Cache Transfer** — moves attention state from prefill to decode (RDMA/NVLink)
- **Gateway API Inference Extension** — for model-aware routing (Lab 5!)

### 2. Apply llm-d CRDs

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: llmdconfigs.llm-d.ai
spec:
  group: llm-d.ai
  names:
    kind: LLMDConfig
    plural: llmdconfigs
    singular: llmdconfig
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
EOF

sleep 3
```

### 3. Create an llm-d deployment manifest

This is what a production llm-d deployment looks like:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: llm-d.ai/v1alpha1
kind: LLMDConfig
metadata:
  name: llama3-disaggregated
spec:
  model:
    name: meta-llama/Llama-3-70B-Instruct
    tensorParallelism: 4
  prefill:
    replicas: 2
    resources:
      limits:
        nvidia.com/gpu: 4
    vllmArgs:
      - "--max-model-len=8192"
      - "--enforce-eager"
  decode:
    replicas: 4
    resources:
      limits:
        nvidia.com/gpu: 2
    vllmArgs:
      - "--max-model-len=8192"
      - "--enable-chunked-prefill=false"
  router:
    replicas: 2
    strategy: "least-kv-cache"
  kvCacheTransfer:
    method: "nixTransport"
    port: 14579
EOF
```

### 4. Examine the manifest

```bash
kubectl get llmdconfig llama3-disaggregated -o yaml
```

Key architectural decisions in this spec:
- **Prefill**: 2 replicas × 4 GPUs = 8 GPUs dedicated to prompt processing
- **Decode**: 4 replicas × 2 GPUs = 8 GPUs dedicated to token generation
- **Router**: `least-kv-cache` strategy — route to the decode instance with the most available KV cache memory
- **KV Transfer**: NixTransport (RDMA-based, low-latency cache transfer between pools)

### 5. Compare: monolithic vs disaggregated

```bash
echo "=== Monolithic (Lab 2) ==="
echo "All phases on same pod"
echo "GPU utilization: ~40-60%"
echo "Scaling: replicas of full model"
echo ""
echo "=== Disaggregated (llm-d) ==="
echo "Prefill and decode on separate pods"
echo "GPU utilization: ~80-95%"
echo "Scaling: independent per phase"
echo "Benefit: 2-3x throughput at same cost"
```

## Architecture Deep Dive

### Why disaggregate?

| Phase | Duration | Hardware Need | Bottleneck |
|-------|----------|---------------|------------|
| Prefill | 100-500ms | Compute (FLOPS) | Matrix multiply |
| Decode | 1-30s | Memory bandwidth | KV cache reads |

In monolithic serving, a GPU doing prefill can't do decode (and vice versa). This means:
- During prefill: memory bandwidth is wasted
- During decode: compute FLOPS are wasted
- **Net GPU utilization: 40-60%**

Disaggregation lets you:
- Size prefill pool for compute (fewer, faster GPUs)
- Size decode pool for memory (more, bandwidth-optimized GPUs)
- Scale each independently based on actual load
- **Net GPU utilization: 80-95%**

### llm-d + Gateway API Inference Extension

llm-d uses the same InferencePool/InferenceModel from Lab 5:

```yaml
# The router registers as an InferencePool endpoint picker
apiVersion: inference.networking.x-k8s.io/v1alpha2
kind: InferencePool
metadata:
  name: llm-d-pool
spec:
  targetPortNumber: 8000
  selector:
    matchLabels:
      llm-d.ai/role: router
  extensionRef:
    name: llm-d-router    # ← llm-d's smart router
```

The gateway routes to llm-d's router, which then dispatches to prefill/decode pools. End-to-end model-aware routing from internet to GPU.

## What to Notice

- llm-d is **Kubernetes-native** — built on Deployments, Services, and Gateway API
- It uses **vLLM** under the hood for both prefill and decode
- KV cache transfer is the hard problem — RDMA/NVLink matters at scale
- This is where the industry is heading for 100B+ parameter models

## Discussion

- When is disaggregation worth the complexity? (>13B params, >100 QPS)
- How does KV cache transfer work across nodes? (RDMA, NixTransport, TCP fallback)
- Could you run prefill on cheaper GPUs than decode? (Yes — that's the point!)
