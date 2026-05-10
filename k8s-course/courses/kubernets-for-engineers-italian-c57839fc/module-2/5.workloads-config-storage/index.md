---
kind: lesson

title: Workload, Configurazione e Storage

description: |
  Deployment → ReplicaSet → Pod, rolling update e rollback. ConfigMap e Secret.
  StatefulSet con PVC, DaemonSet e Job: scegliere il tipo corretto per ogni workload.

name: workloads-config-storage
slug: incontro-4

createdAt: 2026-02-23
updatedAt: 2026-02-23

playground:
  name: k8s-omni
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Spiegare la gerarchia Deployment → ReplicaSet → Pod e il meccanismo di rolling update
- Configurare un'applicazione con ConfigMap e Secret (montaggio come volume e come env var)
- Creare un StatefulSet con PersistentVolumeClaim e verificare la persistenza dei dati
- Distinguere DaemonSet, StatefulSet e Job e scegliere il tipo corretto per ogni workload

## Teoria (50 min)

### La Gerarchia Deployment → ReplicaSet → Pod

```
Deployment        (gestisce la strategia di update)
  └── ReplicaSet  (mantiene N repliche del Pod)
        └── Pod   (unità atomica di scheduling)
        └── Pod
        └── Pod
```

Il Deployment crea una nuova ReplicaSet per ogni update, poi scala la vecchia a 0.
Con `strategy: RollingUpdate`, questo avviene gradualmente in base a `maxSurge` e `maxUnavailable`.

```bash
# Monitora un rolling update
kubectl rollout status deployment/myapp
kubectl rollout history deployment/myapp

# Rollback all'ultima versione stabile
kubectl rollout undo deployment/myapp
```

### DaemonSet, StatefulSet, Job

| Tipo | Usa quando... | Esempi |
|------|--------------|--------|
| **Deployment** | App stateless, N repliche intercambiabili | API server, frontend |
| **DaemonSet** | Un Pod per ogni nodo | log collector, monitoring agent |
| **StatefulSet** | App con identità stabile e storage dedicato | PostgreSQL, Kafka, etcd |
| **Job** | Task one-shot o batch | migration, report generation |

### ConfigMap e Secret

ConfigMap per configurazione non sensibile, Secret per credenziali e certificati.

```yaml
# Montato come volume (file su filesystem)
volumes:
- name: config
  configMap:
    name: app-config
volumeMounts:
- name: config
  mountPath: /etc/app

# Montato come variabile d'ambiente
envFrom:
- configMapRef:
    name: app-config
- secretRef:
    name: db-credentials
```

### PersistentVolume e PersistentVolumeClaim

```
StorageClass → PersistentVolume (PV) → PersistentVolumeClaim (PVC) → Pod
               (provisioning auto)    (richiesta dello sviluppatore)
```

Access modes: `ReadWriteOnce` (RWO), `ReadOnlyMany` (ROX), `ReadWriteMany` (RWX).
Reclaim policy: `Delete` (default), `Retain` (manuale), `Recycle` (deprecated).

## Hands-on Guidato (90 min)

### Esercizio 1 — Rolling Update con 0 Downtime

```bash
# Lancia un curl loop in background
kubectl run client --image=curlimages/curl --restart=Never -- \
  sh -c 'while true; do curl -s http://myapp; sleep 0.5; done'
kubectl logs -f client &

# Aggiorna l'immagine — osserva nessun errore nel curl loop
kubectl set image deployment/myapp app=nginx:1.25 --record
kubectl rollout status deployment/myapp
```

### Esercizio 2 — ConfigMap e Secret come File e Env Var

```bash
# Crea ConfigMap
kubectl create configmap app-config \
  --from-literal=LOG_LEVEL=debug \
  --from-file=config.yaml

# Crea Secret
kubectl create secret generic db-creds \
  --from-literal=DB_PASSWORD=supersecret

# Verifica il mounting nel Pod
kubectl exec -it myapp -- cat /etc/app/config.yaml
kubectl exec -it myapp -- env | grep DB_PASSWORD
```

### Esercizio 3 — StatefulSet PostgreSQL con PVC

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:16
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: pg-secret
              key: password
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
```

```bash
# Verifica persistenza: cancella il Pod e riconnettiti
kubectl delete pod postgres-0
kubectl exec -it postgres-0 -- psql -U postgres -c "SELECT * FROM mytable;"
```

## Capstone Challenge (30 min)

> **"Il Database che Dimentica"**
>
> Un Deployment PostgreSQL perde tutti i dati ad ogni restart perché non ha PVC.
> Il tuo compito:
> 1. Convertire il Deployment in StatefulSet
> 2. Aggiungere un PVC per `/var/lib/postgresql/data`
> 3. Spostare la password in un Secret (non più hardcodata nell'env)
> 4. Aggiungere un initContainer che crea il database iniziale
> 5. Verificare che i dati persistano dopo `kubectl delete pod postgres-0`

## Self-Study Assignment

Completa le challenge su iximiuz Labs prima del prossimo incontro (60–90 min totali).
Cerca nella sezione Challenges della piattaforma: ConfigMap/Secret, PVC, Deployment+Secret,
QoS Classes, e resource constraints troubleshooting.
