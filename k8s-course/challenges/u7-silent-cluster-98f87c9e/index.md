---
kind: challenge

title: "Il Cluster Silenzioso: Nodo NotReady e Etcd Backup"

description: |
  Un nodo è in stato NotReady, il metrics-server non funziona, e devi fare
  il backup di etcd prima di toccare qualsiasi cosa. Troubleshooting a strati
  su un cluster Kubernetes reale.

categories:
- kubernetes

tags:
- troubleshooting
- etcd
- notready
- metrics-server

difficulty: hard

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_broken_state:
    init: true
    run: |
      # Stop kubelet on a worker node to simulate NotReady
      # (This is best effort - may not work in all playground configs)
      WORKER=$(kubectl get nodes --no-headers | grep -v master | grep -v control-plane | awk '{print $1}' | head -1)
      if [ -n "$WORKER" ]; then
        kubectl cordon $WORKER 2>/dev/null || true
      fi
      # Kill metrics-server if it exists
      kubectl scale deployment metrics-server -n kube-system --replicas=0 2>/dev/null || true

  verify_etcd_backup:
    run: |
      # Check etcd backup file exists
      [ -f /tmp/etcd-backup.db ] || exit 1
      # Check file is not empty and looks like etcd snapshot
      SIZE=$(stat -c %s /tmp/etcd-backup.db 2>/dev/null || echo 0)
      [ "$SIZE" -gt 10000 ] || exit 1

  verify_node_analysis:
    run: |
      # Check /tmp/node-analysis.txt exists with troubleshooting notes
      [ -f /tmp/node-analysis.txt ] || exit 1
      wc -c /tmp/node-analysis.txt | awk '{exit ($1 < 50)}'

  verify_metrics_server_running:
    run: |
      READY=$(kubectl get deployment metrics-server -n kube-system \
        -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)
      [ "$READY" -ge 1 ] || exit 1
---

_Il cluster ha problemi. Prima di toccare qualsiasi cosa, fai il backup di etcd._

---

## Scenario

Stai guardando il cluster e vedi:
- Un nodo è in stato `NotReady` (o `SchedulingDisabled`)
- Il `metrics-server` non risponde
- L'utente ti chiede di "sistemare tutto subito"

**Regola d'oro**: prima di qualsiasi intervento su un cluster di produzione, **backup di etcd**.

---

## Task 1 — Backup Etcd (Prima di Tutto)

```bash
# Trova dove gira etcd
kubectl get pods -n kube-system | grep etcd

# Ottieni i parametri di connessione
kubectl describe pod -n kube-system $(kubectl get pod -n kube-system -l component=etcd \
  -o jsonpath='{.items[0].metadata.name}')

# Esegui il backup
ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd-backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# Verifica l'integrità
ETCDCTL_API=3 etcdctl snapshot status /tmp/etcd-backup.db --write-out=table
```

::simple-task
---
:tasks: tasks
:name: verify_etcd_backup
---
#active
In attesa del backup etcd in `/tmp/etcd-backup.db` (dimensione > 10KB)...

#completed
Backup etcd completato! Ora puoi procedere con il troubleshooting.
::

---

## Task 2 — Analisi del Nodo

Documenta il tuo troubleshooting in `/tmp/node-analysis.txt`:

```bash
# Stato dei nodi
kubectl get nodes -o wide | tee /tmp/node-analysis.txt

# Condizioni del nodo problematico
NODE=$(kubectl get nodes --no-headers | grep -v Ready | head -1 | awk '{print $1}')
echo "--- Condizioni nodo: $NODE ---" >> /tmp/node-analysis.txt
kubectl describe node $NODE | grep -A20 "Conditions:" >> /tmp/node-analysis.txt

# Events recenti
kubectl describe node $NODE | grep -A10 "Events:" >> /tmp/node-analysis.txt
```

::simple-task
---
:tasks: tasks
:name: verify_node_analysis
---
#active
In attesa dell'analisi del nodo in `/tmp/node-analysis.txt`...

#completed
Analisi documentata.
::

---

## Task 3 — Ripristina il Metrics Server

```bash
# Ripristina le repliche
kubectl scale deployment metrics-server -n kube-system --replicas=1

# Attendi che sia Ready
kubectl wait deployment metrics-server -n kube-system \
  --for=condition=Available --timeout=120s

# Verifica
kubectl top nodes
kubectl top pods -A
```

::simple-task
---
:tasks: tasks
:name: verify_metrics_server_running
---
#active
In attesa che il `metrics-server` sia Available...

#completed
Metrics server in esecuzione! Ora puoi usare `kubectl top`.
::

::hint-box
---
:summary: Procedura sistematica di troubleshooting
---

**Livelli di ispezione (dall'esterno all'interno):**

1. **Cluster**: `kubectl get nodes`, `kubectl get componentstatus`
2. **Namespace**: `kubectl get all -n <ns>`, events
3. **Pod**: `describe pod`, `logs`, `exec` per test connettività
4. **Container**: logs applicazione, probe failures
5. **App**: health endpoint, metriche applicative

Non saltare livelli! Un problema "strano" nel Pod spesso ha causa nel nodo.
::
