---
kind: unit
title: "Stack di Osservabilità Avanzato"
name: observability-stack-avanzato-teoria
---

## Obiettivi

Al termine di questa lezione i partecipanti saranno in grado di:

- Descrivere l'architettura completa dello stack LGTM (Loki, Grafana, Tempo, Mimir)
- Configurare Loki per la raccolta log con Promtail o Grafana Alloy
- Spiegare le differenze tra Thanos e Mimir per lo storage a lungo termine di Prometheus
- Scegliere tra Thanos e Mimir in base ai requisiti del progetto
- Installare e configurare l'OpenTelemetry Collector in Kubernetes
- Usare l'auto-strumentazione OTel per raccogliere trace senza modificare il codice

---

## Teoria

### Prometheus: Riassunto Architetturale

Prometheus è il cuore delle metriche in Kubernetes. Riassunto rapido:

| Componente | Ruolo |
|-----------|-------|
| **Prometheus Server** | Scraping pull-based, TSDB locale, valutazione regole |
| **Alertmanager** | Routing alert → Slack, PagerDuty, email, webhook |
| **Exporters** | node-exporter (host), kube-state-metrics (oggetti K8s) |
| **ServiceMonitor/PodMonitor** | CRD per configurare target di scraping (Prometheus Operator) |

**Limiti di Prometheus standalone:**
- Storage locale → no HA (se il Pod muore, perdi la storia)
- Retention limitata (tipicamente 15d–30d per ragioni di spazio)
- Nessuna vista globale su più cluster
- Nessun multi-tenancy nativo

Questi limiti portano a **Thanos** e **Mimir**.

---

### Thanos: Scalare Prometheus con il Pattern Sidecar

Thanos estende Prometheus **senza sostituirlo**. Aggiunge componenti laterali che abilitano:
- Storage a lungo termine su object storage (S3, GCS, Azure Blob)
- Query globali su più cluster Prometheus
- Compattazione e downsampling

#### Architettura

```
┌──────────────────────────────────────────────────┐
│                  Cluster A                        │
│  ┌────────────┐   ┌─────────────┐                │
│  │ Prometheus  │◄──│   Thanos    │──► Object      │
│  │  (TSDB)    │   │  Sidecar    │    Storage     │
│  └────────────┘   └─────────────┘    (S3/GCS)    │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                  Cluster B                        │
│  ┌────────────┐   ┌─────────────┐                │
│  │ Prometheus  │◄──│   Thanos    │──► Object      │
│  │  (TSDB)    │   │  Sidecar    │    Storage     │
│  └────────────┘   └─────────────┘    (S3/GCS)    │
└──────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   ┌──────────────────────────────┐
   │        Thanos Querier        │ ← vista globale
   │  (fan-out su Sidecar +      │
   │   Store Gateway)             │
   └──────────────┬───────────────┘
                  │
   ┌──────────────▼───────────────┐
   │      Thanos Store Gateway    │ ← serve dati storici
   │  (legge da object storage)   │    da object storage
   └──────────────────────────────┘
   ┌──────────────────────────────┐
   │       Thanos Compactor       │ ← compatta + downsample
   └──────────────────────────────┘
```

**Componenti chiave:**

| Componente | Funzione |
|-----------|----------|
| **Sidecar** | Gira accanto a Prometheus, carica blocchi su object storage, serve query real-time |
| **Store Gateway** | Serve dati storici dall'object storage |
| **Querier** | Interfaccia PromQL unificata, fan-out su sidecar + store gateway |
| **Compactor** | Compatta blocchi, applica downsampling (5m, 1h), gestisce retention |
| **Ruler** (opzionale) | Valuta regole e alert su dati storici |

**Quando scegliere Thanos:**
- Hai già Prometheus e vuoi aggiungere long-term storage gradualmente
- Pattern sidecar = impatto minimo sull'infrastruttura esistente
- Vuoi una vista globale su cluster multipli

---

### Mimir: Storage Metriche Scalabile Nativamente

Grafana Mimir è un backend metriche **microservizio-nativo**. A differenza di Thanos (sidecar), Mimir riceve le metriche via **remote write** — Prometheus le invia attivamente.

#### Architettura

```
Prometheus ──remote_write──► ┌─────────────┐
                             │ Distributor  │ ← valida, partiziona
                             └──────┬───────┘
                                    │
                             ┌──────▼───────┐
                             │   Ingester   │ ← scrive in memoria + WAL
                             └──────┬───────┘
                                    │ flush
                             ┌──────▼───────┐
                             │Object Storage│ ← TSDB blocks
                             └──────┬───────┘
                                    │
                             ┌──────▼───────┐
                             │Store Gateway │ ← serve query storiche
                             └──────┬───────┘
                                    │
                             ┌──────▼───────┐
                             │   Querier    │ ← unifica ingester + store
                             └──────┬───────┘
                                    │
                             ┌──────▼───────┐
                             │  Compactor   │ ← compatta + retention
                             └──────────────┘
```

**Differenze chiave rispetto a Thanos:**

| | Thanos | Mimir |
|---|--------|-------|
| **Pattern** | Sidecar accanto a Prometheus | Remote write (Prometheus → Mimir) |
| **Multi-tenancy** | No nativo | Sì, nativo (header `X-Scope-OrgID`) |
| **Migrazione** | Graduale (aggiungi sidecar) | Richiede configurare remote_write |
| **HA ingestion** | Prometheus in HA + dedup | Replicazione nell'Ingester (factor 3) |
| **Query performance** | Buona (fan-out) | Ottima (query splitting, caching) |
| **Operationally** | Più semplice inizialmente | Più componenti, ma più scalabile |
| **Costo** | Meno compute | Più compute, meno storage (compressione migliore) |

**Quando scegliere Mimir:**
- Multi-tenancy è un requisito (SaaS, team multipli)
- Scala molto grande (milioni di serie attive)
- Vuoi query caching e splitting nativi
- Stai già nell'ecosistema Grafana (Loki + Tempo + Mimir = LGTM)

**Configurare remote_write in Prometheus:**

```yaml
# values.yaml per kube-prometheus-stack
prometheus:
  prometheusSpec:
    remoteWrite:
    - url: http://mimir-distributor.monitoring:8080/api/v1/push
      headers:
        X-Scope-OrgID: team-platform
```

---

### Loki: Log Aggregation per Kubernetes

Loki è il "Prometheus dei log": **indicizza solo le label**, non il contenuto dei log. Questo lo rende ordini di grandezza più economico di Elasticsearch per i log Kubernetes.

#### Architettura

```
Pod logs ──► Promtail/Alloy ──► ┌─────────────┐
                                │ Distributor  │
                                └──────┬───────┘
                                       │
                                ┌──────▼───────┐
                                │   Ingester   │ ← chunk in memoria
                                └──────┬───────┘
                                       │ flush
                                ┌──────▼───────┐
                                │Object Storage│ ← chunk + indice
                                └──────────────┘
                                       │
                                ┌──────▼───────┐
                                │   Querier    │ ← LogQL
                                └──────────────┘
```

**Raccolta log — opzioni:**

| Agente | Caratteristiche |
|--------|----------------|
| **Promtail** | Agent originale di Loki, DaemonSet, semplice |
| **Grafana Alloy** | Sostituto di Promtail (2024+), pipeline configurabili, supporta OTel |
| **Fluent Bit** | Leggero, plugin Loki output, adatto se già in uso |

**LogQL — Esempi:**

```logql
# Tutti i log di un namespace
{namespace="production"}

# Filtro per contenuto
{namespace="production", app="api"} |= "error"

# Regex
{app="nginx"} |~ "status=[45]\\d\\d"

# Aggregazioni (come PromQL)
sum(rate({namespace="production"} |= "error" [5m])) by (app)

# Top 10 pod per volume di log
topk(10, sum(rate({namespace="production"}[1h])) by (pod))
```

**Installazione con Helm:**

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Loki in modalità simple-scalable (produzione leggera)
helm install loki grafana/loki \
  --namespace monitoring \
  --set loki.commonConfig.replication_factor=1 \
  --set loki.storage.type=filesystem

# Promtail come DaemonSet
helm install promtail grafana/promtail \
  --namespace monitoring \
  --set config.clients[0].url=http://loki-gateway.monitoring/loki/api/v1/push
```

**Strategia label per K8s:**
- Label automatiche: `namespace`, `pod`, `container`, `node`
- **Non** aggiungere label ad alta cardinalità (es. `request_id`, `user_id`)
- Usare il filtro `|=` o `|~` per cercare nel contenuto dei log

---

### Grafana: Il Pannello di Controllo Unificato

Grafana è la piattaforma di visualizzazione che unifica tutte le fonti dati:

| Data Source | Tipo di dati | Query Language |
|------------|-------------|----------------|
| Prometheus/Mimir | Metriche | PromQL |
| Loki | Log | LogQL |
| Tempo | Trace | TraceQL |
| Alertmanager | Alert attivi | — |

**Dashboard essenziali per K8s:**

- **Cluster overview**: CPU/RAM per nodo, Pod count, scheduling pressure
- **Namespace resources**: requests vs limits vs actual per namespace
- **Pod detail**: CPU/RAM/network/restart per singolo Pod
- **Node exporter**: disco, rete, load average per nodo

**Grafana Unified Alerting (dalla v9):**

```
Alert Rule (PromQL/LogQL)
    │
    ▼
Contact Point (Slack, PagerDuty, Email, Webhook)
    │
    ▼
Notification Policy (routing, muting, grouping)
    │
    ▼
Silences (soppressione temporanea)
```

Unified alerting sostituisce sia Alertmanager di Prometheus sia il vecchio sistema alert di Grafana con un'interfaccia unica.

---

### OpenTelemetry: Il Layer di Raccolta Vendor-Neutral

OpenTelemetry (OTel) è lo standard CNCF per la raccolta di telemetria. Non è un backend — è il **collettore e il formato** che alimenta i backend.

**I tre segnali:**

| Segnale | Cosa raccoglie | Backend tipico |
|---------|---------------|----------------|
| **Traces** | Percorso della richiesta attraverso i servizi | Tempo, Jaeger |
| **Metrics** | Counter, gauge, histogram | Prometheus, Mimir |
| **Logs** | Messaggi strutturati | Loki |

#### OTel Collector: Architettura Pipeline

```
┌─────────────────────────────────────────────┐
│            OTel Collector                    │
│                                             │
│  Receivers ──► Processors ──► Exporters     │
│                                             │
│  otlp          batch          prometheus    │
│  prometheus     memory_limiter loki         │
│  filelog        k8sattributes  otlp/tempo   │
│  kubeletstats   filter         debug        │
└─────────────────────────────────────────────┘
```

**Modalità di deployment in K8s:**

| Modalità | Quando usarla |
|---------|---------------|
| **DaemonSet** | Raccolta log/metriche da ogni nodo (kubelet, node-exporter) |
| **Deployment** | Raccolta centralizzata, gateway per OTLP da app |
| **Sidecar** | Isolamento per-Pod, più risorse ma più flessibile |

**OTel Operator — Auto-strumentazione:**

L'operatore OpenTelemetry per Kubernetes abilita la **zero-code instrumentation**: inietta automaticamente le librerie OTel nei Pod tramite un webhook di ammissione.

```yaml
# 1. Installa l'operatore
helm install otel-operator open-telemetry/opentelemetry-operator \
  --namespace monitoring

# 2. Configura il Collector
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: otel
  namespace: monitoring
spec:
  mode: deployment
  config:
    receivers:
      otlp:
        protocols:
          grpc: {}
          http: {}
    processors:
      batch:
        send_batch_size: 1000
        timeout: 10s
      k8sattributes:
        extract:
          metadata:
          - k8s.namespace.name
          - k8s.pod.name
          - k8s.deployment.name
    exporters:
      otlp/tempo:
        endpoint: tempo.monitoring:4317
        tls:
          insecure: true
      prometheusremotewrite:
        endpoint: http://mimir-distributor.monitoring:8080/api/v1/push
      loki:
        endpoint: http://loki-gateway.monitoring/loki/api/v1/push
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch, k8sattributes]
          exporters: [otlp/tempo]
        metrics:
          receivers: [otlp]
          processors: [batch]
          exporters: [prometheusremotewrite]
        logs:
          receivers: [otlp]
          processors: [batch]
          exporters: [loki]

# 3. Auto-strumentazione per Java/Python/Node.js/Go
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: auto-instrumentation
  namespace: production
spec:
  exporter:
    endpoint: http://otel-collector.monitoring:4317
  propagators:
  - tracecontext
  - baggage
  java:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-java:latest
  python:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-python:latest
  nodejs:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-nodejs:latest
```

Per abilitare l'auto-strumentazione su un Deployment, aggiungi un'annotazione:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    metadata:
      annotations:
        instrumentation.opentelemetry.io/inject-java: "true"
        # oppure: inject-python, inject-nodejs, inject-dotnet, inject-go
```

---

### Lo Stack Completo: Come Si Collega Tutto

```
┌─────────────────────────────────────────────────────────────────┐
│                     Applicazioni K8s                            │
│  (auto-strumentate con OTel SDK / operator annotation)          │
└────────────────────────┬────────────────────────────────────────┘
                         │ OTLP (gRPC/HTTP)
                ┌────────▼────────┐
                │  OTel Collector  │
                │  (Deployment)    │
                └──┬─────┬─────┬──┘
                   │     │     │
         ┌─────────▼┐ ┌─▼────┐ ┌▼──────────┐
         │ Prometheus│ │ Loki │ │   Tempo    │
         │ / Mimir   │ │      │ │            │
         │ (metriche)│ │(log) │ │  (trace)   │
         └─────┬─────┘ └──┬───┘ └─────┬─────┘
               │          │           │
         ┌─────▼──────────▼───────────▼─────┐
         │              Grafana              │
         │  Dashboard + Alerting unificato   │
         └──────────────────────────────────┘
```

**Raccomandazione 2026:**
> Anche se usi Prometheus per le metriche e Loki per i log, metti un **OTel Collector davanti**.
> Ottieni: vendor choice futura, auto-strumentazione zero-code, un unico punto per filtrare
> e arricchire i dati prima che raggiungano i backend.

---

## Risorse

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Thanos Documentation](https://thanos.io/tip/thanos/getting-started.md/)
- [Grafana Mimir Documentation](https://grafana.com/docs/mimir/latest/)
- [Grafana Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Grafana Tempo Documentation](https://grafana.com/docs/tempo/latest/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OTel Operator — GitHub](https://github.com/open-telemetry/opentelemetry-operator)
- [LGTM Stack Guide](https://grafana.com/docs/grafana/latest/getting-started/get-started-grafana-prometheus/)
