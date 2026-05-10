
> **Playground per questo incontro:** usa il playground Kubernetes multi-nodo su iximiuz Labs:
> **https://labs.iximiuz.com/playgrounds/kubernetes**


## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Spiegare la gerarchia Deployment → ReplicaSet → Pod e il meccanismo di rolling update
- Configurare rolling update con `maxSurge` e `maxUnavailable` per zero downtime
- Configurare un'applicazione con ConfigMap e Secret (volume e variabile d'ambiente)
- Creare un StatefulSet con Headless Service e PersistentVolumeClaim e verificare la persistenza
- Scegliere il tipo di workload corretto tra Deployment, DaemonSet, StatefulSet, Job, CronJob
- Capire QoS classes e il loro impatto sulla gestione della pressione di risorse


## Teoria (50 min)

### La Gerarchia: Deployment → ReplicaSet → Pod

```
Deployment        (strategia di update: RollingUpdate o Recreate)
  └── ReplicaSet-v1  (vecchia versione, scalata a 0 dopo update)
        └── Pod (old)
        └── Pod (old)
  └── ReplicaSet-v2  (nuova versione, mantenuta come rollback)
        └── Pod (new)
        └── Pod (new)
        └── Pod (new)
```

Il **Deployment controller** gestisce la progressione:
1. Crea una nuova ReplicaSet per ogni update (`kubectl set image`, `kubectl apply`)
2. Scala la nuova ReplicaSet su e la vecchia giù, rispettando `maxSurge`/`maxUnavailable`
3. Mantiene la storia delle ReplicaSet (configurabile con `revisionHistoryLimit`)

```bash
# Vedi la storia del Deployment
kubectl rollout history deployment/myapp

# Dettagli di una specifica revision
kubectl rollout history deployment/myapp --revision=3

# Rollback all'ultima revision stabile
kubectl rollout undo deployment/myapp

# Rollback a una revision specifica
kubectl rollout undo deployment/myapp --to-revision=2

# Monitora il rolling update in corso
kubectl rollout status deployment/myapp

# Pausa un rollout in corso (per A/B testing manuale)
kubectl rollout pause deployment/myapp
kubectl rollout resume deployment/myapp
```

### Rolling Update: maxSurge e maxUnavailable

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2        # Max pod in PIÙ rispetto a replicas durante l'update
      maxUnavailable: 1  # Max pod NON READY durante l'update
  # → aggiorna 2 alla volta: +2 nuovi, -1 vecchi, finché tutti sono aggiornati
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: myapp:v2
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          # CRITICO: senza readiness probe, kubernetes non aspetta che il nuovo
          # pod sia pronto prima di eliminare il vecchio → possibile downtime
```

**`minReadySeconds` — prevenire i falsi "ready":**

Per zero-downtime reale, aggiungi `spec.minReadySeconds` al Deployment. Senza questo campo, Kubernetes conta un Pod come "ready" non appena la readiness probe risponde una volta — anche se il container va subito in crash.

```yaml
spec:
  minReadySeconds: 10   # Il Pod deve essere Ready CONTINUAMENTE per 10s prima che il rollout avanzi
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

> **Avviso:** `maxUnavailable: 0` e `maxSurge: 0` contemporaneamente non sono validi — l'apiserver rifiuta la configurazione. Almeno uno dei due deve essere > 0.

**Strategia Recreate** — utile per applicazioni che non supportano più versioni simultanee:

```yaml
strategy:
  type: Recreate
  # Elimina TUTTI i Pod vecchi prima di crearne di nuovi → downtime garantito
```

### Tipi di Workload: Quale Scegliere

| Tipo | Garanzie | Usato per |
|------|---------|-----------|
| **Deployment** | N repliche intercambiabili, rolling update | API server, frontend, worker stateless |
| **DaemonSet** | Un Pod per ogni nodo (o subset) | log collector, monitoring agent, CNI plugin |
| **StatefulSet** | Identità stabile, storage dedicato, ordine di avvio | PostgreSQL, Kafka, Zookeeper, Redis cluster |
| **Job** | Completamento garantito (non loop eterno) | Migrazione DB, report generation, batch |
| **CronJob** | Esecuzione periodica | Backup notturno, cleanup, report schedulati |

```yaml
# DaemonSet — garantisce un Pod su ogni nodo
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-collector
spec:
  selector:
    matchLabels:
      app: log-collector
  template:
    metadata:
      labels:
        app: log-collector
    spec:
      tolerations:
      - key: node-role.kubernetes.io/control-plane
        operator: Exists
        effect: NoSchedule  # Schedula anche sul control plane
      containers:
      - name: fluentbit
        image: fluent/fluent-bit:2.2
        volumeMounts:
        - name: varlog
          mountPath: /var/log
          readOnly: true
      volumes:
      - name: varlog
        hostPath:
          path: /var/log

# Job — completamento one-shot
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  completions: 1
  parallelism: 1
  backoffLimit: 3    # Riprova max 3 volte
  template:
    spec:
      restartPolicy: OnFailure  # Job devono essere OnFailure o Never (non Always)
      containers:
      - name: migrate
        image: myapp-migrations:1.5.0
        envFrom:
        - secretRef:
            name: db-credentials

# CronJob — esecuzione periodica
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-backup
spec:
  schedule: "0 2 * * *"     # Ogni notte alle 2:00 UTC
  concurrencyPolicy: Forbid  # Non avviare se il precedente è ancora in corso
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: backup
            image: myapp-backup:latest
```

**Sintassi del campo `schedule` (formato cron):**

```
┌───────── minuto (0-59)
│ ┌─────── ora (0-23)
│ │ ┌───── giorno del mese (1-31)
│ │ │ ┌─── mese (1-12)
│ │ │ │ ┌─ giorno della settimana (0-6, 0=domenica)
│ │ │ │ │
* * * * *
```

| Schedule | Significato |
|----------|-------------|
| `0 2 * * *` | Ogni notte alle 2:00 |
| `*/15 * * * *` | Ogni 15 minuti |
| `0 9 * * 1-5` | Alle 9:00, lunedì-venerdì |
| `0 0 1 * *` | Primo giorno di ogni mese a mezzanotte |

> **Tip:** usa [crontab.guru](https://crontab.guru/) per verificare e testare le espressioni cron.

**Comportamento degli Init Container in caso di fallimento:**

Se un init container fallisce, il Pod entra in `CrashLoopBackOff` senza mai avviare i container principali. Il kubelet riprova l'init container con backoff esponenziale (10s, 20s, 40s... fino a 5 min).

```bash
# Diagnostica: vedi quale init container fallisce
kubectl describe pod <pod> | grep -A 10 "Init Containers:"
kubectl logs <pod> -c <init-container-name>
```


### PodDisruptionBudget (PDB)

Un PDB limita il numero di Pod che possono essere interrotti **contemporaneamente**
durante disruption volontarie (drain, upgrade, scale-down) — non protegge da crash involontari.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
spec:
  minAvailable: 2        # almeno 2 Pod devono restare attivi
  # oppure:
  # maxUnavailable: 1    # al massimo 1 Pod può essere non disponibile
  selector:
    matchLabels:
      app: myapp
```

```bash
# Crea il PDB
kubectl apply -f - <<'EOF'
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: nginx-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: nginx
EOF

# Verifica lo stato del PDB
kubectl get pdb
kubectl describe pdb nginx-pdb

# Prova a fare drain di un nodo — il PDB blocca se non ci sono abbastanza repliche
kubectl drain worker-1 --ignore-daemonsets --delete-emptydir-data
```

**Quando usare un PDB:**

| Scenario | PDB consigliato |
|----------|----------------|
| API server con 3 repliche | `minAvailable: 2` |
| Database StatefulSet (1 replica) | `maxUnavailable: 0` (blocca il drain) |
| Worker pool grande (10 repliche) | `maxUnavailable: 25%` |
| Batch Job | Non serve PDB |

> **Buona pratica:** ogni Deployment in produzione con ≥2 repliche dovrebbe avere un PDB.
> Senza PDB, `kubectl drain` può terminare tutti i Pod contemporaneamente.


### ConfigMap e Secret: Configurazione come Oggetti Kubernetes

**ConfigMap** — configurazione non sensibile (env vars, file di config, script):

```bash
# Da literal
kubectl create configmap app-config \
  --from-literal=LOG_LEVEL=debug \
  --from-literal=APP_ENV=production

# Da file (il nome del file diventa la chiave)
kubectl create configmap nginx-config --from-file=nginx.conf

# Da directory (tutti i file diventano chiavi)
kubectl create configmap app-configs --from-file=./config-dir/

# Via YAML
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "debug"
  DATABASE_HOST: "postgres.production.svc.cluster.local"
  nginx.conf: |
    server {
      listen 80;
      location / {
        proxy_pass http://backend:8080;
      }
    }
EOF
```

**Secret** — dati sensibili (password, token, certificati):

```bash
# Da literal (base64-encoded automaticamente)
kubectl create secret generic db-credentials \
  --from-literal=DB_USER=admin \
  --from-literal=DB_PASSWORD=supersecret

# Secret TLS
kubectl create secret tls myapp-tls \
  --cert=tls.crt --key=tls.key

# Secret per registry privato
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=myuser \
  --docker-password=mypassword
```

**Attenzione:** i Secret in Kubernetes sono base64-encoded, NON encrypted, per default.
Per encryption at rest, configurare l'EncryptionConfiguration nell'apiserver.
Per gestione avanzata, usare External Secrets Operator + HashiCorp Vault / AWS Secrets Manager.

```bash
# Vedi il valore di un secret (decodificato)
kubectl get secret db-credentials -o jsonpath='{.data.DB_PASSWORD}' | base64 -d
```

#### Mounting: File vs Variabile d'Ambiente

```yaml
spec:
  containers:
  - name: app
    image: myapp:v1

    # ── VARIABILI D'AMBIENTE ──────────────────────────────────────────────
    # Singola chiave come env var
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: DB_PASSWORD
    - name: LOG_LEVEL
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: LOG_LEVEL

    # Tutte le chiavi del ConfigMap/Secret come env vars (nome chiave = nome var)
    envFrom:
    - configMapRef:
        name: app-config
    - secretRef:
        name: db-credentials

    # ── VOLUME MOUNT ──────────────────────────────────────────────────────
    # Il file di configurazione appare come file sul filesystem
    # VANTAGGIO: aggiornabile senza riavviare il Pod (hot reload se l'app supporta SIGHUP)
    # TEMPISTICA: il kubelet sincronizza la ConfigMap ogni ~1 minuto (--sync-frequency default).
    # La modifica diventa visibile nel volume in 60-90 secondi dall'aggiornamento della ConfigMap.
    # Le variabili d'ambiente (env/envFrom) NON si aggiornano — richiedono riavvio del Pod.
    volumeMounts:
    - name: nginx-config
      mountPath: /etc/nginx/conf.d/
      readOnly: true
    - name: tls-certs
      mountPath: /etc/ssl/private/
      readOnly: true

  volumes:
  - name: nginx-config
    configMap:
      name: nginx-config        # Ogni chiave → un file
      defaultMode: 0444         # read-only
  - name: tls-certs
    secret:
      secretName: myapp-tls
      defaultMode: 0400         # owner read-only (certificati privati)
```

**Quando usare volume vs env var:**

| Criterio | Volume | Env Var |
|----------|--------|---------|
| File di configurazione | ✓ | ✗ |
| Certificati/chiavi private | ✓ | ✗ |
| Aggiornamento hot reload | ✓ | ✗ |
| Password/token brevi | ✓ | ✓ |
| SIGTERM sensibile | Dipende | ✓ |


### PersistentVolume, PVC e StorageClass

```
StorageClass (definisce il "tipo" di storage: SSD, HDD, network, local)
    │
    ▼ (provisioning dinamico)
PersistentVolume (PV) — il volume fisico (creato dal cloud provider o staticamente)
    │
    ▼ (binding 1:1)
PersistentVolumeClaim (PVC) — la "richiesta" dello sviluppatore
    │
    ▼ (montato come volume)
Pod → container
```

**StorageClass** — definisce come viene provisionato il volume:

```yaml
# StorageClass per EBS su AWS
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
reclaimPolicy: Delete    # Elimina il PV quando il PVC viene cancellato
volumeBindingMode: WaitForFirstConsumer  # Aspetta che il Pod sia schedulato
allowVolumeExpansion: true
```

**PVC** — la richiesta dello sviluppatore:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
spec:
  accessModes:
    - ReadWriteOnce    # Un solo nodo può montare in R/W
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 50Gi
```

**Access Modes:**

| Mode | Abbreviazione | Significato |
|------|---------------|-------------|
| `ReadWriteOnce` | RWO | Montabile in R/W da un solo nodo (single-node databases) |
| `ReadOnlyMany` | ROX | Montabile in sola lettura da più nodi (contenuto statico) |
| `ReadWriteMany` | RWX | Montabile in R/W da più nodi (NFS, CephFS) |
| `ReadWriteOncePod` | RWOP | Montabile in R/W da un solo Pod (garantisce unicità) |


### EmptyDir: Volume Temporaneo del Pod

Un `emptyDir` è un volume creato quando il Pod viene schedulato e **eliminato quando il Pod termina**. Tutti i container del Pod possono leggerlo e scriverlo.

```yaml
volumes:
- name: cache
  emptyDir:
    sizeLimit: 500Mi      # Limite opzionale (evita di riempire il disco del nodo)
- name: ram-cache
  emptyDir:
    medium: Memory         # Backed by RAM (tmpfs) — molto veloce, conta nel memory limit
```

| Tipo di volume | Ciclo di vita | Persistenza | Caso d'uso |
|---------------|---------------|-------------|------------|
| **emptyDir** | Legato al Pod | No — perso con il Pod | Cache, file temporanei, comunicazione tra container |
| **emptyDir (Memory)** | Legato al Pod | No — perso con il Pod | Cache ad alte prestazioni, dati sensibili |
| **hostPath** | Legato al Nodo | Sì (sul nodo) | Log del nodo, socket Docker — **evitare in produzione** |
| **PVC** | Indipendente | Sì | Database, storage persistente |

> **Attenzione:** `emptyDir` con `medium: Memory` consuma RAM dal memory limit del container. Se il container supera il limit, viene OOM-killed.


### ResourceQuota e LimitRange: Governance del Namespace

**ResourceQuota** — limita le risorse **totali** consumabili in un namespace:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-a-quota
  namespace: team-a
spec:
  hard:
    requests.cpu: "10"          # Max 10 CPU totali richieste
    requests.memory: 20Gi       # Max 20Gi RAM totali richieste
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"                  # Max 50 Pod nel namespace
    persistentvolumeclaims: "10"
    services.loadbalancers: "2"
```

**LimitRange** — imposta default e limiti **per singolo container/Pod**:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: team-a
spec:
  limits:
  - type: Container
    default:              # Limiti applicati se il container non li specifica
      cpu: 500m
      memory: 256Mi
    defaultRequest:       # Request applicate se il container non le specifica
      cpu: 100m
      memory: 128Mi
    min:                  # Minimo consentito
      cpu: 50m
      memory: 64Mi
    max:                  # Massimo consentito
      cpu: "2"
      memory: 2Gi
```

```bash
# Verifica le quote del namespace
kubectl describe resourcequota -n team-a
# → Used: requests.cpu=3, requests.memory=8Gi
# → Hard: requests.cpu=10, requests.memory=20Gi

# Verifica i limiti per container
kubectl describe limitrange -n team-a
```

> **Best practice:** in cluster multi-tenant, ogni namespace di team dovrebbe avere sia ResourceQuota (cap totale) sia LimitRange (default per container). Senza LimitRange, i Pod senza requests/limits consumano risorse senza controllo.


### StatefulSet: Identità Stabili e Storage Dedicato

Lo StatefulSet garantisce tre cose che il Deployment non può garantire:
1. **Nomi stabili**: `postgres-0`, `postgres-1`, `postgres-2` (non hash casuali)
2. **Ordine di avvio/spegnimento**: 0 prima, poi 1, poi 2 (configurabile)
3. **Storage dedicato**: ogni Pod ha il suo PVC che sopravvive al riavvio

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  clusterIP: None    # Headless Service — crea DNS per ogni Pod individualmente
  selector:
    app: postgres
  ports:
  - port: 5432
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres    # Riferimento al Headless Service
  replicas: 3
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
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: pg-secret
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
        readinessProbe:
          exec:
            command: ["pg_isready", "-U", "postgres"]
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
  # volumeClaimTemplates: genera un PVC per ogni replica
  # → data-postgres-0, data-postgres-1, data-postgres-2
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 20Gi
```

**DNS del StatefulSet con Headless Service:**
```
postgres-0.postgres.default.svc.cluster.local  → IP di postgres-0
postgres-1.postgres.default.svc.cluster.local  → IP di postgres-1
postgres-2.postgres.default.svc.cluster.local  → IP di postgres-2
postgres.default.svc.cluster.local             → tutti i Pod (round-robin)
```

**Update strategy dello StatefulSet:**

Per default lo StatefulSet usa `RollingUpdate` (aggiorna un Pod alla volta, dal più alto al più basso). Per database in produzione, considera `OnDelete`: il Pod viene aggiornato solo quando lo elimini manualmente, dandoti controllo completo sulla procedura.

```yaml
spec:
  updateStrategy:
    type: OnDelete   # Aggiorna solo quando il Pod viene eliminato manualmente
    # type: RollingUpdate  # Default — aggiorna automaticamente dal Pod N a 0
```

```bash
# Ordine di avvio: 0 prima, 1 poi, 2 infine
kubectl get pods -l app=postgres -w

# Lo spegnimento è inverso: 2 prima, poi 1, poi 0
kubectl scale statefulset postgres --replicas=0

# I PVC sopravvivono alla cancellazione del Pod (ma NON del StatefulSet!)
kubectl delete pod postgres-0
kubectl get pvc  # data-postgres-0 esiste ancora

# Espandi un PVC (se StorageClass ha allowVolumeExpansion: true)
kubectl patch pvc data-postgres-0 -p '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'
```


## Hands-on Guidato (90 min)

### Esercizio 1 — Rolling Update con Zero Downtime

```bash
# Crea il Deployment iniziale
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0    # Zero downtime garantito
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      containers:
      - name: app
        image: nginx:1.24
        resources:
          requests:
            memory: "32Mi"
            cpu: "50m"
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 2
          periodSeconds: 2
EOF

# Avvia un generatore di traffico per verificare zero downtime
kubectl run traffic-gen --image=busybox --restart=Never -- \
  sh -c 'i=0; while true; do
    code=$(wget -qO- -S http://webapp 2>&1 | grep "HTTP/" | awk '"'"'{print $2}'"'"')
    echo "req $i: HTTP $code"
    i=$((i+1))
    sleep 0.3
  done'

# In un altro terminale: esegui il rolling update
kubectl set image deployment/webapp app=nginx:1.25
kubectl rollout status deployment/webapp

# Verifica la history
kubectl rollout history deployment/webapp

# Rollback se necessario
kubectl rollout undo deployment/webapp

# Cleanup
kubectl delete pod traffic-gen
```

### Esercizio 2 — ConfigMap e Secret: Volume e Env Var

```bash
# Crea una config nginx personalizzata
cat > nginx.conf <<'EOF'
server {
    listen 80;
    server_name _;
    location / {
        return 200 "Hello from custom nginx config!\n";
    }
    location /health {
        return 200 "OK\n";
    }
}
EOF

kubectl create configmap nginx-custom --from-file=default.conf=nginx.conf

# Crea un secret con "credenziali"
kubectl create secret generic app-secret \
  --from-literal=API_KEY=sk-demo-12345 \
  --from-literal=DB_URL=postgres://admin:pass@db:5432/mydb

# Crea il Pod che usa entrambi
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: configdemo
spec:
  containers:
  - name: nginx
    image: nginx:alpine
    envFrom:
    - secretRef:
        name: app-secret
    volumeMounts:
    - name: nginx-conf
      mountPath: /etc/nginx/conf.d/
  volumes:
  - name: nginx-conf
    configMap:
      name: nginx-custom
EOF

# Verifica il config file montato
kubectl exec configdemo -- cat /etc/nginx/conf.d/default.conf

# Verifica le variabili d'ambiente (secret)
kubectl exec configdemo -- env | grep -E "API_KEY|DB_URL"

# Aggiorna il ConfigMap (hot reload senza riavvio)
kubectl create configmap nginx-custom \
  --from-literal=default.conf="server { listen 80; location / { return 200 'Updated!'; } }" \
  --dry-run=client -o yaml | kubectl apply -f -

# Attendi che Kubernetes sincronizzi (default: ~60s)
sleep 65
kubectl exec configdemo -- cat /etc/nginx/conf.d/default.conf
```

### Esercizio 3 — StatefulSet PostgreSQL con PVC

```bash
# Crea il secret per la password
kubectl create secret generic pg-secret --from-literal=password=mypassword

# Applica StatefulSet + Headless Service
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  clusterIP: None
  selector:
    app: postgres
  ports:
  - port: 5432
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
        image: postgres:16-alpine
        env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: pg-secret
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
        readinessProbe:
          exec:
            command: ["pg_isready", "-U", "postgres"]
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 1Gi
EOF

# Aspetta che sia Ready
kubectl wait pod/postgres-0 --for=condition=ready --timeout=120s

# Crea dati di test
kubectl exec -it postgres-0 -- psql -U postgres <<'SQL'
CREATE TABLE test_data (id SERIAL, value TEXT);
INSERT INTO test_data (value) VALUES ('data persists after restart!');
SELECT * FROM test_data;
SQL

# Verifica i PVC creati
kubectl get pvc
# → data-postgres-0   Bound   1Gi   RWO

# Cancella il Pod (simula crash) — il PVC sopravvive
kubectl delete pod postgres-0
kubectl wait pod/postgres-0 --for=condition=ready --timeout=120s

# Verifica che i dati persistano
kubectl exec -it postgres-0 -- psql -U postgres -c "SELECT * FROM test_data;"
```

### Esercizio 4 — CronJob per Backup

```bash
kubectl apply -f - <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: log-cleanup
spec:
  schedule: "*/1 * * * *"    # Ogni minuto (per demo; in prod ogni notte)
  successfulJobsHistoryLimit: 2
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: cleanup
            image: busybox:1.36
            command: ['sh', '-c', 'echo "Cleanup at $(date): removing logs older than 30d"; ls /tmp']
EOF

# Aspetta che il primo Job venga triggerato (~1 minuto)
kubectl get cronjob log-cleanup -w

# Vedi i Job creati
kubectl get jobs
kubectl logs job/<job-name>
```


## Capstone Challenge (30 min)

> **"Il Database che Dimentica"**
>
> Viene fornita un'applicazione con un Deployment PostgreSQL che perde tutti i dati ad ogni restart.
> Il tuo compito:
>
> 1. **Converti** il Deployment in StatefulSet con Headless Service
> 2. **Aggiungi** un PVC per `/var/lib/postgresql/data` (1Gi, ReadWriteOnce)
> 3. **Sposta** la password in un Secret (non hardcodata in `env.value`)
> 4. **Aggiungi** un `initContainer` che popola una tabella di test al primo avvio
> 5. **Aggiungi** una `readinessProbe` con `pg_isready`
> 6. **Verifica** la persistenza: `kubectl delete pod postgres-0` → i dati ci sono ancora
>
> ```bash
> # Verifica finale
> kubectl exec postgres-0 -- psql -U postgres -c "SELECT count(*) FROM test_data;"
> # → count = 1 (dato sopravvissuto al restart)
> ```
>
> **Bonus:** aggiungi un CronJob che inserisce un record ogni 5 minuti come "heartbeat".


## Self-Study Assignment

Completa le challenge su iximiuz Labs prima del prossimo incontro (60–90 min totali).
Cerca nella sezione Challenges della piattaforma:

- **"Configure a Pod with a ConfigMap"** — ConfigMap come volume
- **"Store Kubernetes Secrets"** — Secret management
- **"Kubernetes Deployment with Rolling Update"** — rolling update estrategia
- **"Kubernetes StatefulSet with Persistent Volume"** — storage persistente
- **"QoS Classes"** — resource constraints

**Letture consigliate:**
- [Deployments — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [StatefulSets — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [Persistent Volumes — kubernetes.io](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
- [ConfigMaps — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Secrets — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/secret/)


## Risorse Aggiuntive

### Documentazione Ufficiale Kubernetes
- [Deployments — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) — rolling updates, rollback, pausa e ripresa del deploy, progress deadline
- [StatefulSets — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) — identità stabile, ordinamento, PVC per pod, update strategies
- [DaemonSets — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/) — workload per ogni nodo, update strategy RollingUpdate/OnDelete, tolerations
- [Jobs — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/job/) — completionMode, backoffLimit, ttlSecondsAfterFinished, indexed jobs
- [CronJobs — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/) — schedule syntax, concurrencyPolicy (Allow/Forbid/Replace), historyLimit
- [Persistent Volumes — kubernetes.io](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) — lifecycle PV/PVC, access modes, reclaim policy, volume expansion, clones
- [Storage Classes — kubernetes.io](https://kubernetes.io/docs/concepts/storage/storage-classes/) — provisioner, parameters, volumeBindingMode, allowVolumeExpansion

### Gestione Avanzata dei Segreti
- [External Secrets Operator](https://external-secrets.io/) — sincronizza segreti da AWS SSM Parameter Store, HashiCorp Vault, GCP Secret Manager, Azure Key Vault
- [Sealed Secrets — Bitnami](https://github.com/bitnami-labs/sealed-secrets) — encrypta i Secret con chiave pubblica per salvarli sicuramente in Git
- [HashiCorp Vault Agent Injector](https://developer.hashicorp.com/vault/docs/platform/k8s/injector) — inject dei segreti da Vault nei Pod tramite sidecar annotation-based
- [Doppler Kubernetes Operator](https://docs.doppler.com/docs/kubernetes-operator) — sync automatico dei segreti da Doppler a Kubernetes Secret
- [Reloader — Stakater](https://github.com/stakater/Reloader) — riavvia automaticamente i Pod quando ConfigMap o Secret vengono aggiornati

### Storage: Driver CSI per i Cloud Provider
- [AWS EBS CSI Driver](https://github.com/kubernetes-sigs/aws-ebs-csi-driver) — volumi EBS dinamici su EKS: gp3, io1, io2 con encryption e snapshots
- [GCP Persistent Disk CSI Driver](https://github.com/kubernetes-sigs/gcp-compute-persistent-disk-csi-driver) — volumi GCE Persistent Disk su GKE: pd-standard, pd-ssd, pd-balanced
- [Azure Disk CSI Driver](https://github.com/kubernetes-sigs/azuredisk-csi-driver) — Azure Managed Disk su AKS: Standard_LRS, Premium_LRS, UltraSSD_LRS
- [Rook Ceph](https://rook.io/) — storage orchestrator per Ceph in Kubernetes: block, filesystem, object storage su bare-metal
- [Longhorn — CNCF](https://longhorn.io/) — storage distribuito per Kubernetes: replica, backup su S3, snapshot, UI web

### Backup e Disaster Recovery
- [Velero — VMware](https://velero.io/) — backup e restore di risorse Kubernetes e PersistentVolumes su S3/GCS/Azure Blob
- [Kasten K10 — Veeam](https://www.kasten.io/) — piattaforma enterprise di backup e mobility per Kubernetes con policy-based automation
- [etcdadm](https://github.com/kubernetes-sigs/etcdadm) — gestione del lifecycle di etcd: backup, restore, cluster upgrade

### Blog e Tutorial
- [Learnk8s — Kubernetes storage patterns](https://learnk8s.io/kubernetes-storage/) — pattern di storage in Kubernetes con esempi pratici e diagrammi
- [Martin Heinz — Kubernetes StatefulSets in Production](https://martinheinz.dev/blog/76) — guida pratica agli StatefulSet: PostgreSQL, Redis, Kafka con scenari reali
- [Ivan Velichko — Kubernetes Volumes (iximiuz.com)](https://iximiuz.com/en/posts/kubernetes-volumes/) — volume types spiegati con esempi live: emptyDir, hostPath, PVC, projected
- [Learnk8s — ConfigMaps and Secrets as volumes](https://learnk8s.io/configmap-secret-volumes) — hot reload di configurazione senza riavviare i Pod

### Strumenti di Debug Workload
- [kubectl debug](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/) — debug di Pod in esecuzione con container effimeri (ephemeral containers)
- [Komodor](https://komodor.com/) — Kubernetes troubleshooting platform con timeline degli eventi e root cause analysis
- [Robusta](https://home.robusta.dev/) — alerting basato su Prometheus con automazione della risposta agli incidenti K8s
