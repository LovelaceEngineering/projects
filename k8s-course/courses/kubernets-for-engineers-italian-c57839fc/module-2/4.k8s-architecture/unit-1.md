---
kind: unit

title: "Incontro 3 — L'Architettura di Kubernetes: Da Zero a Pod"

name: k8s-architecture-teoria

tutorials:
  kubernetes-vs-virtual-machines: {}
---

> **Playground per questo incontro:** usa il playground Kubernetes multi-nodo su iximiuz Labs:
> **https://labs.iximiuz.com/playgrounds/k8s-omni**
> — oppure il playground kube-apiserver per esplorare l'API direttamente:
> **https://labs.iximiuz.com/playgrounds/kube-apiserver-e52fd50a**

---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Descrivere il ruolo di ogni componente del control plane e dei worker node
- Spiegare come un Pod viene creato: dal `kubectl apply` all'avvio del container
- Scrivere Pod YAML con namespace, labels, sidecar, init container e resource requests/limits
- Diagnosticare i 3 stati di errore più comuni: CrashLoopBackOff, Pending, ImagePullBackOff
- Fare chiamate dirette all'API server Kubernetes via `curl` e `kubectl -v=8`

---

## Teoria (50 min)

### L'Architettura di Kubernetes

Kubernetes separa nettamente due responsabilità: il **control plane** (il cervello) e i **worker node** (i muscoli).

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CONTROL PLANE                                │
│                                                                      │
│  ┌─────────────────┐  ┌───────┐  ┌────────────┐  ┌──────────────┐  │
│  │ kube-apiserver  │  │ etcd  │  │ scheduler  │  │ controller   │  │
│  │ (REST API)      │◄►│(state)│  │            │  │ manager      │  │
│  └────────┬────────┘  └───────┘  └─────┬──────┘  └──────┬───────┘  │
│           │                            │                 │          │
└───────────┼────────────────────────────┼─────────────────┼──────────┘
            │ Watch/List (gRPC)          │                 │
            ▼                            ▼                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         WORKER NODE                                  │
│                                                                      │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────────────────────┐  │
│  │  kubelet │  │ kube-proxy │  │ CNI plugin (Flannel/Calico/...)  │  │
│  └────┬─────┘  └────────────┘  └─────────────────────────────────┘  │
│       │                                                              │
│       ▼                                                              │
│  containerd → runc → Container Processes                            │
└──────────────────────────────────────────────────────────────────────┘
```

### Il Control Plane: Componente per Componente

#### kube-apiserver — L'Unico Punto di Accesso

`kube-apiserver` è l'**unico componente** che scrive su etcd. Tutto passa da qui.

Funzioni principali:
- **Autenticazione**: chi sei? (certificati X.509, token Bearer, OIDC)
- **Autorizzazione**: cosa puoi fare? (RBAC)
- **Admission Control**: il manifest è valido? (webhook mutanti e validanti)
- **Serializzazione**: converte tra versioni API (v1, apps/v1, autoscaling/v2)

```bash
# Vedi le API disponibili nel cluster
kubectl api-resources
kubectl api-versions

# Guarda le chiamate REST che fa kubectl internamente
kubectl get pods -v=8 2>&1 | grep -E "GET|POST|PATCH|Response"

# Chiama l'API direttamente con curl
APISERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
TOKEN=$(kubectl create token default --duration=1h)

# Lista Pod nel namespace default
curl -k -H "Authorization: Bearer $TOKEN" \
     "$APISERVER/api/v1/namespaces/default/pods" | jq '.items[].metadata.name'

# Osserva eventi in tempo reale (long-polling watch)
curl -k -H "Authorization: Bearer $TOKEN" \
     "$APISERVER/api/v1/namespaces/default/pods?watch=true" | jq .
```

#### etcd — Il Database del Cluster

`etcd` è un database key-value **distribuito e consistente** (algoritmo Raft).
Contiene tutto lo stato del cluster: ogni Pod, Service, ConfigMap, Secret.

```bash
# Su un nodo del control plane, ispeziona etcd direttamente
ETCDCTL_API=3 etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/pods/default/ --prefix --keys-only

# Leggi un Pod raw da etcd (proto encoding)
ETCDCTL_API=3 etcdctl ... \
  get /registry/pods/default/myapp | strings | head -30
```

**Importante:** etcd è il componente più critico del cluster. Se etcd va giù, tutto si ferma.
Le scritture diventano impossibili; le letture servite dalla cache dell'apiserver continuano.

#### kube-scheduler — L'Assegnatore di Nodi

Lo scheduler osserva i Pod con `spec.nodeName: ""` e sceglie su quale nodo schedularli.
Processo in due fasi:

1. **Filtering** (predicate): elimina nodi non idonei (risorse insufficienti, taints, node selector)
2. **Scoring** (priority): assegna un punteggio ai nodi rimanenti (bilanciamento, affinità)

```bash
# Simula lo scheduling senza creare il Pod
kubectl get nodes -o custom-columns=NAME:.metadata.name,CPU:.status.allocatable.cpu,MEM:.status.allocatable.memory

# Guarda perché un Pod non è schedulato
kubectl describe pod <pending-pod> | grep -A 20 "Events:"
# → "0/3 nodes are available: 3 Insufficient cpu" → riduci requests
# → "0/3 nodes are available: 3 node(s) had taint...Toleration not found"
```

#### kube-controller-manager — I Loop di Controllo

Il controller manager esegue **decine di controller** in un unico processo.
Ogni controller implementa un **reconciliation loop**: osserva lo stato attuale, lo confronta
con quello desiderato, e agisce per ridurre la differenza.

```
Loop di controllo (semplificato):
  while true:
    desired = read from apiserver (desired state, persisted in etcd)
    actual  = read from apiserver (actual state, aggiornato dal kubelet via apiserver)
    if desired != actual:
      take_action()  # il controller agisce sull'apiserver, mai su etcd direttamente
```

Controller principali:
- **Deployment controller**: crea/aggiorna ReplicaSet quando cambia un Deployment
- **ReplicaSet controller**: crea/elimina Pod per mantenere il numero di repliche
- **Node controller**: monitora i nodi e imposta `NotReady` se kubelet non risponde
- **Endpoints controller**: aggiorna la lista di IP dei Pod per ogni Service
- **Job controller**: crea Pod per completare Job e li traccia fino al termine

---

### I Worker Node

#### kubelet — L'Agente del Nodo

Il kubelet è l'agente che gira su **ogni nodo** (incluso il control plane in kubeadm).
Responsabilità:
- Registra il nodo con l'apiserver
- Osserva i PodSpec assegnati al proprio nodo
- Chiede al container runtime di avviare/fermare container
- Aggiorna lo stato del Pod nell'apiserver
- Esegue liveness/readiness/startup probe

```bash
# Status kubelet
systemctl status kubelet
journalctl -u kubelet --since "5 minutes ago"

# Configurazione kubelet
cat /var/lib/kubelet/config.yaml

# Pod statici (avviati direttamente senza apiserver)
ls /etc/kubernetes/manifests/
# → etcd.yaml  kube-apiserver.yaml  kube-controller-manager.yaml  kube-scheduler.yaml
```

#### kube-proxy — Le Regole di Network

`kube-proxy` mantiene sincronizzate le regole iptables (o ipvs) per implementare i Service.
Quando un Service viene creato/modificato, kube-proxy aggiorna le regole su ogni nodo.

```bash
# Verifica modalità kube-proxy
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode

# Vedi le chain iptables create da kube-proxy
iptables -t nat -L KUBE-SERVICES -n --line-numbers | head -20

# Con ipvs (più efficiente per cluster grandi)
ipvsadm -Ln | head -30
```

---

### Il Ciclo di Vita di un Pod: Passo per Passo

```
kubectl apply -f pod.yaml
      │
      ▼
1. kubectl → apiserver: POST /api/v1/namespaces/default/pods
             apiserver: autentica → autorizza → admission → valida
             apiserver → etcd: WRITE pod (nodeName: "")
      │
      ▼
2. scheduler: WATCH /api/v1/pods?fieldSelector=spec.nodeName=
              scoring/filtering → sceglie node1
              apiserver → etcd: PATCH pod (nodeName: "node1")
      │
      ▼
3. kubelet su node1: WATCH /api/v1/pods?fieldSelector=spec.nodeName=node1
                     legge PodSpec
                     chiama containerd via CRI: RunPodSandbox + CreateContainer + StartContainer
      │
      ▼
4. CNI plugin: configura network namespace (veth, bridge, IP)
      │
      ▼
5. runc: crea namespaces (pid, net, mnt, uts, ipc), applica cgroups, pivot_root, exec
      │
      ▼
6. kubelet: aggiorna status.phase = Running, status.podIP, status.conditions
      │
      ▼
7. Endpoint controller: aggiorna Endpoints del Service → Pod pronto per traffico
```

**Stati di un Pod:**

| Status | Significato |
|--------|-------------|
| `Pending` | PodSpec ricevuta, container non ancora avviati (scheduling, pull immagine) |
| `ContainerCreating` | Runtime sta avviando i container |
| `Running` | Almeno un container in esecuzione |
| `Succeeded` | Tutti i container terminati con exit code 0 |
| `Failed` | Almeno un container terminato con exit code ≠ 0 |
| `Unknown` | kubelet non risponde (nodo non raggiungibile) |

**Condizioni del Pod (status.conditions):**

| Condition | True quando... |
|-----------|----------------|
| `PodScheduled` | Scheduler ha assegnato il nodo |
| `Initialized` | Tutti gli init container completati |
| `ContainersReady` | Tutti i container passano la readiness probe |
| `Ready` | Pod pronto a ricevere traffico |

---

### API Versioning e Deprecation Policy

Le API Kubernetes seguono un ciclo di maturità:

| Livello | Esempio | Stabilità | Deprecation |
|---------|---------|-----------|-------------|
| **Alpha** | `v1alpha1` | Può cambiare/sparire senza preavviso | Nessuna garanzia |
| **Beta** | `v1beta1` | Testata, cambiamenti minimi | Almeno 3 release di preavviso |
| **Stable (GA)** | `v1`, `apps/v1` | Stabile, backward-compatible | Garanzia di lunga durata |

```bash
# Vedi tutte le versioni API disponibili nel cluster
kubectl api-versions

# Vedi le risorse per un API group specifico
kubectl api-resources --api-group=apps

# Controlla se una risorsa ha versioni deprecate
kubectl get --raw /apis/flowcontrol.apiserver.k8s.io/ | jq '.versions'
```

Quando Kubernetes depreca un'API (es. `extensions/v1beta1` Ingress → `networking.k8s.io/v1`), i manifest vecchi smettono di funzionare dopo la rimozione. Usa `kubectl convert` (plugin) per migrare:

```bash
# Installa il plugin convert
kubectl krew install convert

# Converti un manifest dalla versione vecchia alla nuova
kubectl convert -f old-ingress.yaml --output-version networking.k8s.io/v1
```

> **Tip:** prima di un upgrade del cluster, controlla sempre le [release notes](https://kubernetes.io/releases/) per API rimosse nella nuova versione.

---

### Pod YAML: Struttura Completa

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp
  namespace: production
  labels:
    app: myapp
    version: "1.2.3"
    tier: backend
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
spec:
  # Init container: eseguito prima dei container principali, in ordine
  initContainers:
  - name: db-migration
    image: myapp-migrations:1.2.3
    envFrom:
    - secretRef:
        name: db-credentials

  containers:
  # Container principale
  - name: app
    image: myapp:1.2.3
    ports:
    - name: http
      containerPort: 8080
      protocol: TCP
    resources:
      requests:
        memory: "128Mi"   # Usato dallo scheduler per trovare il nodo
        cpu: "100m"       # 100 millicpu = 0.1 CPU core
      limits:
        memory: "256Mi"   # OOM kill se superato
        cpu: "500m"       # throttled se superato (non killato)
    # Probe di startup: deve SUPERARE PRIMA che readiness e liveness vengano attivate.
    # Finché startupProbe non ha successo, le altre probe sono sospese.
    # Un init container che fallisce blocca la condizione "Initialized" e impedisce l'avvio.
    # Ordine di esecuzione: startupProbe → (readinessProbe || livenessProbe in parallelo)
    startupProbe:
      httpGet:
        path: /startup
        port: 8080
      failureThreshold: 30    # 30 tentativi = max 5 minuti di startup
      periodSeconds: 10
    # Probe di readiness: rimuove il Pod dagli Endpoints se fail (traffico non instradato)
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 10
      failureThreshold: 3
    # Probe di liveness: riavvia il container se fail (app bloccata)
    livenessProbe:
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 30
      periodSeconds: 30
      failureThreshold: 3
    env:
    - name: LOG_LEVEL
      value: "info"
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: password

  # Sidecar container: log shipper
  - name: log-shipper
    image: fluent/fluent-bit:2.2
    resources:
      requests:
        memory: "32Mi"
        cpu: "10m"
    volumeMounts:
    - name: app-logs
      mountPath: /var/log/app

  volumes:
  - name: app-logs
    emptyDir: {}

  # Rimpatria il Pod nel namespace se il servizio account viene eliminato
  restartPolicy: Always

  # Graceful shutdown: aspetta X secondi prima di SIGKILL
  terminationGracePeriodSeconds: 30
```

### Resource Requests, Limits e QoS Classes

```
QoS Class       Condizione                          Comportamento OOM
──────────       ──────────                          ─────────────────
Guaranteed      requests == limits (CPU e RAM)      Ultimo a essere killato
Burstable       requests < limits (almeno uno)      Killato se nodo sotto pressione
BestEffort      nessun request/limit configurato    Primo a essere killato
```

```bash
# Vedi la QoS class di un Pod
kubectl get pod myapp -o jsonpath='{.status.qosClass}'

# Vedi i cgroup del container per i limiti reali
# sul nodo, trova il PID del container
cat /sys/fs/cgroup/kubepods/burstable/pod<uid>/<container-id>/memory.max
cat /sys/fs/cgroup/kubepods/burstable/pod<uid>/<container-id>/cpu.max
```

---

### Graceful Shutdown: Il Flusso Completo

Quando un Pod viene terminato (`kubectl delete pod`, scaling down, rolling update), Kubernetes segue una sequenza precisa:

```
1. apiserver marca il Pod come "Terminating"
   │
   ├─→ Endpoint controller RIMUOVE il Pod dagli Endpoints del Service
   │   (il Pod smette di ricevere nuovo traffico)
   │
   └─→ kubelet invia SIGTERM al container (PID 1)
         │
         ├─→ Se definito: esegue preStop hook PRIMA di SIGTERM
         │
         ├─→ Il container ha terminationGracePeriodSeconds (default: 30s)
         │   per completare il graceful shutdown
         │
         └─→ Allo scadere del grace period: SIGKILL (kill forzato)
```

**Race condition critica:** la rimozione dagli Endpoints e l'invio di SIGTERM avvengono **in parallelo**. Questo significa che per un breve periodo il Pod sta facendo shutdown ma può ancora ricevere traffico (kube-proxy non ha ancora aggiornato le iptables).

**Soluzione: preStop sleep**

```yaml
spec:
  terminationGracePeriodSeconds: 60
  containers:
  - name: app
    lifecycle:
      preStop:
        exec:
          command: ["sh", "-c", "sleep 5"]
    # Il preStop sleep dà tempo a kube-proxy di aggiornare le regole
    # iptables PRIMA che l'app inizi lo shutdown
```

```bash
# Verifica il grace period di un Pod
kubectl get pod myapp -o jsonpath='{.spec.terminationGracePeriodSeconds}'

# Forza la terminazione immediata (salta il grace period)
kubectl delete pod myapp --grace-period=0 --force
```

> **Best practice:** configura sempre un `preStop` sleep di 3-5 secondi per applicazioni che ricevono traffico HTTP. Questo elimina le richieste 502/503 durante i rolling update.

---

### Finalizers: Controllo sulla Cancellazione degli Oggetti

I **finalizers** sono stringhe nel campo `metadata.finalizers` che **bloccano la cancellazione** di un oggetto Kubernetes finché un controller non le rimuove. Sono il meccanismo con cui Kubernetes garantisce pulizia ordinata delle risorse dipendenti.

#### Come Funzionano

```
1. kubectl delete namespace production
2. API server imposta metadata.deletionTimestamp (l'oggetto è "in fase di cancellazione")
3. L'oggetto NON viene cancellato finché metadata.finalizers non è vuoto
4. I controller che hanno registrato un finalizer:
   a. Eseguono la loro logica di cleanup
   b. Rimuovono il proprio finalizer dalla lista
5. Quando la lista è vuota → l'oggetto viene effettivamente cancellato
```

#### Esempi Comuni

| Finalizer | Chi lo usa | Cosa fa |
|-----------|-----------|--------|
| `kubernetes.io/pv-protection` | PV controller | Impedisce la cancellazione di PV in uso |
| `kubernetes.io/pvc-protection` | PVC controller | Impedisce la cancellazione di PVC montati |
| `foregroundDeletion` | Garbage collector | Aspetta che i figli siano cancellati prima del padre |
| `external-dns` | ExternalDNS | Rimuove i record DNS prima di cancellare il Service |
| `finalizer.argocd.argoproj.io` | ArgoCD | Pulisce le risorse managed prima di cancellare l'Application |

```yaml
# Esempio: un PVC con finalizer di protezione
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-postgres-0
  namespace: production
  finalizers:
  - kubernetes.io/pvc-protection    # ← blocca la cancellazione se montato
  deletionTimestamp: "2026-04-29T08:00:00Z"   # ← cancellazione richiesta ma bloccata
status:
  phase: Bound
```

#### Troubleshooting: Oggetti Bloccati in "Terminating"

Il problema più comune con i finalizer è un **namespace o oggetto bloccato in Terminating**.
Succede quando il controller responsabile del finalizer non è in esecuzione o ha un bug.

```bash
# Diagnostica: vedi quali finalizer bloccano la cancellazione
kubectl get namespace stuck-namespace -o json | jq '.spec.finalizers'
kubectl get pvc stuck-pvc -o json | jq '.metadata.finalizers'

# Vedi tutti gli oggetti con deletionTimestamp (in fase di cancellazione)
kubectl get all -n stuck-namespace -o json | \
  jq '.items[] | select(.metadata.deletionTimestamp) | {kind: .kind, name: .metadata.name, finalizers: .metadata.finalizers}'
```

**Risoluzione (da usare con cautela):**

```bash
# Rimuovi finalizer da un singolo oggetto (PATCH)
kubectl patch pvc stuck-pvc -n production \
  --type='json' -p='[{"op": "remove", "path": "/metadata/finalizers"}]'

# Rimuovi finalizer da un namespace bloccato
# ⚠️ ATTENZIONE: questo bypassa il cleanup! Le risorse cloud dipendenti
# (load balancer, dischi, DNS) potrebbero restare orfane.
kubectl get namespace stuck-namespace -o json | \
  jq '.spec.finalizers = []' | \
  kubectl replace --raw "/api/v1/namespaces/stuck-namespace/finalize" -f -
```

> **⚠️ Rimuovere un finalizer manualmente è l'equivalente di un `kill -9`:**
> il cleanup non viene eseguito. Usalo solo quando hai già verificato che le risorse
> esterne sono state pulite o quando il controller è irrecuperabile.

---

### Debugging Toolkit Completo

#### CrashLoopBackOff

```bash
# 1. Guarda i log dell'ultima esecuzione (--previous)
kubectl logs <pod> --previous
kubectl logs <pod> -c <container> --previous

# 2. Descrizione con exit code e segnale
kubectl describe pod <pod> | grep -A 10 "Last State:"
# Exit Code 1  → errore applicazione
# Exit Code 137 → SIGKILL (OOM o kill esterno)
# Exit Code 139 → SIGSEGV (segfault)
# Exit Code 143 → SIGTERM (graceful shutdown non completato)

# 3. Avvia un container identico manualmente per debuggare
kubectl debug <pod> -it --copy-to=debug-pod --image=busybox
```

#### Pending

```bash
# Guarda gli eventi dello scheduler
kubectl describe pod <pod> | grep -A 20 "Events:"

# Causa comune: resource request troppo alta
kubectl describe node | grep -A 5 "Allocated resources"

# Causa comune: nessun nodo con le label richieste
kubectl get nodes --show-labels | grep -i <label>

# Causa comune: taint non tollerato
kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints
```

#### ImagePullBackOff / ErrImagePull

```bash
kubectl describe pod <pod> | grep -A 5 "Failed"
# → "Failed to pull image: pull access denied" → imagePullSecret mancante
# → "manifest unknown" → tag inesistente
# → "context deadline exceeded" → registry irraggiungibile (firewall, DNS)

# Verifica l'imagePullSecret
kubectl get secret regcred -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d | jq
```

---

## Hands-on Guidato (90 min)

### Esercizio 1 — Esplorare l'Architettura

```bash
# Componenti del control plane
kubectl get pods -n kube-system
kubectl get componentstatuses  # (deprecated ma informativo)

# Chi è il leader (in setup HA)
kubectl get lease -n kube-system

# Componenti su ogni nodo
kubectl get nodes -o wide
kubectl describe node <node> | grep -A 20 "Allocated resources"

# StaticPod: vedi i manifest usati da kubelet
ssh controlplane cat /etc/kubernetes/manifests/kube-apiserver.yaml | \
  grep -E "image:|--.*="
```

### Esercizio 2 — Pod con Probe, Resources e Sidecar

Crea un Pod con:
- Container principale (nginx) con readiness e liveness probe
- Sidecar (busybox) che scrive file di log
- Init container che aspetta che un Service sia disponibile
- Resource requests e limits configurati

```yaml
# Applica il seguente YAML:
apiVersion: v1
kind: Pod
metadata:
  name: webserver
  namespace: default
  labels:
    app: webserver
spec:
  initContainers:
  - name: wait-for-config
    image: busybox:1.36
    command: ['sh', '-c', 'echo "Config ready" > /config/ready; sleep 1']
    volumeMounts:
    - name: shared
      mountPath: /config

  containers:
  - name: nginx
    image: nginx:alpine
    resources:
      requests:
        memory: "64Mi"
        cpu: "100m"
      limits:
        memory: "128Mi"
        cpu: "200m"
    readinessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 5
    livenessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 15
      periodSeconds: 20
    volumeMounts:
    - name: shared
      mountPath: /usr/share/nginx/html/config

  - name: log-watcher
    image: busybox:1.36
    command: ['sh', '-c', 'while true; do echo "$(date): nginx alive"; sleep 10; done']
    resources:
      requests:
        memory: "16Mi"
        cpu: "10m"

  volumes:
  - name: shared
    emptyDir: {}
```

```bash
kubectl apply -f webserver-pod.yaml

# Monitora il ciclo di vita
kubectl get pod webserver -w

# Verifica le probe
kubectl describe pod webserver | grep -A 5 "Readiness\|Liveness"

# Vedi i log di entrambi i container
kubectl logs webserver -c nginx
kubectl logs webserver -c log-watcher

# Entra nel container principale
kubectl exec -it webserver -c nginx -- sh
```

### Esercizio 3 — Diagnosticare 4 Pod Rotti

```bash
kubectl create namespace broken-pods

# Pod 1: CrashLoopBackOff (exit code 1)
kubectl run crash1 -n broken-pods --image=busybox -- sh -c "echo 'starting'; exit 1"
kubectl logs crash1 -n broken-pods --previous

# Pod 2: ImagePullBackOff
kubectl run imgfail -n broken-pods --image=nginx:nonexistent-tag-xyz
kubectl describe pod imgfail -n broken-pods | grep -A 5 Events

# Pod 3: Pending (resource request eccessiva)
kubectl apply -n broken-pods -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: toomuch
spec:
  containers:
  - name: app
    image: nginx
    resources:
      requests:
        cpu: "9999"
        memory: "9999Gi"
EOF
kubectl describe pod toomuch -n broken-pods | grep -A 10 Events

# Pod 4: OOMKilled (memory limit troppo bassa)
kubectl apply -n broken-pods -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: memhog
spec:
  containers:
  - name: app
    image: stress:latest
    args: ["--vm", "1", "--vm-bytes", "256M"]
    resources:
      limits:
        memory: "10Mi"
EOF
# → exit code 137 (SIGKILL da OOM killer del kernel)
kubectl describe pod memhog -n broken-pods | grep -A 5 "Last State"
```

### Esercizio 4 — API Server via curl

```bash
APISERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CACERT=$(kubectl config view --minify --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d > /tmp/ca.crt && echo /tmp/ca.crt)
TOKEN=$(kubectl create token default --duration=1h)

# Lista tutti i namespace
curl -s --cacert $CACERT -H "Authorization: Bearer $TOKEN" \
  "$APISERVER/api/v1/namespaces" | jq '[.items[].metadata.name]'

# Crea un Pod via REST
curl -s --cacert $CACERT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$APISERVER/api/v1/namespaces/default/pods" \
  -d '{
    "apiVersion": "v1",
    "kind": "Pod",
    "metadata": {"name": "api-created"},
    "spec": {
      "containers": [{"name": "nginx", "image": "nginx:alpine"}]
    }
  }' | jq '.metadata.name'

# Watch degli eventi in tempo reale
curl -s --cacert $CACERT -H "Authorization: Bearer $TOKEN" \
  "$APISERVER/api/v1/namespaces/default/pods?watch=true" | \
  while read line; do
    echo "$line" | jq -r '"\(.type) \(.object.metadata.name) → \(.object.status.phase)"'
  done
```

---

## Capstone Challenge (30 min)

> **"Il Quartetto dei Pod Rotti"**
>
> Nel namespace `rescue-mission` ci sono 4 Pod in stato di errore, ciascuno con un problema diverso.
>
> Per ogni Pod, il tuo compito è:
> 1. Identificare il problema usando solo `kubectl describe`, `kubectl logs`, `kubectl get`
> 2. Creare una versione corretta del Pod (`pod-N-fixed.yaml`)
> 3. Verificare che il Pod correcto raggiunga stato `Running` e `Ready`
>
> | Pod | Stato atteso | Hint |
> |-----|-------------|------|
> | `pod-1` | Running | Controlla exit code e logs |
> | `pod-2` | Running | Controlla il nome dell'immagine e il tag |
> | `pod-3` | Running | Controlla resource requests vs nodo disponibile |
> | `pod-4` | Ready=True | Controlla la readiness probe path |
>
> **Criteri di successo:** `kubectl get pods -n rescue-mission` → tutti `Running` e `1/1 READY`

---

## Self-Study Assignment

Completa questi materiali su iximiuz Labs prima del prossimo incontro (60–90 min totali):

::card
---
:content: tutorials.kubernetes-vs-virtual-machines
---
::

**Challenge consigliate su iximiuz Labs** (cerca nella sezione Challenges):
- "Kubernetes Pod Lifecycle Fundamentals"
- "Expose a Kubernetes Deployment"
- "Fix a Failing Kubernetes Deployment"

**Letture consigliate:**
- [Kubernetes Architecture Overview — kubernetes.io](https://kubernetes.io/docs/concepts/architecture/)
- [Kubernetes API Reference v1.32](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.32/)
- [Pod Lifecycle — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Managing Resources for Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

---

## Risorse Aggiuntive

### Documentazione Ufficiale Kubernetes
- [Kubernetes Architecture Overview](https://kubernetes.io/docs/concepts/architecture/) — panoramica ufficiale dell'architettura: control plane, worker nodes, addons
- [Components of Kubernetes](https://kubernetes.io/docs/concepts/overview/components/) — descrizione di ogni componente con il suo ruolo preciso nel cluster
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) — fasi (Pending→Running→Succeeded/Failed), condizioni, probe, terminazione
- [The Kubernetes API](https://kubernetes.io/docs/concepts/overview/kubernetes-api/) — versioning, API groups, resources, watch semantics, server-side apply
- [etcd FAQ](https://etcd.io/docs/current/faq/) — domande frequenti su etcd: leader election, Raft consensus, performance, defragmentation

### Blog e Tutorial Tecnici Approfonditi
- [Ivan Velichko — Kubernetes Learning Path (iximiuz.com)](https://iximiuz.com/en/posts/kubernetes-learning-path/) — percorso di apprendimento strutturato per Kubernetes, dall'architettura agli internals
- [Ahmet Alp Balkan — Blog](https://ahmet.im/blog/) — post tecnici profondi su Kubernetes internals, kubelet, kubectl tips, RBAC
- [Learnk8s — How the Kubernetes scheduler works](https://learnk8s.io/kubernetes-scheduler) — spiegazione visuale del processo di scheduling con tutti i filtri e i plugin
- [Learnk8s — Kubernetes production best practices](https://learnk8s.io/production-best-practices) — checklist dettagliata per cluster pronti per la produzione
- [Julia Evans — A Kubernetes debugging journey](https://jvns.ca/blog/2019/08/14/what-we-learned-investigating-rbac-issues/) — debugging di cluster Kubernetes con strumenti pratici
- [ITNEXT — How Kubernetes API Server Works](https://itnext.io/how-kubernetes-api-server-works-9c3e19f5da6b) — analisi dettagliata: authentication, authorization, admission, etcd

### Corsi e Lab Interattivi
- [Kubernetes the Hard Way — Kelsey Hightower](https://github.com/kelseyhightower/kubernetes-the-hard-way) — costruisci un cluster K8s da zero, certificati TLS inclusi: il corso che forma i veri esperti
- [Play with Kubernetes](https://labs.play-with-k8s.com/) — cluster K8s temporaneo nel browser, gratuito, nessun setup richiesto
- [killer.sh — CKA Simulator](https://killer.sh/) — simulatore dell'esame CKA con scenari più difficili dell'esame reale

### Strumenti Essenziali per la Diagnostica
- [kubectl cheat sheet — kubernetes.io](https://kubernetes.io/docs/reference/kubectl/cheatsheet/) — reference completo di tutti i comandi kubectl con esempi
- [k9s — Kubernetes CLI UI](https://k9scli.io/) — terminal UI per Kubernetes: navigazione interattiva di risorse, log in tempo reale, port-forward
- [kubecolor](https://github.com/kubecolor/kubecolor) — kubectl con output colorato, drop-in replacement trasparente
- [stern](https://github.com/stern/stern) — multi-pod log tailing con regex filtering: `stern app=myapp --since 1h`
- [Lens — Kubernetes IDE](https://k8slens.dev/) — IDE desktop per gestire e visualizzare cluster Kubernetes con dashboard integrate

### Comprendere etcd e il Control Plane
- [etcd Documentation](https://etcd.io/docs/current/) — guida completa: configurazione TLS, backup/restore, performance tuning, clustering
- [Kubernetes API Reference v1.32](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.32/) — reference completo di tutte le API con tutti i campi e le annotazioni
- [kubebuilder Book — Writing Kubernetes Operators](https://book.kubebuilder.io/) — guida per scrivere controller e operator personalizzati con il reconciliation pattern
- [client-go — Kubernetes Go Client](https://github.com/kubernetes/client-go) — la libreria Go per interagire con l'API server, usata da tutti i tool dell'ecosistema K8s
