---
kind: course

title: "Generative AI in Kubernetes"

description: |
  A hands-on workshop covering the state-of-the-art for running generative AI
  workloads on Kubernetes. Deploy LLMs with Ollama, use KServe for model serving,
  explore GPU scheduling with fake-gpu-operator and DRA, configure Gateway API
  Inference Extension, and learn about KAITO and llm-d.
  All exercises run on CPU — no GPU required.

categories:
- kubernetes

tagz:
- ai
- inference
- gpu
- vllm
- kserve

createdAt: 2026-04-23
updatedAt: 2026-04-23

cover: __static__/cover.png
---

## Workshop Overview

**Duration:** 90 minutes
**Level:** Intermediate (comfortable with kubectl, YAML, Helm)
**Event:** Devoxx Greece 2026

### What You'll Build

Starting from a bare Kubernetes cluster, you'll build a complete AI inference platform:

| Lab | Topic |
|-----|-------|
| Lab 1 | Cluster Setup + fake-gpu-operator |
| Lab 2 | Deploy an LLM (Ollama + TinyLlama) |
| Lab 3 | KServe InferenceService |
| Lab 4 | GPU Scheduling & DRA |
| Lab 5 | Gateway API Inference Extension |
| Lab 6 | KAITO Workspace |
| Lab 7 | llm-d Disaggregated Inference |

### Author

**Alessandro Vozza** — Cloud Native architect, Golden Kubestronaut, KubeCon speaker
