---
kind: unit
title: "Lab 5: Gateway API Inference Extension"
name: gateway-api-practice
---


# Lab 5: Gateway API Inference Extension

## Goal

Explore model-aware routing with the Gateway API Inference Extension — purpose-built CRDs that let gateways understand LLM workloads: token-based load balancing, LoRA adapter affinity, and criticality tiers.

## Background

Traditional load balancers treat all requests equally. LLM inference is different:
- Requests have wildly different costs (10 tokens vs 10,000 tokens)
- Some requests need specific LoRA adapters already loaded in memory
- Production traffic should preempt batch/exploratory traffic

The **Gateway API Inference Extension** adds two CRDs:
- **InferenceModel** — defines a model endpoint with criticality and routing rules
- **InferencePool** — groups model servers with selection criteria

## Steps

### 1. Install the CRDs

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: inferencemodels.inference.networking.x-k8s.io
spec:
  group: inference.networking.x-k8s.io
  names:
    kind: InferenceModel
    plural: inferencemodels
    singular: inferencemodel
  scope: Namespaced
  versions:
  - name: v1alpha2
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            x-kubernetes-preserve-unknown-fields: true
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: inferencepools.inference.networking.x-k8s.io
spec:
  group: inference.networking.x-k8s.io
  names:
    kind: InferencePool
    plural: inferencepools
    singular: inferencepool
  scope: Namespaced
  versions:
  - name: v1alpha2
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
```

Wait a few seconds for the CRDs to register:

```bash
sleep 5
```

### 2. Create an InferencePool

```bash
cat <<EOF | kubectl apply -f -
apiVersion: inference.networking.x-k8s.io/v1alpha2
kind: InferencePool
metadata:
  name: vllm-pool
spec:
  targetPortNumber: 8000
  selector:
    matchLabels:
      app: vllm
  extensionRef:
    name: vllm-endpoint-picker
EOF
```

### 3. Create InferenceModel resources

```bash
cat <<EOF | kubectl apply -f -
apiVersion: inference.networking.x-k8s.io/v1alpha2
kind: InferenceModel
metadata:
  name: tinyllama-prod
spec:
  modelName: TinyLlama/TinyLlama-1.1B-Chat-v1.0
  criticality: Critical
  poolRef:
    name: vllm-pool
---
apiVersion: inference.networking.x-k8s.io/v1alpha2
kind: InferenceModel
metadata:
  name: tinyllama-batch
spec:
  modelName: TinyLlama/TinyLlama-1.1B-Chat-v1.0
  criticality: Sheddable
  poolRef:
    name: vllm-pool
EOF
```

### 4. Explore the resources

```bash
kubectl get inferencemodel
kubectl get inferencepool
kubectl get inferencemodel tinyllama-prod -o yaml
```

### 5. Understand what the gateway does with this

In production (with Envoy/Istio/kgateway implementing the extension):

```
Client → Gateway → InferenceModel (criticality check) → InferencePool → vLLM pod
                    ↓
            - Critical requests: always served
            - Sheddable requests: shed under load
            - LoRA affinity: route to pod with adapter loaded
            - Token-aware: balance by estimated compute, not just request count
```

## What to Notice

- **InferenceModel** is the application developer's interface (model name + criticality)
- **InferencePool** is the platform team's interface (which pods, what port, what picker)
- This is the **same separation of concerns** as Gateway API itself (Gateway vs HTTPRoute)
- Implementations: Envoy Gateway, Istio, kgateway — all adding Inference Extension support

## Discussion

- Why can't a regular L7 load balancer handle LLM traffic? (Token cost variance, KV cache locality)
- How does criticality-based shedding prevent cascade failures?
- What does "LoRA affinity" mean? (Route requests to pods that already have the adapter in GPU memory)
