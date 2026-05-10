---
kind: challenge

title: "Il Database che Dimentica: Deployment → StatefulSet"

description: |
  Converti un Deployment PostgreSQL in un StatefulSet con PVC persistente, Secret per le credenziali,
  e un initContainer. Verifica che i dati sopravvivano al delete del Pod.

categories:
- kubernetes

tags:
- statefulset
- pvc
- postgresql
- persistence

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_bad_deployment:
    init: true
    run: |
      kubectl create deployment postgres-bad --image=postgres:15-alpine 2>/dev/null || true
      kubectl set env deployment/postgres-bad \
        POSTGRES_PASSWORD=plaintext-password \
        POSTGRES_DB=myapp 2>/dev/null || true

  verify_secret_created:
    run: |
      kubectl get secret pg-secret -n default >/dev/null 2>&1 || exit 1
      kubectl get secret pg-secret -n default -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d | grep -q . || exit 1

  verify_statefulset_running:
    run: |
      READY=$(kubectl get statefulset postgres-ss -n default \
        -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)
      [ "$READY" -ge 1 ] || exit 1

  verify_pvc_bound:
    run: |
      # Check PVC exists and is Bound
      STATUS=$(kubectl get pvc -n default -l app=postgres-ss \
        -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "missing")
      [ "$STATUS" = "Bound" ] || exit 1

  verify_data_persists:
    run: |
      # Write data, delete pod, check data survives
      POD=$(kubectl get pod -n default -l app=postgres-ss -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
      [ -n "$POD" ] || exit 1
      # Insert a test row
      kubectl exec -n default $POD -- psql -U postgres -d myapp -c \
        "CREATE TABLE IF NOT EXISTS persistence_test (id serial, val text); INSERT INTO persistence_test(val) VALUES('survived');" 2>/dev/null || exit 1
      # Delete the pod
      kubectl delete pod -n default $POD 2>/dev/null
      sleep 15
      # Wait for new pod
      kubectl wait pod -n default -l app=postgres-ss --for=condition=Ready --timeout=60s 2>/dev/null || exit 1
      NEW_POD=$(kubectl get pod -n default -l app=postgres-ss -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
      # Check data is still there
      COUNT=$(kubectl exec -n default $NEW_POD -- psql -U postgres -d myapp -t -c \
        "SELECT COUNT(*) FROM persistence_test WHERE val='survived';" 2>/dev/null | tr -d ' ')
      [ "$COUNT" -ge 1 ] || exit 1
---

_Converti un Deployment PostgreSQL senza stato in un StatefulSet con storage persistente._

---

## Scenario

L'applicazione usa PostgreSQL ma è stata deployata come `Deployment`, il che significa
che ogni volta che il Pod riavvia, tutti i dati vengono persi (ephemeral storage).
Il tuo compito è convertirlo in una configurazione production-ready.

---

## Task 1 — Crea il Secret per le Credenziali

Non usare mai password in chiaro nelle variabili d'ambiente. Crea un Secret:

```bash
kubectl create secret generic pg-secret \
  --from-literal=POSTGRES_PASSWORD=SecureP@ss2024 \
  --from-literal=POSTGRES_USER=postgres \
  --from-literal=POSTGRES_DB=myapp
```

::simple-task
---
:tasks: tasks
:name: verify_secret_created
---
#active
In attesa del Secret `pg-secret` nel namespace default...

#completed
Secret creato correttamente con le credenziali PostgreSQL.
::

---

## Task 2 — Crea lo StatefulSet con PVC

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-ss
  namespace: default
spec:
  serviceName: postgres-ss
  replicas: 1
  selector:
    matchLabels:
      app: postgres-ss
  template:
    metadata:
      labels:
        app: postgres-ss
    spec:
      initContainers:
      - name: init-permissions
        image: alpine:3.19
        command: ["sh", "-c", "chown 999:999 /data"]
        volumeMounts:
        - name: pg-data
          mountPath: /data
      containers:
      - name: postgres
        image: postgres:15-alpine
        envFrom:
        - secretRef:
            name: pg-secret
        volumeMounts:
        - name: pg-data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: pg-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_statefulset_running
---
#active
In attesa dello StatefulSet `postgres-ss` con almeno 1 replica Ready...

#completed
StatefulSet PostgreSQL in esecuzione!
::

::simple-task
---
:tasks: tasks
:name: verify_pvc_bound
---
#active
In attesa che il PVC sia in stato Bound...

#completed
PVC Bound! Il volume persistente è allocato.
::

---

## Task 3 — Verifica la Persistenza dei Dati

Il verifier scrive dati, cancella il Pod, e verifica che i dati sopravvivano.
Assicurati che lo StatefulSet sia completamente in esecuzione prima di procedere.

```bash
# Verifica manuale: inserisci dati e riavvia
POD=$(kubectl get pod -l app=postgres-ss -o jsonpath='{.items[0].metadata.name}')
kubectl exec $POD -- psql -U postgres -d myapp -c "SELECT version();"
```

::simple-task
---
:tasks: tasks
:name: verify_data_persists
---
#active
Il verifier scriverà dati, cancellerà il Pod, e verificherà che i dati sopravvivano...

#completed
I dati sopravvivono al riavvio del Pod! La persistenza funziona.
::

::hint-box
---
:summary: Deployment vs StatefulSet: le differenze chiave
---

| Aspetto | Deployment | StatefulSet |
|---------|-----------|-------------|
| Pod names | Random suffix | Ordinali stabili (postgres-ss-0) |
| Storage | Condiviso o effimero | volumeClaimTemplates per-pod |
| Scaling | Parallelo | Sequenziale (0, 1, 2...) |
| DNS | ClusterIP | Headless + DNS stabile |
| Uso | Stateless apps | Database, cache, queue |
::
