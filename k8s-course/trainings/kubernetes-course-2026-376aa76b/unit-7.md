---
kind: unit

title: "Incontro 7 — Osservabilità, Troubleshooting e Gestione del Cluster"

name: unit-7

createdAt: 2026-02-23
updatedAt: 2026-02-23

challenges:
  u7_silent_cluster_98f87c9e: {}
  u7_observability_setup_dbf60030: {}
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Installare kube-prometheus-stack con Helm e configurare ServiceMonitor custom
- Applicare il metodo RED (Rate/Errors/Duration) e USE (Utilization/Saturation/Errors) per il triage
- Eseguire un troubleshooting sistematico a strati (cluster → node → pod → container → app)
- Effettuare un upgrade kubeadm del control plane e fare drain/upgrade di un worker node

---

## Teoria (50 min)

### I 3 Pilastri dell'Osservabilità

| Pilastro | Strumento | Risponde a |
|----------|-----------|-----------|
| **Logs** | Loki, Promtail, journald | Cosa è successo? |
| **Metrics** | Prometheus, metrics-server | Quante risorse consuma? Qual è il trend? |
| **Traces** | Jaeger, Tempo | Quale microservizio è lento e perché? |

### Metodi RED e USE

**RED** (per servizi, request-driven):
- **Rate**: quante request al secondo?
- **Errors**: quante falliscono?
- **Duration**: quanto tempo impiegano?

**USE** (per risorse, infrastructure):
- **Utilization**: % di utilizzo (CPU 80%, RAM 60%)
- **Saturation**: cose in attesa (run queue, I/O wait)
- **Errors**: errori hardware/kernel

### Troubleshooting Sistematico

```
1. Cluster: tutti i nodi Ready? etcd healthy? apiserver risponde?
   kubectl get nodes; kubectl cluster-info

2. Node: kubelet running? Pressione di risorse?
   kubectl describe node <node>; journalctl -u kubelet

3. Pod: quale stato? Quanti restart?
   kubectl get pods -A; kubectl describe pod <pod>

4. Container: cosa dice il log?
   kubectl logs <pod> -c <container> --previous

5. App: l'endpoint risponde? Il DB è raggiungibile?
   kubectl exec -it <pod> -- curl http://localhost:8080/health
```

### Upgrade di un Cluster Kubernetes con kubeadm

```bash
# 1. Upgrade il control plane
kubeadm upgrade plan
apt-get update && apt-get install -y kubeadm=1.31.0-*
kubeadm upgrade apply v1.31.0

# 2. Upgrade kubelet e kubectl sul control plane
apt-get install -y kubelet=1.31.0-* kubectl=1.31.0-*
systemctl daemon-reload && systemctl restart kubelet

# 3. Drain e upgrade del worker node
kubectl drain node1 --ignore-daemonsets --delete-emptydir-data
ssh node1 "apt-get install -y kubeadm=1.31.0-* && kubeadm upgrade node"
ssh node1 "apt-get install -y kubelet=1.31.0-* kubectl=1.31.0-*"
ssh node1 "systemctl daemon-reload && systemctl restart kubelet"
kubectl uncordon node1
```

---

## Hands-on Guidato (90 min — su Proxmox con Prometheus + Grafana)

### Esercizio 1 — Helm install kube-prometheus-stack

```bash
# Aggiunge e aggiorna il repo Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Installa lo stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=admin123

# Verifica
kubectl get pods -n monitoring
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
```

Crea un **ServiceMonitor** per la tua applicazione:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: myapp
  endpoints:
  - port: metrics
    interval: 30s
```

### Esercizio 2 — Troubleshooting a Strati

Un ambiente rotto con 3 problemi da trovare in sequenza:

```bash
# Step 1: PVC unbound
kubectl get pvc  # Status: Pending
kubectl describe pvc mydb-data  # → StorageClass non trovata

# Step 2: CrashLoop dopo il fix della PVC
kubectl logs postgres-0 --previous  # → DB password errata nella env var

# Step 3: Service non risponde dopo il fix
kubectl get endpoints myapp-svc  # → nessun endpoint
kubectl get pods -l app=myapp   # → label "app" ma il selector usa "app.kubernetes.io/name"
```

### Esercizio 3 — Cluster Upgrade 1.30 → 1.31

Seguire la procedura standard kubeadm sul cluster Proxmox.
Verificare che le applicazioni rimangano disponibili durante il drain del nodo.

---

## Capstone Challenge (30 min)

> **"Il Cluster Silenzioso"**
>
> Il cluster non espone metriche, un nodo è in `NotReady` e metrics-server non risponde.
> **Prima di toccare qualsiasi cosa**, eseguire un backup di etcd.
>
> ```bash
> etcdctl snapshot save /backup/etcd-$(date +%Y%m%d).db \
>   --endpoints=https://127.0.0.1:2379 \
>   --cacert=/etc/kubernetes/pki/etcd/ca.crt \
>   --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
>   --key=/etc/kubernetes/pki/etcd/healthcheck-client.key
> ```
>
> Poi diagnosticare e risolvere:
> 1. Perché il nodo è `NotReady`? (kubelet, network plugin, certificato scaduto?)
> 2. Perché metrics-server non risponde? (readinessProbe, RBAC, cert?)
> 3. Come ripristinare le metriche in Grafana?

---

## Self-Study Assignment

Completa le challenge su iximiuz Labs prima del prossimo incontro (60–90 min totali).
Cerca nella sezione Challenges: CKA cluster upgrade.

Opzionale: installa Loki + Promtail sul cluster personale e configura una log query
per vedere gli errori delle applicazioni degli incontri precedenti.
