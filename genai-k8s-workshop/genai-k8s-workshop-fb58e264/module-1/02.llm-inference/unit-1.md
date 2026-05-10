---
kind: unit
title: "Lab 2: Deploy an LLM on Kubernetes"
name: llm-inference-practice
---


# Lab 2: Deploy an LLM on Kubernetes

## Goal

Deploy a real LLM inference endpoint on Kubernetes — no GPU needed. You'll send prompts and get actual AI-generated text back.

## Background

For this workshop, we use **Ollama** — a lightweight LLM runtime that handles model download, quantization, and serving in a single container (~700MB). In production you'd use **vLLM** (the dominant serving engine with PagedAttention, continuous batching, speculative decoding) — but its Docker image includes CUDA (~8GB) which is too large for a workshop playground.

**TinyLlama** is a 1.1B parameter model — small enough for CPU inference (~637MB download), smart enough to generate coherent text.

## Steps

### 1. Deploy Ollama

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm
spec:
  replicas: 1
  selector:
    matchLabels:
      app: llm
  template:
    metadata:
      labels:
        app: llm
    spec:
      containers:
      - name: ollama
        image: ollama/ollama:latest
        ports:
        - containerPort: 11434
        resources:
          requests:
            cpu: "1"
            memory: 2Gi
          limits:
            cpu: "2"
            memory: 4Gi
        readinessProbe:
          httpGet:
            path: /
            port: 11434
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: llm
spec:
  selector:
    app: llm
  ports:
  - port: 11434
    targetPort: 11434
EOF
```

### 2. Wait for it to be ready

```bash
kubectl rollout status deployment/llm --timeout=300s
```

### 3. Pull the TinyLlama model

```bash
POD=$(kubectl get pod -l app=llm -o jsonpath='{.items[0].metadata.name}')
kubectl exec $POD -c ollama -- ollama pull tinyllama
```

This downloads ~637MB. Wait for it to complete.

### 4. Test inference — interactive chat

```bash
kubectl exec -it $POD -c ollama -- ollama run tinyllama "What is Kubernetes? Answer in one sentence."
```

### 5. Test the API

```bash
kubectl port-forward svc/llm 11434:11434 &

curl -s http://localhost:11434/api/generate -d '{
  "model": "tinyllama",
  "prompt": "Kubernetes is great for AI because",
  "stream": false
}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('response','')[:300])"
```

### 6. Check the OpenAI-compatible API

Ollama also exposes an OpenAI-compatible endpoint:

```bash
curl -s http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tinyllama",
    "messages": [
      {"role": "system", "content": "You are a Kubernetes expert."},
      {"role": "user", "content": "What is DRA and why does it matter for AI?"}
    ],
    "max_tokens": 150
  }' | python3 -m json.tool
```

Kill the port-forward when done:
```bash
kill %1 2>/dev/null
```

## What to Notice

- Ollama implements the **OpenAI API spec** — any OpenAI client library works as a drop-in
- On CPU, inference is slow (~5-10 tokens/sec) vs GPU (~100+ tokens/sec) — but it works
- In production, you'd use **vLLM** for its performance optimizations (PagedAttention gives 2-4x throughput)
- The same pattern works with real GPUs: add GPU resources to the pod spec

## Production: vLLM vs Ollama

| Aspect | Ollama | vLLM |
| ------ | ------ | ---- |
| Image size | ~700MB | ~8GB (includes CUDA) |
| Best for | Dev, workshops, edge | Production GPU inference |
| Key feature | Simple, batteries-included | PagedAttention, continuous batching |
| API | OpenAI-compatible | OpenAI-compatible |
| GPU required | No (CPU fallback) | Recommended (CPU possible) |
