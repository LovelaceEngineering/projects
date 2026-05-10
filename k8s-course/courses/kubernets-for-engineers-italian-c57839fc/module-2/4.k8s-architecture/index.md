---
kind: lesson

title: L'Architettura di Kubernetes — Da Zero a Pod

description: |
  Control plane e worker node componente per componente. Ciclo di vita completo di un Pod.
  Debugging toolkit: CrashLoopBackOff, Pending, ImagePullBackOff. Chiamate dirette all'API server.

name: k8s-architecture
slug: incontro-3

createdAt: 2026-02-23
updatedAt: 2026-02-23

playground:
  name: k8s-omni
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Descrivere il ruolo di ogni componente del control plane e dei worker node
- Scrivere un Pod YAML con namespace, labels, sidecar e resource requests
- Diagnosticare i 3 stati di errore più comuni di un Pod (CrashLoopBackOff, Pending, ImagePullBackOff)
- Fare chiamate dirette all'API server Kubernetes via `curl` e interpretare le REST call

## Teoria (50 min)

### Il Control Plane

Il control plane è il "cervello" di Kubernetes. È composto da 4 componenti:

| Componente | Funzione |
|-----------|----------|
| **kube-apiserver** | Unico punto di accesso REST per tutte le operazioni; autentica, autorizza, valida |
| **etcd** | Database distribuito key-value; contiene tutto lo stato del cluster |
| **kube-scheduler** | Assegna Pod non schedulati a worker node disponibili |
| **kube-controller-manager** | Loop di controllo: Deployment, ReplicaSet, Node, Endpoint controller |

### I Worker Node

Ogni worker node ha 3 componenti principali:

| Componente | Funzione |
|-----------|----------|
| **kubelet** | Riceve PodSpec dall'apiserver; chiede al runtime di avviare i container |
| **kube-proxy** | Mantiene le regole iptables/ipvs per i Service |
| **CNI plugin** | Configura il networking del Pod (Flannel, Calico, Cilium...) |

### Ciclo di Vita di un Pod

```
kubectl apply → apiserver → etcd (PodSpec salvata)
                          → scheduler (assegna node)
                          → kubelet (avvia container)
                          → kubelet (aggiorna status)
```

Stati di un Pod: `Pending → ContainerCreating → Running → Succeeded/Failed`

### Debugging Toolkit

```bash
# Stato dei Pod
kubectl get pods -o wide --watch

# Log di un container
kubectl logs <pod> -c <container> --previous

# Esecuzione interattiva
kubectl exec -it <pod> -- /bin/sh

# Dettagli e eventi
kubectl describe pod <pod>

# Output raw YAML
kubectl get pod <pod> -o yaml
```

## Hands-on Guidato (90 min)

### Esercizio 1 — Il Primo Pod YAML

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp
  namespace: team-a
  labels:
    app: myapp
    environment: dev
spec:
  containers:
  - name: app
    image: nginx:alpine
    resources:
      requests:
        memory: "64Mi"
        cpu: "100m"
      limits:
        memory: "128Mi"
        cpu: "200m"
  - name: sidecar
    image: busybox:latest
    command: ["sh", "-c", "while true; do sleep 30; done"]
    resources:
      requests:
        memory: "16Mi"
        cpu: "10m"
```

### Esercizio 2 — Debugging dei Pod Rotti

Tre Pod con errori diversi da diagnosticare:

```bash
# CrashLoopBackOff — il container si avvia e crasha subito
kubectl logs <pod> --previous
kubectl describe pod <pod> | grep -A5 "Last State"

# Pending — nessun node disponibile
kubectl describe pod <pod> | grep -A10 "Events"
# → cerca "Insufficient cpu", "Unschedulable", "node selector mismatch"

# ImagePullBackOff — immagine non trovata o registry non accessibile
kubectl describe pod <pod> | grep -A5 "Failed"
# → controlla il nome dell'immagine, il tag, e i credentials
```

### Esercizio 3 — Interrogare l'API Server Direttamente

```bash
# Token del ServiceAccount default
TOKEN=$(kubectl create token default)

# Chiamata REST diretta
curl -k -H "Authorization: Bearer $TOKEN" \
  https://<apiserver-ip>:6443/api/v1/namespaces/default/pods

# Vedere le chiamate che fa kubectl
kubectl get pods -v=8 2>&1 | grep "GET\|POST\|PATCH"
```

## Capstone Challenge (30 min)

> **"Il Quartetto dei Pod Rotti"**
>
> 4 Pod sono in stato di errore nel namespace `broken-pods`.
> Ogni Pod ha un problema diverso da diagnosticare e risolvere:
> - Pod 1: resource request impossibile (CPU richiesta > nodo disponibile)
> - Pod 2: immagine con tag inesistente
> - Pod 3: container che esce con exit code 1 (bug nell'entrypoint)
> - Pod 4: namespace errato nelle labels (impatto sul Service selector)
>
> Target: tutti e 4 i Pod in `Running` entro 30 minuti.

## Self-Study Assignment

Completa le challenge su iximiuz Labs prima del prossimo incontro (60–90 min totali).
Cerca nella sezione Challenges della piattaforma: Pod lifecycle, DNS resolution,
scale & expose, e kubectl basics.
