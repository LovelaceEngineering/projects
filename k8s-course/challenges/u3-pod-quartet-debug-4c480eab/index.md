---
kind: challenge

title: "Il Quartetto dei Pod Rotti"

description: |
  Quattro Pod in stati di errore diversi attendono di essere riparati.
  CrashLoopBackOff, Pending, ImagePullBackOff, e OOMKilled: diagnostica e correggi
  ciascuno entro 30 minuti usando kubectl debug e describe.

categories:
- kubernetes

tags:
- debugging
- crashloopbackoff
- pod-lifecycle
- kubectl

difficulty: hard

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_broken_pods:
    init: true
    run: |
      # Pod 1: CrashLoopBackOff (exits immediately)
      kubectl run pod-crashloop --image=alpine:3.19 --restart=Never \
        -l challenge=quartet \
        -- /bin/sh -c "echo starting && exit 1" || true

      # Pod 2: Pending (resource requests too high)
      kubectl run pod-pending --image=nginx:alpine --restart=Never \
        -l challenge=quartet \
        --requests='memory=100Gi,cpu=50' || true

      # Pod 3: ImagePullBackOff (typo in image name)
      kubectl run pod-imagepull --image=nginxx:alpine --restart=Never \
        -l challenge=quartet || true

      # Pod 4: OOMKilled (memory limit too low)
      kubectl run pod-oom --image=polinux/stress --restart=Never \
        -l challenge=quartet \
        --limits='memory=16Mi' \
        -- stress --vm 1 --vm-bytes 64M --vm-hang 0 || true

  verify_crashloop_fixed:
    run: |
      # pod-crashloop-fixed should be Running
      STATUS=$(kubectl get pod pod-crashloop-fixed -o jsonpath='{.status.phase}' 2>/dev/null || echo "missing")
      [ "$STATUS" = "Running" ] || exit 1

  verify_pending_fixed:
    run: |
      # pod-pending-fixed should be Running (reduced resource requests)
      STATUS=$(kubectl get pod pod-pending-fixed -o jsonpath='{.status.phase}' 2>/dev/null || echo "missing")
      [ "$STATUS" = "Running" ] || exit 1

  verify_imagepull_fixed:
    run: |
      # pod-imagepull-fixed should be Running with correct image
      STATUS=$(kubectl get pod pod-imagepull-fixed -o jsonpath='{.status.phase}' 2>/dev/null || echo "missing")
      [ "$STATUS" = "Running" ] || exit 1
      IMAGE=$(kubectl get pod pod-imagepull-fixed -o jsonpath='{.spec.containers[0].image}' 2>/dev/null || echo "")
      echo "$IMAGE" | grep -q "nginx" || exit 1

  verify_oom_fixed:
    run: |
      # pod-oom-fixed should be Running with memory limit >= 96Mi
      STATUS=$(kubectl get pod pod-oom-fixed -o jsonpath='{.status.phase}' 2>/dev/null || echo "missing")
      [ "$STATUS" = "Running" ] || exit 1
      MEM_LIMIT=$(kubectl get pod pod-oom-fixed -o jsonpath='{.spec.containers[0].resources.limits.memory}' 2>/dev/null || echo "0")
      # Accept 96Mi, 128Mi, 256Mi, etc.
      echo "$MEM_LIMIT" | grep -qE "^[0-9]+(Gi|[1-9][0-9]{2,}Mi)" || exit 1
---

_Quattro Pod rotti, quattro problemi diversi. Diagnostica e ripara il quartetto entro 30 minuti._

---

## Scenario

Sei il nuovo SRE e il tuo primo giorno inizia con quattro Pod in stato di errore.
Ogni Pod rappresenta un problema classico che incontrerai in produzione.

```bash
kubectl get pods -l challenge=quartet
```

---

## Pod 1 — CrashLoopBackOff

Il Pod `pod-crashloop` crasha immediatamente all'avvio.

```bash
# Diagnostica
kubectl describe pod pod-crashloop
kubectl logs pod-crashloop
kubectl logs pod-crashloop --previous
```

Crea `pod-crashloop-fixed` con il comando corretto (non deve terminare subito):

```bash
kubectl run pod-crashloop-fixed --image=alpine:3.19 -- sleep 3600
```

::simple-task
---
:tasks: tasks
:name: verify_crashloop_fixed
---
#active
In attesa di `pod-crashloop-fixed` in stato Running...

#completed
CrashLoopBackOff risolto!
::

---

## Pod 2 — Pending

Il Pod `pod-pending` non viene schedulato.

```bash
kubectl describe pod pod-pending
# Cerca: "Insufficient cpu" o "Insufficient memory" in Events
```

Crea `pod-pending-fixed` con resource requests realistiche:

```bash
kubectl run pod-pending-fixed --image=nginx:alpine \
  --requests='cpu=100m,memory=64Mi' \
  --limits='cpu=200m,memory=128Mi'
```

::simple-task
---
:tasks: tasks
:name: verify_pending_fixed
---
#active
In attesa di `pod-pending-fixed` in stato Running...

#completed
Pod Pending risolto! Le resource requests erano troppo alte per i nodi disponibili.
::

---

## Pod 3 — ImagePullBackOff

Il Pod `pod-imagepull` non riesce a scaricare l'immagine.

```bash
kubectl describe pod pod-imagepull
# Cerca: "Failed to pull image" in Events
```

Crea `pod-imagepull-fixed` con il nome immagine corretto:

```bash
kubectl run pod-imagepull-fixed --image=nginx:alpine
```

::simple-task
---
:tasks: tasks
:name: verify_imagepull_fixed
---
#active
In attesa di `pod-imagepull-fixed` in stato Running con immagine nginx...

#completed
ImagePullBackOff risolto! Il nome immagine conteneva un typo.
::

---

## Pod 4 — OOMKilled

Il Pod `pod-oom` viene ucciso dal kernel per eccesso di memoria.

```bash
kubectl describe pod pod-oom
# Cerca: OOMKilled in lastState
kubectl get pod pod-oom -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'
```

Crea `pod-oom-fixed` con un memory limit adeguato:

```bash
kubectl run pod-oom-fixed --image=polinux/stress \
  --limits='memory=128Mi' \
  -- stress --vm 1 --vm-bytes 64M --vm-hang 0
```

::simple-task
---
:tasks: tasks
:name: verify_oom_fixed
---
#active
In attesa di `pod-oom-fixed` in stato Running con memory limit ≥ 96Mi...

#completed
OOMKilled risolto! Il memory limit era troppo basso per il carico di lavoro.
::
