---
kind: unit
title: "Lab 4: GPU Scheduling & DRA"
name: gpu-dra-practice
---


# Lab 4: GPU Scheduling & DRA

## Goal

Explore how Kubernetes schedules GPU workloads using fake-gpu-operator, then see how DRA (Dynamic Resource Allocation) evolves the model with expressive, CEL-based device claims.

## Part A: GPU Scheduling in Action

You installed fake-gpu-operator in Lab 1. Now let's push it.

### 1. Check GPU capacity

```bash
kubectl get node node-01 -o jsonpath='GPU capacity: {.status.capacity.nvidia\.com/gpu}'
echo ""
```

### 2. Deploy a GPU-hungry workload

Let's request more GPU pods than we have GPUs:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gpu-greedy
spec:
  replicas: 6
  selector:
    matchLabels:
      app: gpu-greedy
  template:
    metadata:
      labels:
        app: gpu-greedy
    spec:
      nodeSelector:
        run.ai/simulated-gpu-node-pool: default
      containers:
      - name: worker
        image: busybox:1.36
        command: ["sh", "-c", "echo 'GPU worker running' && sleep 300"]
        resources:
          limits:
            nvidia.com/gpu: 1
EOF
```

### 3. Watch the scheduling

```bash
sleep 10
kubectl get pods -l app=gpu-greedy
```

Some pods run immediately. The rest stay **Pending** — the scheduler correctly enforces GPU limits, even with emulated hardware.

```bash
kubectl describe pod $(kubectl get pods -l app=gpu-greedy --field-selector=status.phase=Pending -o name | head -1) | grep -A3 Events
```

Look for: `Insufficient nvidia.com/gpu`

### 4. Clean up

```bash
kubectl delete deployment gpu-greedy
```

## Part B: DRA — The Future of Device Allocation

The old device-plugin model is one-dimensional: "give me N GPUs." DRA replaces it with expressive claims.

### 5. Old way vs new way

**Old (Device Plugins):**
```yaml
resources:
  limits:
    nvidia.com/gpu: 1   # "Give me a GPU. Any GPU."
```

**New (DRA with CEL):**
```yaml
spec:
  devices:
    requests:
    - name: gpu
      exactly:
        deviceClassName: gpu.nvidia.com
        allocationMode: ExactCount
        count: 1
        selectors:
        - cel:
            expression: >
              device.attributes["gpu.nvidia.com"].productName == "H100"
```

### 6. Check DRA API availability

```bash
kubectl api-resources | grep resource.k8s.io
```

### 7. Apply a DRA ResourceClaim

```bash
cat <<EOF | kubectl apply -f -
apiVersion: resource.k8s.io/v1
kind: ResourceClaim
metadata:
  name: training-gpu
spec:
  devices:
    requests:
    - name: gpu
      exactly:
        deviceClassName: gpu.nvidia.com
        allocationMode: ExactCount
        count: 1
        selectors:
        - cel:
            expression: 'device.attributes["gpu.nvidia.com"].productName == "H100"'
EOF
```

```bash
kubectl get resourceclaim training-gpu -o yaml
```

The claim stays **Pending** — no DRA driver is installed (that requires the real NVIDIA DRA driver, donated to CNCF at KubeCon EU 2026). The point is seeing the API.

### 8. Apply a topology-aware claim

```bash
cat <<EOF | kubectl apply -f -
apiVersion: resource.k8s.io/v1
kind: ResourceClaim
metadata:
  name: distributed-training
spec:
  devices:
    requests:
    - name: gpu-pair
      exactly:
        deviceClassName: gpu.nvidia.com
        allocationMode: ExactCount
        count: 2
    constraints:
    - requests: ["gpu-pair"]
      matchAttribute: "gpu.nvidia.com/numa-node"
EOF
```

This says: "give me 2 GPUs on the same NUMA node" — something device-plugins could never express.

## What to Notice

- **Part A** proved GPU scheduling is a resource accounting problem — the scheduler doesn't need real hardware
- **Part B** showed DRA's expressive power — CEL selectors, topology constraints, device classes
- DRA is the **first MUST requirement** in the CNCF AI Conformance Program
- NVIDIA donated the GPU DRA driver to CNCF (March 2026) — this is going mainstream

## Discussion

- Why did the community move from device-plugins to DRA?
- How does DRA enable multi-tenant GPU sharing vs MIG?
- What attributes would you select for in a production training job?
