---
kind: unit

title: "Incontro 7 — Osservabilità, Troubleshooting e Gestione del Cluster"

name: observability-troubleshooting-teoria
---

> **Playground per questo incontro:** usa il playground Kubernetes multi-nodo su iximiuz Labs:
> **https://labs.iximiuz.com/playgrounds/k8s-omni**

---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Installare kube-prometheus-stack con Helm e configurare ServiceMonitor custom
- Applicare il metodo RED (Rate/Errors/Duration) e USE (Utilization/Saturation/Errors) per il triage
- Eseguire un troubleshooting sistematico a strati: cluster → node → pod → container → app
- Effettuare un upgrade kubeadm del control plane e fare drain/upgrade di un worker node
- Eseguire un backup di etcd e valutare i rischi prima di qualsiasi operazione

---

## Teoria (50 min)

### I 3 Pilastri dell'Osservabilità

| Pilastro | Strumento | Risponde a |
|----------|-----------|-----------:|
| **Logs** | Loki + Promtail, journald, kubectl logs | "Cosa è successo esattamente?" |
| **Metrics** | Prometheus, metrics-server, Grafana | "Quante risorse consuma? Qual è il trend?" |
| **Traces** | Jaeger, Tempo, OpenTelemetry | "Quale microservizio è lento e perché?" |

**Correlazione tra pilastri:** le trace hanno log correlati tramite `trace_id`,
le metriche mostrano anomalie che indirizzano verso i log, i log hanno timestamp
che si correlano con i picchi nelle metriche.

---

### Metodi RED e USE

#### RED (per servizi, request-driven)

| Sigla | Metrica | Query PromQL |
|-------|---------|-------------|
| **Rate** | Request/sec | `rate(http_requests_total[5m])` |
| **Errors** | Tasso di errori | `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])` |
| **Duration** | Latenza P99 | `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))` |

#### USE (per risorse, infrastructure)

| Sigla | Metrica | Query PromQL |
|-------|---------|-------------|
| **Utilization** | % di utilizzo | `100 - (avg by (instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)` |
| **Saturation** | Run queue / attesa | `node_load1 / on(instance) group_left count without(cpu,mode)(node_cpu_seconds_total{mode="idle"})` — load medio per core; valori > 1.0 indicano saturazione |
| **Errors** | Errori hardware/kernel | `rate(node_disk_io_time_weighted_seconds_total[5m])` |

---

### metrics-server — la fonte delle metriche per HPA e `kubectl top`

Prima di parlare di Prometheus, serve chiarire **metrics-server**: è il componente **minimo** per le metriche di resource usage in un cluster. Non è un sistema di monitoring — è un cache in-memory di CPU e memoria per Pod e nodi, esposto tramite la **Metrics API** (`metrics.k8s.io`).

| Componente | Scope | Persistenza | Usato da |
|-----------|-------|-------------|----------|
| **metrics-server** | Solo CPU/RAM istantanei (ultimo valore) | Nessuna (in-memory, ~15s) | `kubectl top`, HPA (metriche Resource), VPA |
| **Prometheus** | Qualsiasi metrica + storia | Disco (TSDB, giorni/mesi) | Grafana, alerting, analisi trend |

**Come funziona:**

```
kubelet (su ogni nodo)
    │
    └─ /metrics/resource endpoint (cAdvisor integrato)
              ↓
    metrics-server scrapa ogni 15s
              │
              └─ espone via API aggregation layer → metrics.k8s.io/v1beta1
                        ↓
              kubectl top / HPA / VPA leggono qui
```

**Installazione:**

```bash
# Versione esplicita per riproducibilità (evita "latest")
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.7.2/components.yaml

# Attendi che sia pronto
kubectl wait pod -n kube-system -l k8s-app=metrics-server \
  --for=condition=ready --timeout=120s

# Verifica
kubectl top nodes
kubectl top pods -A --sort-by=memory
```

> **Gotcha frequente su cluster self-managed (kubeadm, k3s):** il kubelet usa certificati self-signed che metrics-server non riesce a verificare. Sintomo: `metrics-server` in `CrashLoopBackOff` con log `x509: cannot validate certificate for <ip> because it doesn't contain any IP SANs`. Fix standard: aggiungere `--kubelet-insecure-tls` agli args del Deployment (accettabile in ambienti dev; in produzione configura correttamente i cert kubelet).

**Query dirette alla Metrics API:**

```bash
# Metriche raw di un Pod
kubectl get --raw "/apis/metrics.k8s.io/v1beta1/namespaces/default/pods/myapp-xyz" | jq

# Metriche di tutti i nodi
kubectl get --raw "/apis/metrics.k8s.io/v1beta1/nodes" | jq '.items[] | {name: .metadata.name, cpu: .usage.cpu, memory: .usage.memory}'
```

**Quando basta metrics-server e quando serve Prometheus:**

- **metrics-server da solo**: HPA su CPU/memoria, `kubectl top` per triage veloce, VPA raccomandazioni.
- **Anche Prometheus**: metriche applicative (`http_requests_total`), storia (grafici a 7 giorni), alerting, metriche custom per HPA (`type: Pods` o `type: External`), SLO/SLI.

**Relazione con HPA:**

```
HPA con metrics.type: Resource (cpu/memory)
  └─ legge da metrics.k8s.io (metrics-server)

HPA con metrics.type: Pods / External
  └─ legge da custom.metrics.k8s.io / external.metrics.k8s.io
       └─ fornito da Prometheus Adapter, KEDA, o altri
```

Un cluster production-ready ha **entrambi**: metrics-server come livello base (dipendenza leggera, ~50Mi RAM) e Prometheus stack come osservabilità completa.

---

### kube-prometheus-stack: Architettura

```
┌───────────────────────────────────────────────────────────────────────┐
│                         kube-prometheus-stack                         │
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐ │
│  │  Prometheus  │◄───│ServiceMonitor│    │    AlertManager          │ │
│  │  (metrics    │    │(scrape target│    │ (routing, silencing,     │ │
│  │   storage)   │    │ discovery)   │    │  PagerDuty/Slack)        │ │
│  └──────┬───────┘    └──────────────┘    └──────────────────────────┘ │
│         │                                                             │
│  ┌──────▼───────┐    ┌──────────────┐    ┌──────────────────────────┐ │
│  │   Grafana    │    │node-exporter │    │   kube-state-metrics     │ │
│  │  (dashboard) │    │(nodo metrics)│    │(K8s object state metrics)│ │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
         ▲                   ▲                         ▲
         │                   │                         │
    app metrics          nodo host               K8s API state
  (ServiceMonitor)     (DaemonSet)              (Deployment, Pod, PVC)
```

**Componenti del stack:**
- `prometheus-operator`: gestisce i CRD ServiceMonitor, PodMonitor, PrometheusRule
- `prometheus`: raccoglie e conserva le metriche (time-series database)
- `alertmanager`: routing degli alert verso canali di notifica
- `grafana`: dashboard (include 20+ dashboard precofigurate per K8s)
- `node-exporter`: metriche del nodo host (CPU, RAM, disco, rete)
- `kube-state-metrics`: metriche sullo stato degli oggetti K8s

```bash
# Installa con Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin123 \
  --set prometheus.prometheusSpec.retention=7d \
  --set alertmanager.enabled=true

# Verifica installazione
kubectl get pods -n monitoring
kubectl get servicemonitors -n monitoring
kubectl get prometheusrules -n monitoring

# Accedi a Grafana
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring &
# → http://localhost:3000 (admin/admin123)
```

### ServiceMonitor Custom

Un `ServiceMonitor` dice a Prometheus "scrapa questo Service ogni 30 secondi
sull'endpoint `/metrics`":

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp-monitor
  namespace: production
  labels:
    release: monitoring    # IMPORTANTE: deve matchare il selector del Prometheus CR
spec:
  selector:
    matchLabels:
      app: myapp            # Seleziona Service con questa label
  endpoints:
  - port: metrics           # Nome della porta nel Service
    interval: 30s
    path: /metrics
    scheme: http
  namespaceSelector:
    matchNames:
    - production
```

```yaml
# Il Service deve avere la porta "metrics" nominata
apiVersion: v1
kind: Service
metadata:
  name: myapp
  labels:
    app: myapp              # Deve matchare il ServiceMonitor selector
spec:
  selector:
    app: myapp
  ports:
  - name: http
    port: 80
  - name: metrics           # Porta nominata per ServiceMonitor
    port: 9090
```

### PrometheusRule: Alert Custom

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: myapp-alerts
  namespace: production
  labels:
    release: monitoring
spec:
  groups:
  - name: myapp.rules
    interval: 30s
    rules:
    # Alert: errori > 1% per 5 minuti
    - alert: MyAppHighErrorRate
      expr: |
        rate(http_requests_total{app="myapp",status=~"5.."}[5m])
        / rate(http_requests_total{app="myapp"}[5m])
        > 0.01
      for: 5m
      labels:
        severity: warning
        team: backend
      annotations:
        summary: "{{ $labels.app }} error rate > 1%"
        description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.instance }}"
        runbook_url: "https://wiki.example.com/runbooks/high-error-rate"

    # Alert: latenza P99 > 500ms
    - alert: MyAppHighLatency
      expr: |
        histogram_quantile(0.99,
          rate(http_request_duration_seconds_bucket{app="myapp"}[5m])
        ) > 0.5
      for: 10m
      labels:
        severity: critical

    # Recording rule: precalcola metrica costosa
    - record: job:http_requests:rate5m
      expr: sum by (job)(rate(http_requests_total[5m]))
```

---

### Distributed Tracing con OpenTelemetry

Metriche e log rispondono a "cosa" e "quanto", ma non a **"dove nel percorso della richiesta si è perso il tempo?"**. Per questo serve il **distributed tracing**.

**Concetti chiave:**
- **Trace**: il viaggio completo di una richiesta attraverso tutti i servizi
- **Span**: un singolo "hop" all'interno del trace (es. API → Database → Cache)
- **Trace ID**: identificatore unico propagato tra i servizi (header HTTP)

```
Richiesta utente
  │
  └─ Span 1: Frontend (120ms)
       │
       ├─ Span 2: API Gateway (15ms)
       │    │
       │    └─ Span 3: Auth Service (8ms)
       │
       └─ Span 4: Order Service (95ms)
            │
            ├─ Span 5: Database Query (45ms)  ← bottleneck!
            └─ Span 6: Cache Lookup (2ms)
```

**OpenTelemetry (OTel)** è lo standard CNCF per instrumentazione. Lo stack tipico:

```
App (OTel SDK) → OTel Collector → Backend
                                    ├─ Jaeger (trace UI)
                                    ├─ Grafana Tempo (storage)
                                    └─ Prometheus (metriche derivate)
```

```bash
# Installa l'OTel Collector come DaemonSet
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm install otel-collector open-telemetry/opentelemetry-collector \
  --namespace monitoring
```

> **Quando investire nel tracing:** se hai 5+ microservizi che comunicano tra loro, il tracing diventa indispensabile per il debugging. Con 2-3 servizi, metriche e log sono spesso sufficienti.

**Risorse:**
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Grafana Tempo — Distributed Tracing](https://grafana.com/docs/tempo/latest/)

---

### Troubleshooting Sistematico a Strati

Segui sempre questo ordine: dal generale al specifico.

```
Livello 1: CLUSTER
  → tutti i nodi sono Ready?
  → etcd è healthy?
  → apiserver risponde?

Livello 2: NODO
  → kubelet è running?
  → ci sono pressioni di risorse (CPU, RAM, disco)?
  → ci sono eventi di eviction?

Livello 3: POD
  → qual è lo stato? Quanti restart?
  → ci sono eventi di scheduling?

Livello 4: CONTAINER
  → cosa dicono i log (correnti + precedenti)?
  → qual è l'exit code?

Livello 5: APPLICAZIONE
  → l'endpoint risponde?
  → il DB è raggiungibile?
  → le dipendenze sono up?
```

#### Livello 1: Cluster

```bash
# Nodi
kubectl get nodes -o wide
kubectl describe node <node> | grep -E "Ready|Pressure|Conditions" -A 3

# Componenti del control plane
kubectl get pods -n kube-system
# NOTA: kubectl get componentstatuses è deprecato in K8s 1.20 e restituisce risultati vuoti in 1.25+
# Usa invece i comandi diretti:
#   etcdctl endpoint health        → stato di etcd
#   kubectl get --raw /healthz      → health dell'apiserver
#   kubectl get --raw /readyz       → readiness dell'apiserver

# etcd health
kubectl exec -n kube-system etcd-<nodename> -- etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  endpoint health

# apiserver
kubectl cluster-info
curl -k https://<apiserver-ip>:6443/healthz
curl -k https://<apiserver-ip>:6443/readyz
```

#### Livello 2: Nodo

```bash
kubectl describe node <node> | grep -A 10 "Conditions:"
kubectl describe node <node> | grep -A 20 "Allocated resources"

# Sul nodo SSH
systemctl status kubelet
journalctl -u kubelet --since "30 minutes ago" | grep -E "error|Error|fail|Warning"

# Pressione di risorse
free -h
df -h
top -b -n 1 | head -20

# Eviction
kubectl get events --field-selector reason=Evicted -A
```

#### Livello 3: Pod

```bash
# Panoramica
kubectl get pods -A -o wide | grep -v Running | grep -v Completed

# Dettagli e eventi
kubectl describe pod <pod> -n <namespace>

# Quanti restart?
kubectl get pods -n <namespace> | awk '{if ($4 > 0) print $0}'

# Top Pod (richiede metrics-server)
kubectl top pods -n <namespace> --sort-by=memory
```

#### Livello 4: Container

```bash
# Log correnti
kubectl logs <pod> -c <container> -n <namespace> --tail=100

# Log del run precedente (dopo un crash)
kubectl logs <pod> -c <container> -n <namespace> --previous

# Stream live
kubectl logs -f <pod> -n <namespace>

# Exit code (in describe o get -o yaml)
kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].lastState.terminated.exitCode}'
# 0   = successo
# 1   = errore generico
# 127 = command not found
# 137 = SIGKILL (OOM o kill esterno)
# 139 = SIGSEGV (segfault)
# 143 = SIGTERM (graceful shutdown)
```

#### Livello 5: Applicazione

```bash
# Esegui dall'interno del Pod
kubectl exec -it <pod> -- sh

# Testa endpoint locale
kubectl exec <pod> -- curl -s http://localhost:8080/health
kubectl exec <pod> -- wget -qO- http://localhost:8080/metrics

# Testa DNS e connettività
kubectl exec <pod> -- nslookup database-service.production.svc.cluster.local
kubectl exec <pod> -- nc -z database-service 5432  # TCP check senza curl

# Debug con container effimero (ephemeral container) nella stessa rete del Pod
# --target specifica in quale container process namespace condividere (richiede EphemeralContainers, abilitato di default da K8s 1.23)
kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container>
# Alternativa: Pod di debug separato nella stessa rete
kubectl run debug-net --image=nicolaka/netshoot --rm -it -- bash
```

---

### Upgrade di un Cluster Kubernetes con kubeadm

**PRIMA DI TUTTO:** backup di etcd.

```bash
# ─── BACKUP ETCD ────────────────────────────────────────────────────────
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-$(date +%Y%m%d-%H%M).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key

# Verifica il backup
ETCDCTL_API=3 etcdctl snapshot status /backup/etcd-*.db --write-out=table
```

#### Restore di etcd da Backup

Se etcd è corrotto o il cluster è compromesso, puoi ripristinare dallo snapshot:

```bash
# ─── RESTORE ETCD ─────────────────────────────────────────────────────────
# 1. Ferma il kube-apiserver (sposta il manifest statico)
mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

# 2. Ferma etcd
mv /etc/kubernetes/manifests/etcd.yaml /tmp/

# 3. Ripristina lo snapshot in una NUOVA directory
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-20260225.db \
  --data-dir=/var/lib/etcd-restored \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# 4. Aggiorna il manifest etcd per puntare alla nuova directory
# In /tmp/etcd.yaml, cambia:
#   --data-dir=/var/lib/etcd  →  --data-dir=/var/lib/etcd-restored
# e il hostPath volume:
#   path: /var/lib/etcd  →  path: /var/lib/etcd-restored

# 5. Ripristina i manifest
mv /tmp/etcd.yaml /etc/kubernetes/manifests/
mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

# 6. Attendi che i componenti ripartano
kubectl get nodes    # potrebbe richiedere 1-2 minuti
kubectl get pods -n kube-system

# 7. Verifica integrità
ETCDCTL_API=3 etcdctl endpoint health \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key
```

> **⚠️ Attenzione:** il restore sovrascrive **tutto** lo stato del cluster con quello al momento del backup. Qualsiasi risorsa creata dopo il backup sarà persa. Esegui il restore solo come ultima risorsa.

**Upgrade del Control Plane:**

```bash
# 1. Verifica il piano di upgrade
kubeadm upgrade plan
# → mostra versione corrente, versione disponibile, componenti da aggiornare

# 2. Aggiorna kubeadm (sostituisci <target-version> con la versione target, es. 1.33.0)
apt-get update
apt-get install -y kubeadm=<target-version>-*
kubeadm version

# 3. Esegui l'upgrade
kubeadm upgrade apply v<target-version>
# → aggiorna: kube-apiserver, kube-controller-manager, kube-scheduler, CoreDNS, kube-proxy

# 4. Aggiorna kubelet e kubectl sul control plane
apt-get install -y kubelet=<target-version>-* kubectl=<target-version>-*
systemctl daemon-reload
systemctl restart kubelet

# 5. Verifica
kubectl get nodes
# → control-plane: v<target-version>, workers: v<current-version> (ok temporaneamente)
```

**Upgrade di un Worker Node:**

```bash
# 1. Drain: evict tutti i Pod dal nodo (sposta il workload sugli altri)
kubectl drain node1 --ignore-daemonsets --delete-emptydir-data
# → node/node1 cordoned (no nuovi Pod schedulati)
# → Pod evicted

# 2. SSH sul nodo e aggiorna
ssh node1

apt-get update
apt-get install -y kubeadm=<target-version>-*
kubeadm upgrade node   # Aggiorna la configurazione del nodo

apt-get install -y kubelet=<target-version>-* kubectl=<target-version>-*
systemctl daemon-reload
systemctl restart kubelet

exit

# 3. Uncordon: riabilita lo scheduling sul nodo
kubectl uncordon node1
kubectl get nodes  # → node1: v<target-version>, Ready
```

---

## Hands-on Guidato (90 min — su Proxmox con Prometheus + Grafana)

### Esercizio 1 — Helm install kube-prometheus-stack

```bash
# Installa lo stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=admin123

# Attendi che tutto sia up
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/part-of=kube-prometheus-stack \
  -n monitoring --timeout=300s

# Accedi a Grafana
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring &
# http://localhost:3000 → admin/admin123
# Dashboard: "Kubernetes / Compute Resources / Namespace (Pods)"
```

### Esercizio 2 — ServiceMonitor per Applicazione Custom

```bash
# Deploy di app con endpoint /metrics (Prometheus format)
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-demo
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: metrics-demo
  template:
    metadata:
      labels:
        app: metrics-demo
    spec:
      containers:
      - name: app
        image: prom/prometheus:v2.51.0   # Prometheus stesso espone metriche
        args:
        - --config.file=/etc/prometheus/prometheus.yml
        - --storage.tsdb.path=/prometheus/
        ports:
        - name: metrics
          containerPort: 9090
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
---
apiVersion: v1
kind: Service
metadata:
  name: metrics-demo
  namespace: default
  labels:
    app: metrics-demo    # Label per ServiceMonitor
spec:
  selector:
    app: metrics-demo
  ports:
  - name: metrics
    port: 9090
EOF

# Crea ServiceMonitor
kubectl apply -f - <<'EOF'
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: metrics-demo
  namespace: monitoring
  labels:
    release: monitoring    # Deve matchare il Prometheus CR
spec:
  selector:
    matchLabels:
      app: metrics-demo
  namespaceSelector:
    matchNames:
    - default
  endpoints:
  - port: metrics
    interval: 30s
EOF

# Verifica in Prometheus
kubectl port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090 -n monitoring &
# → http://localhost:9090/targets → cerca "serviceMonitor/monitoring/metrics-demo"
```

### Esercizio 3 — Troubleshooting a Strati

```bash
# L'ambiente ha 3 problemi in cascata da diagnosticare

# Step 1: PVC non bound
kubectl get pvc
# → Status: Pending
kubectl describe pvc mydb-data
# → Hint: StorageClass "fast-ssd" non trovata
kubectl get storageclass
# → Fix: correggi il nome della StorageClass o creala

# Step 2: CrashLoopBackOff dopo il fix della PVC
kubectl get pods  # → postgres-0: CrashLoopBackOff
kubectl logs postgres-0 --previous
# → "FATAL: password authentication failed for user postgres"
# → Fix: controlla POSTGRES_PASSWORD env var - punta a Secret sbagliato

# Step 3: Service non risponde dopo il fix
kubectl get endpoints myapp-svc
# → <none>  ← nessun endpoint!
kubectl get pods -l app=myapp
# → esiste, ma label è "app=myapp"
kubectl describe service myapp-svc | grep Selector
# → Selector: app.kubernetes.io/name=myapp  ← label diversa!
# → Fix: correggi il selector del Service o le label del Pod
```

### Esercizio 4 — Cluster Upgrade (minor version bump)

Seguire la procedura sul cluster Proxmox.
Verificare che le applicazioni rimangano disponibili durante il drain del nodo
(usare il curl loop dell'esercizio di rolling update come monitor).

```bash
# Monitor disponibilità durante l'upgrade
kubectl run traffic-mon --image=busybox --restart=Never -- \
  sh -c 'i=0; while true; do
    s=$(wget -qO- --timeout=2 http://myapp 2>&1)
    echo "$(date +%H:%M:%S) req-$i: ${s:-FAILED}"
    i=$((i+1))
    sleep 1
  done'
kubectl logs -f traffic-mon &

# Poi esegui il drain e upgrade del worker
kubectl drain node1 --ignore-daemonsets --delete-emptydir-data
# ... upgrade procedure ...
kubectl uncordon node1
```

---

## Capstone Challenge (30 min)

> **"Il Cluster Silenzioso"**
>
> Il cluster non espone metriche, un nodo è in `NotReady`, metrics-server non risponde.
>
> **Prima di toccare qualsiasi cosa:** esegui il backup di etcd:
>
> ```bash
> ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-$(date +%Y%m%d).db \
>   --endpoints=https://127.0.0.1:2379 \
>   --cacert=/etc/kubernetes/pki/etcd/ca.crt \
>   --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
>   --key=/etc/kubernetes/pki/etcd/healthcheck-client.key
> ```
>
> Poi diagnostica e risolvi in questo ordine:
>
> **1. Perché il nodo è `NotReady`?**
>    - `kubectl describe node` → quali condizioni?
>    - `journalctl -u kubelet` → errori del kubelet?
>    - Possibili cause: kubelet crashato, certificato scaduto, network plugin non attivo
>
> **2. Perché metrics-server non risponde?**
>    - `kubectl get pods -n kube-system | grep metrics-server`
>    - `kubectl logs -n kube-system metrics-server-xxx`
>    - Possibili cause: readinessProbe fallisce, RBAC mancante, cert TLS non verificabile
>    - Fix comune: `--kubelet-insecure-tls` arg
>
> **3. Come ripristinare le metriche in Grafana?**
>    - Controlla ServiceMonitor e Endpoints
>    - Verifica le label del Service vs selector del ServiceMonitor
>    - Controlla Prometheus targets: `/targets` → quali sono DOWN?

---

## Self-Study Assignment

Completa le challenge su iximiuz Labs prima del prossimo incontro (60–90 min totali).
Cerca nella sezione Challenges: **CKA cluster upgrade**.

**Opzionale avanzato:**
Installa Loki + Promtail sul cluster e configura una query per vedere gli errori delle applicazioni:

```bash
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set grafana.enabled=false \
  --set promtail.enabled=true
```

**Letture consigliate:**
- [Prometheus Documentation](https://prometheus.io/docs/introduction/overview/)
- [PromQL Cheat Sheet — prometheus.io](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [kubeadm upgrade — kubernetes.io](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
- [Grafana Dashboards for Kubernetes](https://grafana.com/grafana/dashboards/?search=kubernetes)

---

## Risorse Aggiuntive

### Documentazione Ufficiale
- [Prometheus Documentation](https://prometheus.io/docs/introduction/overview/) — architettura, data model, scrape configuration, alerting, federation
- [PromQL Documentation](https://prometheus.io/docs/prometheus/latest/querying/basics/) — guida ufficiale: selectors, matchers, operators, functions, subqueries
- [Prometheus Operator API Reference](https://prometheus-operator.dev/docs/api-reference/api/) — spec complete di ServiceMonitor, PodMonitor, PrometheusRule, Alertmanager, PrometheusAgent
- [Grafana Documentation](https://grafana.com/docs/grafana/) — pannelli, datasource, alerting, variables, transformazioni, provisioning
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) — standard CNCF: SDK, collector, instrumentazione automatica, traces/metrics/logs
- [kubeadm upgrade — kubernetes.io](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/) — procedura ufficiale di upgrade step by step: drain, upgrade, uncordon

### PromQL: Query e Alert
- [PromQL Cheat Sheet — PromLabs](https://promlabs.com/promql-cheat-sheet/) — reference card completa: selectors, aggregation operators, range vectors, functions
- [Awesome Prometheus Alerts](https://github.com/samber/awesome-prometheus-alerts) — raccolta di 300+ alert PrometheusRule pronti all'uso: K8s, node, database, Redis, Kafka, Nginx
- [PromQL Examples — Sysdig](https://sysdig.com/blog/promql-examples-i-wish-i-had-when-i-started/) — esempi pratici annotati per ogni tipo di query con spiegazioni dettagliate
- [Recording Rules — prometheus.io](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/) — ottimizza query frequenti e costose pre-calcolando time series

### Dashboard Grafana
- [Modern Kubernetes Grafana Dashboards — dotdc](https://github.com/dotdc/grafana-dashboards-kubernetes) — set moderno di dashboard K8s: namespace breakdown, workload, node metrics, con variabili e alerting
- [kube-prometheus-stack Chart Source](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack) — source del chart Helm con tutti i valori configurabili e le dashboard preinstallate
- [Grafana Dashboards Marketplace](https://grafana.com/grafana/dashboards/?search=kubernetes) — dashboard community per K8s, node exporter, API server, etcd, CoreDNS

### Logging e Tracing
- [Grafana Loki Documentation](https://grafana.com/docs/loki/latest/) — log aggregation senza indicizzazione full-text: LogQL, labels, compaction, Promtail
- [Grafana Tempo Documentation](https://grafana.com/docs/tempo/latest/) — distributed tracing backend: ingestion Jaeger/Zipkin/OTLP, TraceQL, integration con Loki
- [OpenTelemetry Kubernetes Operator](https://github.com/open-telemetry/opentelemetry-operator) — deploy e gestione di collector OpenTelemetry come CRD in Kubernetes

### Tool di Osservabilità e Troubleshooting
- [K9s](https://k9scli.io/) — terminal UI per Kubernetes: navigazione risorse, log in tempo reale, port-forward, shell nei container
- [Lens — Kubernetes IDE](https://k8slens.dev/) — IDE desktop con dashboard Prometheus integrate, metriche live, terminal
- [Pixie — New Relic CNCF](https://pixielabs.ai/) — osservabilità eBPF senza strumentazione del codice: request tracing automatico, profiling CPU, network
- [Komodor](https://komodor.com/) — timeline degli eventi K8s per correlazione e root cause analysis degli incidenti
- [Robusta](https://home.robusta.dev/) — alerting basato su Prometheus con automazione della risposta: runbook automatici, enrichment degli alert

### Metodologie di Osservabilità
- [The USE Method — Brendan Gregg](https://www.brendangregg.com/usemethod.html) — Utilization/Saturation/Errors: framework per diagnosi sistematica dell'infrastruttura
- [The RED Method — Tom Wilkie](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/) — Rate/Errors/Duration: framework per diagnosi dei microservizi e delle API
- [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) — capitolo gratuito del libro SRE di Google: white-box monitoring, black-box monitoring, sintomi vs cause
- [The Four Golden Signals — Google SRE](https://sre.google/sre-book/monitoring-distributed-systems/#xref_monitoring_golden-signals) — latency, traffic, errors, saturation: i 4 segnali fondamentali per monitorare qualsiasi servizio
