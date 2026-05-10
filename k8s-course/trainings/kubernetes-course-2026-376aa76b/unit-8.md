---
kind: unit

title: "Incontro 8 — GitOps, Helm e Architetture Cloud Provider"

name: unit-8

createdAt: 2026-02-23
updatedAt: 2026-02-23

challenges:
  u8_helm_chart_author_f9fe7e27: {}
  u8_gitops_drift_9dcd39df: {}
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Creare un Helm chart da manifest esistenti con valori parametrizzati
- Implementare una GitOps pipeline con ArgoCD e Gitea
- Configurare un HPA e osservare scale-up e scale-down sotto carico
- Presentare un'applicazione production-ready che integra tutti i concetti del corso

---

## Teoria (50 min)

### Helm — Il Package Manager di Kubernetes

Un **Helm chart** è un insieme di template YAML con valori parametrizzati.

```
mychart/
├── Chart.yaml          # Metadata del chart (name, version, appVersion)
├── values.yaml         # Valori default parametrizzabili
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── _helpers.tpl    # Funzioni riusabili (template helpers)
└── charts/             # Dipendenze (sub-charts)
```

```bash
# Lifecycle Helm
helm install myapp ./mychart --set image.tag=v1.2.3
helm upgrade myapp ./mychart --set image.tag=v1.3.0
helm rollback myapp 1       # Torna alla revision 1
helm uninstall myapp
helm history myapp          # Storia delle release
```

### GitOps — Pull Model vs Push Model

**Push model (CI/CD tradizionale):**
```
Git push → CI pipeline → kubectl apply → cluster
```
Il pipeline ha accesso diretto al cluster (credenziali esposte nel CI).

**Pull model (GitOps con ArgoCD):**
```
Git push → ArgoCD poll → rileva differenza → applica al cluster
```
Il cluster *pulisce* le proprie credenziali Git. Il Git repo è source of truth.

### ArgoCD

ArgoCD monitora un repo Git e mantiene il cluster sincronizzato.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: http://gitea.local/team/myapp
    targetRevision: main
    path: helm/myapp
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      selfHeal: true      # Ripristina le modifiche manuali
      prune: true         # Rimuove risorse non più nel repo
```

**Self-heal:** se qualcuno fa `kubectl delete pod` o modifica una risorsa manualmente,
ArgoCD la ripristina entro il ciclo di polling (default: 3 minuti).

### HPA — Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
```

---

## Hands-on Guidato (90 min — su Proxmox con ArgoCD + Gitea)

### Esercizio 1 — Da Manifest a Helm Chart

Dato un set di manifest (Deployment, Service, Ingress, ConfigMap), creare un Helm chart:

```bash
# Scaffolda la struttura
helm create myapp
# Rimuovi i template di default e sostituisci con i tuoi manifest

# Parametrizza in values.yaml
image:
  repository: myregistry/myapp
  tag: latest
replicaCount: 2
resources:
  requests:
    cpu: 100m
    memory: 128Mi

# Testa il rendering
helm template myapp ./myapp --values values-prod.yaml | kubectl apply --dry-run=client -f -

# Deploy
helm install myapp ./myapp --namespace production --create-namespace
```

### Esercizio 2 — GitOps Pipeline con ArgoCD

```bash
# Push del chart su Gitea
cd myapp-chart
git init && git add . && git commit -m "initial chart"
git remote add origin http://gitea.local/team/myapp
git push -u origin main

# Crea Application su ArgoCD
kubectl apply -f argocd-application.yaml

# Osserva il sync
argocd app list
argocd app sync myapp

# Simula un drift: elimina un Pod manualmente
kubectl delete pod myapp-xxx-yyy -n production
# → ArgoCD lo ricrea entro 3 minuti (self-heal)

# Simula un update: cambia image.tag nel repo
# git commit + push → ArgoCD detecta e sincronizza
```

### Esercizio 3 — HPA con Generatore di Carico

```bash
# Applica HPA (resources.requests obbligatori per metrics)
kubectl apply -f hpa.yaml
kubectl get hpa -w

# Genera carico
kubectl run load-generator --image=busybox --restart=Never -- \
  sh -c "while true; do wget -q -O- http://myapp; done"

# Osserva lo scale-up
kubectl get hpa -w
kubectl get pods -l app=myapp -w

# Ferma il load-generator e osserva lo scale-down (5 minuti default)
kubectl delete pod load-generator
```

---

## Capstone Finale (30 min + 20 min review)

> **"Il Servizio Pronto per la Produzione"**
>
> Ogni partecipante presenta la propria applicazione production-ready.
> La checklist di produzione:
>
> - [ ] **Helm chart** con values.yaml parametrizzato (image.tag, replicaCount, resources)
> - [ ] **ArgoCD Application** con self-heal e prune abilitati
> - [ ] **RBAC**: ServiceAccount dedicato con Role a minimo privilegio
> - [ ] **NetworkPolicy**: solo il traffico necessario è permesso
> - [ ] **PVC**: i dati persistono tra i restart (se l'app ha stato)
> - [ ] **Prometheus**: ServiceMonitor + almeno un'alert rule custom
> - [ ] **HPA**: autoscaling su CPU o metrica custom
> - [ ] **No root**: `runAsNonRoot: true`, capabilities dropped
> - [ ] **No hardcoded secrets**: Secret Kubernetes, non variabili in chiaro nel chart
>
> **Review collettivo (20 min):** ogni partecipante presenta le proprie scelte architetturali
> e risponde alle domande del team. Discussione su trade-off e miglioramenti.

---

## Dove Andare da Qui

Congratulazioni — hai completato il percorso! I prossimi passi naturali:

- **CKA (Certified Kubernetes Administrator)**: la certificazione CNCF che valida le competenze operative
- **GitOps avanzato**: Flux CD, ApplicationSets, multi-cluster ArgoCD
- **Service Mesh**: Istio o Linkerd per mTLS, traffic shaping, observability L7
- **Cluster API**: provisioning dichiarativo di cluster Kubernetes
- **eBPF e Cilium**: networking e security next-generation
- **vCluster**: multi-tenancy con cluster virtuali leggeri
