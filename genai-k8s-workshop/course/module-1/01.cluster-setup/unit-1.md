---
kind: unit
title: "Lab 1: Cluster Setup + Fake GPU Operator"
name: cluster-setup-practice
---


# Lab 1: Cluster Setup + Fake GPU Operator

## Goal

Stand up a Kubernetes cluster with emulated GPU resources. By the end, `kubectl get nodes` will show A100 GPUs available for scheduling.

## Steps

### 1. Verify your environment

The playground comes with a pre-configured k3s cluster. Check it's running:

```bash
kubectl get nodes
kubectl cluster-info
```

### 2. Install Helm (if not present)

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### 3. Install cert-manager

Many AI components need cert-manager for webhook certificates:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.3/cert-manager.yaml
kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=120s
```

### 4. Install fake-gpu-operator

This Helm chart makes your nodes advertise `nvidia.com/gpu` resources — no real hardware needed.

> **Note:** k3s ships with a built-in `nvidia` RuntimeClass that conflicts with fake-gpu-operator. Delete it first:

```bash
kubectl delete runtimeclass nvidia 2>/dev/null || true
```

Now install:

```bash
helm repo add fake-gpu-operator https://fake-gpu-operator.storage.googleapis.com
helm repo update
helm install fake-gpu-operator fake-gpu-operator/fake-gpu-operator \
  --namespace gpu-operator --create-namespace \
  --set topology.nodes[0].gpuModel=A100 \
  --set topology.nodes[0].gpuCount=4 \
  --set 'topology.nodes[0].nodeLabels.nvidia\.com/gpu\.product=A100'
```

The operator uses a `nodePoolLabelKey` to decide which nodes get GPUs. Label a worker node:

```bash
kubectl label node node-01 run.ai/simulated-gpu-node-pool=default
```

Wait for the device plugin to register:

```bash
sleep 15
```

### 5. Verify GPU resources

```bash
kubectl get node node-01 -o jsonpath='{.status.capacity.nvidia\.com/gpu}'
```

You should see `2` (or `4` depending on config). The GPUs are now schedulable.

### 6. Quick test — schedule a GPU pod

```bash
kubectl run gpu-test --image=busybox:1.36 --restart=Never \
  --overrides='{"spec":{"nodeSelector":{"run.ai/simulated-gpu-node-pool":"default"},"containers":[{"name":"gpu-test","image":"busybox:1.36","command":["sh","-c","echo Running with GPU && sleep 10"],"resources":{"limits":{"nvidia.com/gpu":1}}}]}}'
```

```bash
kubectl get pod gpu-test
kubectl describe pod gpu-test | grep -A3 "Limits"
```

The pod schedules and runs — the scheduler treats the emulated GPU as real.

```bash
kubectl delete pod gpu-test
```

## What Just Happened?

- Your cluster now has emulated A100 GPUs
- The Kubernetes scheduler allocates them like real hardware
- cert-manager is ready for KServe webhooks
- You're ready to deploy AI workloads!
