---
kind: unit
title: "Lab 3: KServe InferenceService"
name: kserve-practice
---


# Lab 3: KServe InferenceService

## Goal

Deploy a model using KServe — the Kubernetes-native model serving platform. Compare the experience: one CRD gives you autoscaling, canary rollouts, and a standardized API.

## Background

**KServe** (CNCF project) sits above inference engines like vLLM/Ollama, providing:
- **InferenceService CRD** — declarative model deployment
- **Autoscaling** — scale to zero or based on request concurrency
- **Canary rollouts** — A/B test model versions
- **Multi-framework** — supports HuggingFace, PyTorch, TensorFlow, ONNX, vLLM, etc.

## Steps

### 1. Install KServe

> **Note:** We use `--server-side` to avoid the annotation size limit on large CRDs.

```bash
kubectl apply --server-side -f https://github.com/kserve/kserve/releases/download/v0.14.1/kserve.yaml
echo "Waiting for KServe controller..."
kubectl wait --for=condition=Available deployment --all -n kserve --timeout=180s
```

Now install the cluster resources (runtimes, storage containers):

```bash
kubectl apply --server-side -f https://github.com/kserve/kserve/releases/download/v0.14.1/kserve-cluster-resources.yaml
echo "✅ KServe installed"
```

### 2. Deploy an InferenceService

```bash
cat <<EOF | kubectl apply -f -
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
  name: tiny-llm
spec:
  predictor:
    model:
      modelFormat:
        name: huggingface
      runtime: kserve-huggingfaceserver
      storageUri: "hf://facebook/opt-125m"
      resources:
        requests:
          cpu: "1"
          memory: 2Gi
        limits:
          cpu: "2"
          memory: 4Gi
EOF
```

> We use `facebook/opt-125m` (125M params) — it loads faster than TinyLlama via KServe's HuggingFace runtime.

### 3. Wait for it to be ready

```bash
kubectl get inferenceservice tiny-llm --watch
```

Wait for `READY: True`. This may take 2-3 minutes (image pull + model download).

### 4. Send a prediction

```bash
kubectl port-forward svc/tiny-llm-predictor 8080:80 &

curl -s http://localhost:8080/v1/models/tiny-llm:predict \
  -d '{"instances": ["Kubernetes enables AI workloads by"]}' | python3 -m json.tool

kill %1 2>/dev/null
```

### 5. Compare: KServe vs raw deployment

Look at what KServe gave you for free:

```bash
# The InferenceService status
kubectl get inferenceservice tiny-llm -o yaml | grep -A10 "status:"

# Underlying pods KServe created
kubectl get pods -l serving.kserve.io/inferenceservice=tiny-llm
```

## What to Notice

- **6 lines of YAML** vs the 40+ line raw Deployment — KServe handles the plumbing
- KServe **standardizes the API** — same predict endpoint regardless of framework
- In production: `canaryTrafficPercent: 10` gives you safe model rollouts
- KServe supports **scale-to-zero** — idle models consume no resources

## Ollama/vLLM vs KServe — When to Use What?

| Aspect | Raw vLLM/Ollama | KServe |
| ------ | --------------- | ------ |
| Control | Full — you own everything | Managed — KServe handles routing, scaling |
| Autoscaling | DIY (HPA + custom metrics) | Built-in (concurrency, RPS, GPU%) |
| Multi-model | One deployment per model | InferenceGraph, ModelMesh |
| Best for | High-perf single-model | Multi-model platform teams |
