---
kind: unit
title: "Challenge — Osservabilità e Troubleshooting"
name: observability-challenges-unit
---

# Challenge — Incontro 7: Osservabilità e Troubleshooting

Queste challenge accompagnano l'**Incontro 7** (Osservabilità, Troubleshooting e Gestione del Cluster).
Mettono alla prova la capacità di configurare monitoring e diagnosticare problemi complessi.

---

## 1. Observability Setup: ServiceMonitor e Alert Rule

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Installa **kube-prometheus-stack** con Helm, configura un ServiceMonitor per
un'applicazione custom che espone metriche su `/metrics`, e crea un PrometheusRule
con un alert personalizzato che scatta quando il rate di errori supera una soglia.

**Cosa imparerai:**
- Come Prometheus Operator usa i CRD (ServiceMonitor, PrometheusRule)
- Il flusso completo: app → ServiceMonitor → Prometheus → AlertManager
- Come scrivere espressioni PromQL per alert realistici (rate, histogram)

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u7-observability-setup-dbf60030)

---

## 2. Il Cluster Silenzioso: Nodo NotReady e Etcd Backup

**Difficoltà:** hard | **Tempo stimato:** 45–60 min

Un nodo è in stato **NotReady**, il metrics-server non funziona, e devi fare
il **backup di etcd** prima di toccare qualsiasi cosa. Troubleshooting a strati
su un cluster Kubernetes reale, dove ogni azione deve essere ponderata.

**Cosa imparerai:**
- Il workflow di troubleshooting sistematico: nodo → kubelet → runtime → rete
- Come eseguire un backup/restore di etcd con `etcdctl snapshot save`
- Come diagnosticare un nodo NotReady analizzando kubelet logs e condizioni

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u7-silent-cluster-98f87c9e)
