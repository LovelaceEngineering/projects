---
kind: challenge

title: "Observability Setup: ServiceMonitor e Alert Rule"

description: |
  Installa kube-prometheus-stack con Helm, configura un ServiceMonitor per
  un'applicazione custom, e crea un PrometheusRule con un alert personalizzato.

categories:
- kubernetes
- observability

tags:
- prometheus
- helm
- servicemonitor
- alerting

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_app:
    init: true
    run: |
      # Deploy a sample app that exposes Prometheus metrics
      kubectl create namespace monitoring 2>/dev/null || true
      kubectl create deployment sample-app -n monitoring --image=prom/prometheus:latest --         /bin/prometheus --web.listen-address=:9090 --config.file=/dev/null 2>/dev/null || true
      kubectl expose deployment sample-app -n monitoring --name=sample-app-svc         --port=9090 --target-port=9090 2>/dev/null || true
      kubectl label deployment sample-app -n monitoring monitoring=true 2>/dev/null || true
      kubectl label svc sample-app-svc -n monitoring monitoring=true 2>/dev/null || true
      kubectl patch svc sample-app-svc -n monitoring --type=json         -p='[{"op":"replace","path":"/spec/ports/0/name","value":"metrics"}]' 2>/dev/null || true

  verify_prometheus_running:
    run: |
      # Check prometheus pod is running in monitoring namespace
      RUNNING=$(kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus \
        --field-selector=status.phase=Running 2>/dev/null | grep -c Running || echo 0)
      [ "$RUNNING" -ge 1 ] || exit 1

  verify_servicemonitor_created:
    run: |
      kubectl get servicemonitor -n monitoring 2>/dev/null | grep -q sample-app || exit 1

  verify_alert_rule_created:
    run: |
      kubectl get prometheusrule -n monitoring 2>/dev/null | grep -q . || exit 1
---

_Installa Prometheus con Helm, aggiungi un ServiceMonitor e crea un alert custom._

---

## Scenario

Devi configurare l'observability stack per il cluster e per l'applicazione `sample-app`
già deployata nel namespace `monitoring`. L'app espone metriche Prometheus sulla porta 9090.

---

## Task 1 — Installa kube-prometheus-stack con Helm

```bash
# Aggiungi il repo Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Installa lo stack (versione leggera per il lab)
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set alertmanager.enabled=false \
  --set grafana.enabled=false \
  --wait --timeout=300s

# Verifica
kubectl get pods -n monitoring
```

::simple-task
---
:tasks: tasks
:name: verify_prometheus_running
---
#active
In attesa che Prometheus sia in esecuzione nel namespace `monitoring`...

#completed
Prometheus in esecuzione! Lo stack di observability è operativo.
::

---

## Task 2 — Crea un ServiceMonitor

Il ServiceMonitor dice a Prometheus quali Service monitorare:

```bash
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: sample-app-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      monitoring: "true"
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_servicemonitor_created
---
#active
In attesa del ServiceMonitor `sample-app-monitor`...

#completed
ServiceMonitor creato. Prometheus ora raccoglie metriche dall'app.
::

---

## Task 3 — Crea una PrometheusRule (Alert)

```bash
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: sample-app-alerts
  namespace: monitoring
  labels:
    app: kube-prometheus-stack
    release: kube-prometheus-stack
spec:
  groups:
  - name: sample-app
    rules:
    - alert: SampleAppDown
      expr: up{job="monitoring/sample-app-svc"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Sample App è irraggiungibile"
        description: "Il job {{ $labels.job }} non risponde da più di 1 minuto"
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_alert_rule_created
---
#active
In attesa della PrometheusRule nel namespace `monitoring`...

#completed
Alert rule creata! Prometheus monitorerà lo stato dell'applicazione.
::

::hint-box
---
:summary: ServiceMonitor vs PodMonitor vs ScrapeConfig
---

| Tipo | Cosa monitora | Quando usarlo |
|------|--------------|---------------|
| `ServiceMonitor` | Service (via endpoint) | App con Service stabile |
| `PodMonitor` | Pod direttamente | DaemonSet, app senza Service |
| `ScrapeConfig` | URL arbitrario | Target fuori da Kubernetes |

Il Prometheus Operator usa i CRD per configurare il scraping in modo
dichiarativo — niente più modifiche manuali a `prometheus.yml`!
::
