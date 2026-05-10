
> **Playground per questo incontro:** usa il playground Kubernetes multi-nodo su iximiuz Labs:
> **https://labs.iximiuz.com/playgrounds/kubernetes**


## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Creare un Helm chart da manifest esistenti con valori parametrizzati
- Capire il ciclo di vita Helm: install, upgrade, rollback, uninstall
- Implementare una GitOps pipeline con ArgoCD e Gitea
- Configurare un HPA e osservare scale-up e scale-down sotto carico
- Presentare un'applicazione production-ready con checklist completa


## Teoria (50 min)

### Helm — Il Package Manager di Kubernetes

Helm risolve tre problemi:
1. **Packaging**: raggruppa manifest correlati in un "chart" distribuibile
2. **Templatizzazione**: parametrizza i manifest con valori configurabili
3. **Lifecycle management**: traccia release, gestisce upgrade e rollback

#### Struttura di un Helm Chart

```
mychart/
├── Chart.yaml          # Metadati: name, version, appVersion, description
├── values.yaml         # Valori default (override con --set o -f values-prod.yaml)
├── templates/
│   ├── _helpers.tpl    # Funzioni riusabili (template helpers) — NON genera risorse
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── serviceaccount.yaml
│   ├── hpa.yaml
│   └── NOTES.txt       # Testo mostrato dopo helm install
└── charts/             # Dipendenze (sub-charts dichiarate in Chart.yaml)
```

**Chart.yaml:**

```yaml
apiVersion: v2          # Helm 3 (v1 = Helm 2)
name: myapp
description: A Helm chart for myapp API server
type: application       # o "library" per chart di utilità
version: 0.3.0          # Versione del chart (SemVer)
appVersion: "1.5.2"     # Versione dell'applicazione (informativo)
dependencies:
- name: postgresql
  version: "15.x.x"
  repository: https://charts.bitnami.com/bitnami
  condition: postgresql.enabled   # Disabilita con --set postgresql.enabled=false
```

**values.yaml — valori di default:**

```yaml
replicaCount: 2

image:
  repository: registry.example.com/myapp
  pullPolicy: IfNotPresent
  tag: ~                # null in YAML → il filtro `default` usa .Chart.AppVersion come fallback.
                        # ATTENZIONE: una stringa vuota "" è un valore valido in Helm — `default`
                        # NON scatta per stringhe vuote, solo per nil/non-set. Usa null (~) o ometti
                        # il campo per il comportamento corretto.
                        # Override in CI: --set image.tag=sha-abc123

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  className: nginx
  hosts:
  - host: myapp.example.com
    paths:
    - path: /
      pathType: Prefix
  tls: []

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  # Usa "targetCPUAverageUtilization" (allineato con autoscaling/v2 averageUtilization)
  # NON "targetCPUUtilizationPercentage" che è la naming convention di HPA v1 (autoscaling/v1)
  targetCPUAverageUtilization: 60

serviceAccount:
  create: true
  name: ""

postgresql:
  enabled: true         # Abilita il sub-chart PostgreSQL
  auth:
    database: myapp
    username: myapp
    # IMPORTANTE: non committare la password in values.yaml!
    # In produzione, usa: --set postgresql.auth.password=<secret>
    # oppure External Secrets Operator per sincronizzare la password da Vault/AWS SSM
```

**templates/_helpers.tpl — template riusabili:**

```yaml
{{/*
Expand the name of the chart.
*/}}
{{- define "myapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Full name: release + chart (troncato a 63 char per compatibilità K8s)
*/}}
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Standard labels su tutte le risorse
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
```

**templates/deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ include "myapp.name" . }}
      app.kubernetes.io/instance: {{ .Release.Name }}
  template:
    metadata:
      labels:
        {{- include "myapp.labels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "myapp.serviceAccountName" . }}
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 8080
          protocol: TCP
        livenessProbe:
          httpGet:
            path: /health
            port: http
        readinessProbe:
          httpGet:
            path: /ready
            port: http
        resources:
          {{- toYaml .Values.resources | nindent 12 }}
```

#### Ciclo di Vita Helm

```bash
# Installa una release
helm install myapp ./mychart \
  --namespace production \
  --create-namespace \
  --values values-prod.yaml \
  --set image.tag=v1.5.2

# Verifica il rendering PRIMA di installare
helm template myapp ./mychart --values values-prod.yaml | less
helm template myapp ./mychart --values values-prod.yaml | kubectl apply --dry-run=client -f -

# Upgrade (aggiorna configurazione o versione)
helm upgrade myapp ./mychart \
  --namespace production \
  --values values-prod.yaml \
  --set image.tag=v1.6.0
  # --atomic  → rollback automatico se upgrade fallisce

# Storia delle release
helm history myapp -n production

# Rollback alla revision precedente
helm rollback myapp 2 -n production

# Vedi i valori di una release installata
helm get values myapp -n production

# Uninstall
helm uninstall myapp -n production
```

**Helm Repositories:**

```bash
# Aggiungi repository
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Cerca chart
helm search repo postgres
helm search hub redis   # cerca su ArtifactHub

# Ispeziona un chart
helm show values bitnami/postgresql | head -50
helm show chart bitnami/postgresql
```

#### Helm Hooks e Testing

I **Helm hooks** permettono di eseguire azioni in momenti specifici del ciclo di vita di una release:

| Hook | Quando esegue | Caso d'uso |
|------|--------------|------------|
| `pre-install` | Prima della prima installazione | Creare schema DB, prerequisiti |
| `post-install` | Dopo l'installazione | Seed dati, notifiche |
| `pre-upgrade` | Prima di un upgrade | Migrazione DB, backup |
| `post-upgrade` | Dopo un upgrade | Smoke test, cache invalidation |
| `pre-delete` | Prima dell'uninstall | Backup finale |

```yaml
# templates/db-migration.yaml — Hook per migrazione DB prima dell'upgrade
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "myapp.fullname" . }}-migrate
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"          # Ordine (più basso = prima)
    "helm.sh/hook-delete-policy": hook-succeeded  # Elimina il Job se ha successo
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        command: ["./migrate", "--up"]
```

**`helm test`** — esegue i Pod di test definiti nel chart:

```bash
# Esegui i test della release
helm test myapp -n production

# I test sono Pod con l'annotation "helm.sh/hook": test
# Devono completare con exit code 0 per passare
```


### GitOps — Pull Model vs Push Model

**Push model (CI/CD tradizionale):**
```
Developer → git push → CI pipeline → kubectl apply → cluster
                           │
                           └── ha credenziali cluster! (rischio sicurezza)
```

**Pull model (GitOps):**
```
Developer → git push → Git repo (source of truth)
                           │
                           ◄── ArgoCD poll ogni 3 min
                                    │
                               rileva differenza
                                    │
                              applica al cluster
```

**Vantaggi del pull model:**
- Il cluster **non espone** credenziali al CI/CD
- Ogni cambiamento del cluster è tracciato in Git (audit trail)
- Rollback = `git revert` (o modificare il tag nel values file)
- Drift detection: ArgoCD segnala modifiche manuali
- Multi-cluster: un ArgoCD può gestire N cluster


### ArgoCD — GitOps Operator

ArgoCD è un operatore Kubernetes che monitora un Git repository e mantiene il cluster sincronizzato.

```yaml
# ArgoCD Application — definisce COSA sincronizzare e DOVE
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: http://gitea.local/team/myapp
    targetRevision: main         # branch, tag, o commit SHA
    path: helm/myapp             # directory nel repo con il chart
    helm:
      valueFiles:
      - values-prod.yaml
      parameters:
      - name: image.tag
        value: "v1.5.2"
  destination:
    server: https://kubernetes.default.svc   # cluster locale
    namespace: production
  syncPolicy:
    automated:
      selfHeal: true       # Ripristina modifiche manuali entro ~3 minuti
      prune: true          # Elimina risorse non più nel repo
    syncOptions:
    - CreateNamespace=true
    - PrunePropagationPolicy=foreground
```

```bash
# CLI ArgoCD
argocd login argocd.local --insecure

# Lista applicazioni
argocd app list

# Vedi lo stato di un'app
argocd app get myapp
# → Sync Status: Synced | OutOfSync
# → Health Status: Healthy | Degraded | Progressing

# Sync manuale (forzato)
argocd app sync myapp

# Rollback all'history precedente
argocd app history myapp
argocd app rollback myapp 3

# Diff tra cluster e Git
argocd app diff myapp
```


### HPA — Horizontal Pod Autoscaler

HPA scala automaticamente il numero di repliche basandosi su metriche.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 20
  metrics:
  # Scala su CPU
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60   # Scala quando CPU media > 60%
  # Scala su memoria
  - type: Resource
    resource:
      name: memory
      target:
        type: AverageValue
        averageValue: 200Mi
  # Scala su metrica custom (richiede custom metrics adapter)
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"     # 100 req/sec per Pod
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30    # Aspetta 30s prima di scalare su
      policies:
      - type: Percent
        value: 100                       # Può raddoppiare in una volta
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300   # Aspetta 5 minuti prima di scalare giù
      policies:
      - type: Pods
        value: 1                         # Rimuove al max 1 Pod alla volta
        periodSeconds: 60
```

**REQUISITO CRITICO:** i container **devono** avere `resources.requests` configurato,
altrimenti HPA non può calcolare la percentuale di utilizzo.

```bash
# Vedi lo stato dell'HPA
kubectl get hpa -n production
# → myapp-hpa   Deployment/myapp   35%/60%   2   20   2   5m

# Stream continuo
kubectl get hpa -w

# Dettagli e condizioni
kubectl describe hpa myapp-hpa

# Vedi le metriche correnti
kubectl get hpa myapp-hpa -o yaml | grep -A 20 currentMetrics
```


### Canary e Blue-Green Deployments

Il rolling update standard di Kubernetes aggiorna tutti i Pod progressivamente. Per deployment più controllati:

#### Blue-Green Deployment

Due versioni complete dell'applicazione coesistono. Il traffico viene spostato tutto in una volta:

```
                    ┌─ Blue (v1) ← traffico attuale
Service selector ──►│
                    └─ Green (v2) ← in attesa, testato

Switch: cambia il selector del Service da "version: v1" a "version: v2"
```

#### Canary Deployment con Argo Rollouts

**Argo Rollouts** sostituisce il Deployment standard con step progressivi:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp
spec:
  replicas: 10
  strategy:
    canary:
      steps:
      - setWeight: 10       # 10% del traffico al canary
      - pause: {duration: 5m}
      - setWeight: 30       # 30%
      - pause: {duration: 5m}
      - setWeight: 60       # 60%
      - pause: {duration: 10m}
      # Se tutto ok, promuovi al 100%
      analysis:
        templates:
        - templateName: success-rate
          args:
          - name: service-name
            value: myapp
```

> **Quando usare:** rolling update standard va bene per la maggior parte dei casi. Usa canary deployment quando un errore in produzione ha un impatto molto alto (pagamenti, dati utente) e vuoi validare gradualmente.
>
> **Risorse:** [Argo Rollouts Documentation](https://argo-rollouts.readthedocs.io/)


### cert-manager: TLS Automatico con Let's Encrypt

**cert-manager** automatizza l'emissione e il rinnovo dei certificati TLS nel cluster:

```bash
# Installa cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

```yaml
# ClusterIssuer per Let's Encrypt (produzione)
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
    - http01:
        ingress:
          class: nginx
```

```yaml
# Ingress con TLS automatico — basta aggiungere l'annotation!
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"  # ← questa annotation basta
spec:
  tls:
  - hosts:
    - myapp.example.com
    secretName: myapp-tls       # cert-manager crea e rinnova questo Secret
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp
            port:
              number: 80
```

> **Risorse:** [cert-manager Documentation](https://cert-manager.io/docs/)


## Hands-on Guidato (90 min — su Proxmox con ArgoCD + Gitea)

### Esercizio 1 — Da Manifest a Helm Chart

```bash
# 1. Scaffold della struttura base
helm create myapp
# → crea struttura completa con template di default

# 2. Rimuovi template di default (li sostituiamo con i nostri)
rm -rf myapp/templates/tests/
# Mantieni _helpers.tpl, modifica deployment.yaml, service.yaml, ingress.yaml

# 3. Crea values.yaml con le variabili dell'app
cat > myapp/values.yaml <<'EOF'
replicaCount: 2
image:
  repository: nginx
  tag: "alpine"
  pullPolicy: IfNotPresent
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: true
  className: "nginx"
  host: myapp.local
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 128Mi
EOF

# 4. Testa il rendering
helm template myapp ./myapp | grep -E "kind:|name:|image:"

# 5. Dry-run completo
helm template myapp ./myapp | kubectl apply --dry-run=client -f -

# 6. Installa
helm install myapp ./myapp \
  --namespace demo \
  --create-namespace

# 7. Verifica
kubectl get pods -n demo
kubectl get service -n demo
helm list -n demo

# 8. Upgrade con nuovi valori
helm upgrade myapp ./myapp \
  --namespace demo \
  --set image.tag=1.25 \
  --set replicaCount=3

helm history myapp -n demo
```

### Esercizio 2 — GitOps Pipeline con ArgoCD

```bash
# Push del chart su Gitea
cd myapp-chart
git init && git add . && git commit -m "initial chart v0.1.0"
git remote add origin http://gitea.local/team/myapp
git push -u origin main

# Crea Application su ArgoCD
kubectl apply -f - <<'EOF'
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
    path: .
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
    syncOptions:
    - CreateNamespace=true
EOF

# Osserva il sync iniziale
argocd app list
argocd app get myapp
argocd app sync myapp

# Simula un drift: elimina un Pod manualmente
kubectl delete pod $(kubectl get pods -n production -l app.kubernetes.io/name=myapp -o name | head -1) -n production
# → ArgoCD lo ricrea entro 3 minuti (self-heal)

# Simula un update: modifica image.tag nel repo
# git commit + push → ArgoCD rileva la differenza e sincronizza

# Nel values.yaml del repo, modifica:
# image:
#   tag: "1.25"
# poi git commit && git push
# ArgoCD fa helm upgrade automaticamente
```

### Esercizio 3 — HPA con Generatore di Carico

```bash
# Prerequisito: metrics-server installato
# NOTA: "latest" non è riproducibile. In produzione, specifica una versione esplicita:
# https://github.com/kubernetes-sigs/metrics-server/releases/tag/v0.7.2
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Aspetta che sia pronto
kubectl wait pod -n kube-system -l k8s-app=metrics-server \
  --for=condition=ready --timeout=120s

# Deploy con requests configurate (obbligatorio per HPA)
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: stress-target
spec:
  replicas: 1
  selector:
    matchLabels:
      app: stress-target
  template:
    metadata:
      labels:
        app: stress-target
    spec:
      containers:
      - name: php
        image: php:8-apache
        resources:
          requests:
            cpu: 200m
            memory: 64Mi
          limits:
            cpu: 500m
            memory: 128Mi
apiVersion: v1
kind: Service
metadata:
  name: stress-target
spec:
  selector:
    app: stress-target
  ports:
  - port: 80
EOF

# Applica HPA (nota: kubectl autoscale crea un HPA autoscaling/v1 — per autoscaling/v2
# con metriche avanzate usa un manifest YAML come mostrato nella sezione teoria)
kubectl autoscale deployment stress-target \
  --cpu-percent=50 \
  --min=1 \
  --max=10

# Osserva lo stato iniziale
kubectl get hpa -w &

# Genera carico (in background)
kubectl run load-gen --image=busybox --restart=Never -- \
  sh -c "while true; do wget -q -O- http://stress-target; done"

# Osserva lo scale-up (30-60s)
kubectl get hpa stress-target -w
kubectl get pods -l app=stress-target -w

# Ferma il carico
kubectl delete pod load-gen

# Osserva lo scale-down (5 minuti di default)
kubectl get hpa stress-target -w
```


## Capstone Finale (30 min + 20 min review)

> **"Il Servizio Pronto per la Produzione"**
>
> Ogni partecipante presenta la propria applicazione production-ready.
> **Checklist di produzione:**
>
> - [ ] **Helm chart** con `values.yaml` parametrizzato (`image.tag`, `replicaCount`, `resources`)
> - [ ] **ArgoCD Application** con `selfHeal: true` e `prune: true`
> - [ ] **RBAC**: ServiceAccount dedicato con Role a minimo privilegio
> - [ ] **NetworkPolicy**: solo il traffico necessario è permesso
> - [ ] **PVC**: i dati persistono tra i restart (se l'app ha stato)
> - [ ] **Prometheus**: ServiceMonitor + almeno un'alert rule custom
> - [ ] **HPA**: autoscaling su CPU o metrica custom
> - [ ] **No root**: `runAsNonRoot: true`, capabilities dropped
> - [ ] **No hardcoded secrets**: Kubernetes Secret, non variabili in chiaro nel chart
> - [ ] **Readiness e Liveness probe** configurate correttamente
> - [ ] **Resource requests e limits** su tutti i container
> - [ ] **Rolling update** con `maxUnavailable: 0` (zero downtime)
>
> **Review collettivo (20 min):**
> Ogni partecipante presenta le proprie scelte architetturali (5 min max) e risponde alle domande del team.
> Discussione su trade-off e miglioramenti possibili.


## Dove Andare da Qui

Congratulazioni — hai completato il percorso! I prossimi passi naturali:

| Area | Risorse |
|------|---------|
| **CKA** | La certificazione CNCF per Kubernetes Administrator — [cncf.io/certifications](https://www.cncf.io/certifications/cka/) |
| **GitOps avanzato** | Flux CD, ApplicationSets, multi-cluster ArgoCD |
| **Service Mesh** | Istio o Linkerd per mTLS, traffic shaping, observability L7 |
| **Cluster API** | Provisioning dichiarativo di cluster Kubernetes |
| **eBPF e Cilium** | Networking e security next-generation (senza iptables) |
| **vCluster** | Multi-tenancy con cluster virtuali leggeri |
| **OpenTelemetry** | Tracing distribuito con standard CNCF |


## Self-Study Assignment

**Challenge consigliate su iximiuz Labs:**
- Cerca "Helm" nella sezione Challenges per esercizi pratici sui chart
- Cerca "ArgoCD" per GitOps exercises
- Cerca "HPA" per autoscaling challenges

**Letture consigliate:**
- [Helm Documentation](https://helm.sh/docs/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [HPA — kubernetes.io](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [ArgoCD Best Practices](https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/)
- [Helm Chart Best Practices](https://helm.sh/docs/chart_best_practices/)


## Risorse Aggiuntive

### Helm
- [Helm Documentation](https://helm.sh/docs/) — guida completa: chart structure, templates, hooks, dependencies, lifecycle, plugins
- [Helm Chart Best Practices](https://helm.sh/docs/chart_best_practices/) — naming conventions, labels, pod templates, RBAC, values schema validation
- [Helm Template Tips and Tricks](https://helm.sh/docs/howto/charts_tips_and_tricks/) — range, named templates, lookup, required, fail, toYaml, include vs template
- [ArtifactHub](https://artifacthub.io/) — repository pubblico di Helm chart, Operators, OPA policies, Falco rules e altro
- [helm-unittest](https://github.com/helm-unittest/helm-unittest) — unit testing per Helm chart senza bisogno di un cluster K8s: YAML assertions
- [chart-testing (ct)](https://github.com/helm/chart-testing) — linting e testing di chart in CI/CD pipeline: installazione e upgrade su cluster reale
- [Helm Plugin: helm-diff](https://github.com/databus23/helm-diff) — mostra il diff tra il release attuale e un upgrade prima di applicarlo

### ArgoCD
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/en/stable/) — guida completa: installazione HA, Application, sync policy, RBAC, SSO, notifications
- [ArgoCD ApplicationSet](https://argo-cd.readthedocs.io/en/stable/user-guide/application-set/) — genera Application da Git directory, Cluster list, Matrix/SCM generators
- [ArgoCD Notifications](https://argo-cd.readthedocs.io/en/stable/user-guide/subscriptions/) — notifiche per eventi di sync su Slack, Teams, PagerDuty, GitHub commit status
- [ArgoCD Best Practices](https://argo-cd.readthedocs.io/en/stable/user-guide/best_practices/) — struttura repo (monorepo vs polyrepo), environment-specific config, app-of-apps pattern

### Flux CD
- [Flux Documentation](https://fluxcd.io/flux/) — GitOps toolkit: Source Controller, Kustomization, HelmRelease, Notification Controller
- [Flux Getting Started](https://fluxcd.io/flux/get-started/) — bootstrap Flux su cluster con GitHub Actions in 10 minuti
- [Flux HelmRelease](https://fluxcd.io/flux/components/helm/helmreleases/) — deploy di Helm chart tramite GitOps con drift detection e rollback automatico

### Standard e Principi GitOps
- [OpenGitOps Principles](https://opengitops.dev/) — i 4 principi del GitOps: declarative, versioned, pulled, reconciled (standard CNCF)
- [Weaveworks — GitOps Blog](https://www.weave.works/blog/category/gitops/) — articoli fondativi: storia del GitOps, pattern, best practice (Weaveworks ha coniato il termine nel 2017)
- [CNCF GitOps Working Group](https://github.com/cncf/tag-app-delivery/tree/main/gitops-wg) — definizione formale e best practice dalla community CNCF

### Autoscaling
- [HPA — kubernetes.io](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) — guida completa HPA v2: algoritmo di scaling, CPU/memory, custom metrics, external metrics, behavior
- [KEDA — Kubernetes Event-Driven Autoscaling](https://keda.sh/) — scalers per Kafka, RabbitMQ, SQS, Redis, Prometheus, NATS, HTTP, cron e 50+ sorgenti
- [VPA — Vertical Pod Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler) — Auto, Recreate, Initial, Off modes: raccomanda o applica automaticamente requests/limits
- [Cluster Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler) — scaling automatico dei nodi: provider AWS/GCP/Azure, configurazione expander, scale-down delay
- [KEDA Scalers Catalog](https://keda.sh/docs/latest/scalers/) — lista completa di tutti gli scalers supportati con esempi di configurazione

### Blog e Tutorial
- [Learnk8s — Scaling Kubernetes Applications](https://learnk8s.io/kubernetes-autoscaling-strategies) — HPA, VPA, KEDA, Cluster Autoscaler: quando usare ognuno e come combinarli
- [Martin Heinz — Kubernetes GitOps with ArgoCD](https://martinheinz.dev/blog/31) — tutorial completo ArgoCD: setup, application, sync, rollback
- [Codefresh — Helm Best Practices](https://codefresh.io/docs/docs/new-helm/helm-best-practices/) — pattern avanzati: umbrella chart, chart versioning, multi-environment values
