---
kind: unit
title: "Backup e Disaster Recovery con Velero"
name: velero-backup-dr
---

## Obiettivi

Al termine di questa lezione i partecipanti saranno in grado di:

- Identificare cosa va protetto in un cluster Kubernetes (etcd, risorse, PV, secrets)
- Spiegare le differenze tra backup etcd, GitOps e Velero
- Installare Velero e configurare BackupStorageLocation e VolumeSnapshotLocation
- Creare backup on-demand e schedulati con selettori namespace/label
- Eseguire restore completi e parziali, inclusa la migrazione cross-cluster
- Implementare best practice di disaster recovery (3-2-1, test restore, monitoring)

---

## Teoria

### Cosa Serve Proteggere in Kubernetes?

Un cluster Kubernetes ha diversi "layer" di stato:

| Layer | Contenuto | Come proteggerlo |
|-------|-----------|-----------------|
| **etcd** | Tutto lo stato del cluster (risorse, secret, configmap) | `etcdctl snapshot save` |
| **Risorse YAML** | Deployment, Service, Ingress, CRD, RBAC | GitOps (infra as code) + Velero |
| **Persistent Volumes** | Dati applicativi (database, file) | CSI snapshot + Velero |
| **Secrets/ConfigMap** | Credenziali, configurazioni | Sealed Secrets / External Secrets + Velero |
| **Custom Resources** | Stato di operatori (Prometheus rules, ArgoCD apps) | Velero (include CRD) |

**Errore comune:** pensare che GitOps basti. GitOps copre i **manifest**, non i dati
nei PersistentVolume né lo stato runtime (es. un Job completato, un CRD con stato).

---

### RPO e RTO

| Concetto | Definizione | Domanda chiave |
|----------|------------|----------------|
| **RPO** (Recovery Point Objective) | Quanti dati posso permettermi di perdere | "Quanto indietro nel tempo è l'ultimo backup?" |
| **RTO** (Recovery Time Objective) | Quanto tempo posso permettermi di stare giù | "Quanto ci metto a ripristinare?" |

```
──────────────────────────────────────────► tempo
     │              │                │
  ultimo          guasto          ripristino
  backup                          completo
     │◄────RPO────►│◄────RTO──────►│
```

- RPO = 0 → replica sincrona (costoso)
- RPO = 1h → backup schedulato ogni ora
- RTO = 5 min → procedure testate, infra pronta

---

### Strategie di Backup per Kubernetes

| Strategia | Cosa protegge | Limiti |
|-----------|--------------|--------|
| **etcd snapshot** | Tutto lo stato del cluster | Ripristina TUTTO (no granularità), richiede accesso al control plane |
| **GitOps** | Manifest (Deployment, Service, etc.) | Non copre dati PV, stato runtime, CRD con stato |
| **Velero** | Risorse + PV + CRD | Tool aggiuntivo da installare e configurare |
| **CSI snapshot** | Solo volumi persistenti | Non copre risorse Kubernetes |
| **Database backup** | Dati applicativi | Specifico per applicazione (pg_dump, mysqldump) |

**Raccomandazione:** combina le strategie. GitOps per i manifest, Velero per backup
completi (risorse + PV), database-native backup per RPO stringenti.

---

### Velero: Introduzione

Velero (ex Heptio Ark) è un tool open-source CNCF per:

- **Backup** di risorse Kubernetes e persistent volume
- **Restore** con granularità (namespace, label, tipo risorsa)
- **Migrazione** tra cluster (backup dal sorgente, restore sulla destinazione)
- **Disaster recovery** con backup schedulati

#### Architettura

```
┌─────────────────────────────────────────────────────────┐
│                    Cluster Kubernetes                     │
│                                                          │
│  ┌──────────────┐    ┌─────────────────────────────────┐ │
│  │ Velero Server│    │  Backup/Restore Custom Resources │ │
│  │ (Deployment) │◄──►│  - Backup                       │ │
│  │              │    │  - Restore                      │ │
│  │  + Plugins   │    │  - Schedule                     │ │
│  └──────┬───────┘    │  - BackupStorageLocation        │ │
│         │            │  - VolumeSnapshotLocation       │ │
│         │            └─────────────────────────────────┘ │
└─────────┼────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────┐    ┌──────────────────┐
│  Object Storage  │    │   Cloud Provider │
│  (S3, GCS, Azure │    │   Snapshot API   │
│   Blob, MinIO)   │    │  (EBS, Azure     │
│                  │    │   Disk, CSI)     │
│  ← risorse YAML │    │  ← PV snapshot   │
└──────────────────┘    └──────────────────┘
```

**Componenti chiave:**

| CRD | Funzione |
|-----|----------|
| `BackupStorageLocation` (BSL) | Dove salvare i backup delle risorse (bucket S3/GCS/Azure) |
| `VolumeSnapshotLocation` (VSL) | Dove salvare gli snapshot dei volumi |
| `Backup` | Singola operazione di backup (risorse + volumi) |
| `Restore` | Singola operazione di restore |
| `Schedule` | Backup periodico con cron syntax |

#### Plugin System

Velero usa plugin per interfacciarsi con i provider cloud:

| Plugin | Provider | Funzionalità |
|--------|----------|-------------|
| `velero-plugin-for-aws` | AWS S3, EBS | Backup su S3, snapshot EBS |
| `velero-plugin-for-gcp` | GCS, GCE PD | Backup su GCS, snapshot GCE |
| `velero-plugin-for-microsoft-azure` | Azure Blob, Azure Disk | Backup su Blob, snapshot Disk |
| `velero-plugin-for-csi` | Qualsiasi driver CSI | Snapshot via VolumeSnapshot API |

---

### Installazione

```bash
# Installa CLI
brew install velero  # macOS
# oppure: wget dal GitHub release

# Installa su cluster con Helm (esempio MinIO / S3-compatibile)
helm repo add vmware-tanzu https://vmware-tanzu.github.io/helm-charts
helm repo update

helm install velero vmware-tanzu/velero \
  --namespace velero \
  --create-namespace \
  --set configuration.backupStorageLocation[0].name=default \
  --set configuration.backupStorageLocation[0].provider=aws \
  --set configuration.backupStorageLocation[0].bucket=velero-backups \
  --set configuration.backupStorageLocation[0].config.region=eu-west-1 \
  --set configuration.backupStorageLocation[0].config.s3ForcePathStyle=true \
  --set configuration.backupStorageLocation[0].config.s3Url=http://minio.storage:9000 \
  --set configuration.volumeSnapshotLocation[0].name=default \
  --set configuration.volumeSnapshotLocation[0].provider=aws \
  --set configuration.volumeSnapshotLocation[0].config.region=eu-west-1 \
  --set credentials.secretContents.cloud="[default]\naws_access_key_id=minioadmin\naws_secret_access_key=minioadmin\n" \
  --set initContainers[0].name=velero-plugin-for-aws \
  --set initContainers[0].image=velero/velero-plugin-for-aws:v1.10.0 \
  --set initContainers[0].volumeMounts[0].mountPath=/target \
  --set initContainers[0].volumeMounts[0].name=plugins

# Verifica
velero backup-location get
kubectl get pods -n velero
```

---

### Backup Operations

#### Backup On-Demand

```bash
# Backup di tutto il cluster
velero backup create full-backup

# Backup di un namespace specifico
velero backup create prod-backup --include-namespaces production

# Backup con selettore label
velero backup create api-backup \
  --selector app=api \
  --include-namespaces production,staging

# Backup escludendo risorse
velero backup create no-secrets \
  --exclude-resources secrets

# Backup con TTL (scade dopo 30 giorni)
velero backup create monthly-backup \
  --include-namespaces production \
  --ttl 720h

# Verifica stato
velero backup describe prod-backup
velero backup logs prod-backup
```

#### Backup Schedulati

```bash
# Ogni giorno alle 2:00 AM
velero schedule create daily-prod \
  --schedule="0 2 * * *" \
  --include-namespaces production \
  --ttl 168h  # 7 giorni di retention

# Ogni ora
velero schedule create hourly-critical \
  --schedule="0 * * * *" \
  --selector tier=critical \
  --ttl 48h

# Lista schedule
velero schedule get
```

#### Backup dei Volumi

Velero supporta tre modalità per i PersistentVolume:

| Modalità | Come funziona | Pro | Contro |
|---------|--------------|-----|--------|
| **CSI Snapshot** | Usa la VolumeSnapshot API del driver CSI | Veloce, nativo | Richiede driver CSI con supporto snapshot |
| **Kopia** (default v1.12+) | File-level backup via data mover | Funziona ovunque | Più lento, usa più spazio |
| **Restic** (legacy) | File-level backup | Supportato a lungo | Sostituito da Kopia |

```bash
# Forza file-level backup per un Pod (annotazione)
kubectl annotate pod mydb \
  backup.velero.io/backup-volumes=data

# CSI Snapshot (automatico se driver supporta)
# Velero lo usa se trova una VolumeSnapshotClass per il driver
```

---

### Restore Operations

```bash
# Restore completo da un backup
velero restore create --from-backup prod-backup

# Restore in un namespace diverso (migrazione)
velero restore create --from-backup prod-backup \
  --namespace-mappings production:staging

# Restore solo alcune risorse
velero restore create --from-backup prod-backup \
  --include-resources deployments,services,configmaps

# Restore con selettore label
velero restore create --from-backup prod-backup \
  --selector app=api

# Verifica stato del restore
velero restore describe <restore-name>
velero restore logs <restore-name>
```

**Ordine di restore:** Velero rispetta le dipendenze — prima namespace e CRD,
poi PV/PVC, poi Deployment/StatefulSet, poi Service, poi Ingress.

#### Cross-Cluster Migration

```
Cluster A (sorgente)               Cluster B (destinazione)
  │                                     │
  │  velero backup create migration     │
  │  ──► Object Storage (S3) ◄──        │
  │                                     │  velero restore create
  │                                     │    --from-backup migration
```

**Prerequisiti per la migrazione:**
- Entrambi i cluster devono avere Velero installato
- Entrambi devono puntare allo **stesso** BackupStorageLocation
- Le StorageClass devono esistere (o mappare) nel cluster di destinazione
- I CRD devono essere presenti nel cluster di destinazione

---

### Best Practice per Production

#### La Regola 3-2-1

- **3** copie dei dati (originale + 2 backup)
- **2** media diversi (es. disco locale + object storage)
- **1** copia off-site (regione/cloud diverso)

```bash
# Esempio: due BSL in regioni diverse
velero backup-location create primary \
  --provider aws --bucket velero-eu --config region=eu-west-1

velero backup-location create secondary \
  --provider aws --bucket velero-us --config region=us-east-1

# Backup su entrambi
velero backup create dr-backup \
  --storage-location primary
velero backup create dr-backup-replica \
  --storage-location secondary
```

#### Test dei Restore

```bash
# Crea un namespace di test e ripristina lì
velero restore create test-restore \
  --from-backup daily-prod-20260419020000 \
  --namespace-mappings production:restore-test

# Verifica che tutto funzioni
kubectl get all -n restore-test
kubectl exec -n restore-test myapp-xxx -- curl localhost:8080/health

# Pulisci
kubectl delete namespace restore-test
```

> **Regola d'oro:** un backup che non hai mai testato con un restore **non è un backup**.
> Schedula test di restore automatici almeno una volta al mese.

#### Monitoring di Velero

Velero espone metriche Prometheus su `:8085/metrics`:

```yaml
# ServiceMonitor per Velero
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: velero
  namespace: monitoring
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: velero
  namespaceSelector:
    matchNames:
    - velero
  endpoints:
  - port: http-monitoring
    interval: 30s
```

**Alert consigliati:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: velero-alerts
  namespace: monitoring
  labels:
    release: monitoring
spec:
  groups:
  - name: velero.rules
    rules:
    # Alert: backup fallito
    - alert: VeleroBackupFailed
      expr: increase(velero_backup_failure_total[1h]) > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Velero backup fallito nell'ultima ora"

    # Alert: nessun backup riuscito nelle ultime 25 ore
    - alert: VeleroNoRecentBackup
      expr: time() - velero_backup_last_successful_timestamp > 90000
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "Nessun backup Velero riuscito nelle ultime 25 ore"

    # Alert: restore fallito
    - alert: VeleroRestoreFailed
      expr: increase(velero_restore_failure_total[1h]) > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Velero restore fallito"
```

---

## Hands-on

### Esercizio 1 — Installare Velero con MinIO

```bash
# 1. Deploy MinIO come object storage locale
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: minio
  namespace: velero
spec:
  selector:
    matchLabels:
      app: minio
  template:
    metadata:
      labels:
        app: minio
    spec:
      containers:
      - name: minio
        image: minio/minio:latest
        command: ["minio", "server", "/data"]
        env:
        - name: MINIO_ROOT_USER
          value: "minioadmin"
        - name: MINIO_ROOT_PASSWORD
          value: "minioadmin"
        ports:
        - containerPort: 9000
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: minio
  namespace: velero
spec:
  selector:
    app: minio
  ports:
  - port: 9000
EOF

# 2. Crea il bucket
kubectl exec -n velero deploy/minio -- \
  mc alias set local http://localhost:9000 minioadmin minioadmin
kubectl exec -n velero deploy/minio -- \
  mc mb local/velero-backups

# 3. Installa Velero con il plugin AWS
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.10.0 \
  --bucket velero-backups \
  --secret-file ./credentials-velero \
  --backup-location-config region=minio,s3ForcePathStyle="true",s3Url=http://minio.velero:9000 \
  --use-volume-snapshots=false
```

### Esercizio 2 — Backup e Restore di un Namespace

```bash
# Deploy di un'app di esempio
kubectl create namespace demo
kubectl apply -n demo -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.27
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  setting: "production"
EOF

# Backup
velero backup create demo-backup --include-namespaces demo

# Verifica
velero backup describe demo-backup

# Simula disaster
kubectl delete namespace demo

# Restore
velero restore create --from-backup demo-backup

# Verifica
kubectl get all -n demo
kubectl get configmap -n demo
```

### Esercizio 3 — Schedule e Monitoring

```bash
# Crea uno schedule
velero schedule create demo-hourly \
  --schedule="0 * * * *" \
  --include-namespaces demo \
  --ttl 24h

# Verifica
velero schedule get

# Controlla le metriche
kubectl port-forward -n velero deploy/velero 8085:8085 &
curl -s localhost:8085/metrics | grep velero_backup
```

---

## Risorse

- [Velero Documentation](https://velero.io/docs/)
- [Velero GitHub](https://github.com/vmware-tanzu/velero)
- [CSI Snapshot Support in Velero](https://velero.io/docs/main/csi/)
- [Velero Helm Chart](https://github.com/vmware-tanzu/helm-charts/tree/main/charts/velero)
- [Kubernetes Backup Best Practices — Kasten](https://www.kasten.io/kubernetes/backup)
- [etcd Disaster Recovery — kubernetes.io](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/#backing-up-an-etcd-cluster)
