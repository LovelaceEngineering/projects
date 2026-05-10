---
kind: unit
title: "Incontro 9 — Kustomize: Overlay Templateless"
name: kustomize
---

> **Playground per questo incontro:** usa il playground Kubernetes multi-nodo su iximiuz Labs:
> **https://labs.iximiuz.com/playgrounds/k8s-omni**

---

## Obiettivi dell'incontro

- Spiegare il modello **base + overlay** di Kustomize
- Trasformare un set di manifest in una struttura Kustomize multi-ambiente
- Usare patch strategici, JSON patch e `replacements` per personalizzare le overlay
- Generare ConfigMap/Secret con rollout automatico sul change
- Confrontare Helm e Kustomize e combinarli quando ha senso

---

## Teoria (50 min)

### Perché Kustomize

Helm risolve la **parametrizzazione con template** (Go templates + `values.yaml`). Kustomize risolve lo stesso problema con un approccio opposto: **nessun template**, YAML puro, e personalizzazione tramite **overlay** che compongono o modificano risorse esistenti.

| | Helm | Kustomize |
|---|------|-----------|
| Modello | Template engine (Go templates) | Overlay dichiarative su YAML nativo |
| File di configurazione | `values.yaml` | `kustomization.yaml` |
| Estensibilità | Funzioni template, `_helpers.tpl` | Patch, `replacements`, `generators` |
| Distribuzione | OCI registry / repo Helm | Git + riferimenti remoti |
| Lifecycle | Install/Upgrade/Rollback come oggetto | Stateless — `kubectl apply -k` non traccia release |
| Built-in in `kubectl` | No (richiede binario `helm`) | **Sì dal 1.14** — `kubectl apply -k` |

Kustomize non sostituisce Helm quando serve un **package distribuibile** con dipendenze e versioning (es. un chart pubblicato su ArtifactHub). Ma è spesso **migliore** per la configurazione interna di un'organizzazione: nessun linguaggio di template da imparare, diff leggibili, e nessun rischio di stringhe escape sbagliate nei template.

> **Regola pratica:** Helm per il software che **distribuisci** (anche internamente), Kustomize per il codice di **deployment** del tuo team (applicazioni proprietarie con 3-5 ambienti).

---

### Anatomia di un progetto Kustomize

```
myapp/
├── base/
│   ├── kustomization.yaml    # Elenca le risorse della base
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── replica-patch.yaml
    ├── staging/
    │   ├── kustomization.yaml
    │   └── config-patch.yaml
    └── prod/
        ├── kustomization.yaml
        ├── replica-patch.yaml
        ├── resources-patch.yaml
        └── hpa.yaml              # Risorsa aggiuntiva solo in prod
```

**`base/kustomization.yaml`** dichiara le risorse comuni:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- deployment.yaml
- service.yaml
- configmap.yaml

commonLabels:
  app: myapp
  managed-by: kustomize

commonAnnotations:
  team: platform
```

**`overlays/prod/kustomization.yaml`** personalizza la base:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: production

resources:
- ../../base
- hpa.yaml                # Risorsa extra solo in prod

namePrefix: prod-
nameSuffix: -v1

commonLabels:
  env: prod

images:
- name: myapp              # Sostituisce image: myapp:* nella base
  newName: registry.example.com/myapp
  newTag: v1.5.2

replicas:
- name: myapp              # Override delle repliche senza patch
  count: 6

patches:
- path: replica-patch.yaml
- path: resources-patch.yaml
- target:
    kind: Deployment
    name: myapp
  patch: |-
    - op: add
      path: /spec/template/spec/nodeSelector
      value:
        environment: production
```

**Render e apply:**

```bash
# Render senza applicare — ottimo per code review
kubectl kustomize overlays/prod | less

# Apply diretto (nativo in kubectl)
kubectl apply -k overlays/prod

# Diff rispetto al cluster
kubectl diff -k overlays/prod
```

---

### Tipi di patch

#### 1. Strategic Merge Patch (default, il più pulito)

Kubernetes-aware: sa che `containers` è una lista indicizzata per `name`, quindi fa merge intelligente.

**`replica-patch.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 6
  template:
    spec:
      containers:
      - name: myapp                 # Match per name
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2
            memory: 1Gi
```

Il risultato è un **merge**, non una sostituzione: tutti gli altri campi del container restano quelli della base.

#### 2. JSON 6902 Patch (per operazioni precise)

Usalo quando serve aggiungere/rimuovere un elemento specifico in una lista ordinata, o modificare un campo in un punto preciso.

```yaml
# overlays/prod/kustomization.yaml
patches:
- target:
    kind: Deployment
    name: myapp
  patch: |-
    - op: add
      path: /spec/template/spec/tolerations/-
      value:
        key: dedicated
        operator: Equal
        value: prod
        effect: NoSchedule
    - op: replace
      path: /spec/strategy/rollingUpdate/maxUnavailable
      value: 0
    - op: remove
      path: /spec/template/spec/containers/0/env/2
```

#### 3. Replacements (copiare valori tra risorse)

Propaga un valore da una risorsa all'altra (es. il name di un Service nell'env di un altro Deployment).

```yaml
# overlays/prod/kustomization.yaml
replacements:
- source:
    kind: Service
    name: database
    fieldPath: metadata.name
  targets:
  - select:
      kind: Deployment
      name: myapp
    fieldPaths:
    - spec.template.spec.containers.[name=myapp].env.[name=DB_HOST].value
```

---

### Generators: ConfigMap e Secret con hash

Il problema classico: modifichi una ConfigMap, ma i Pod non si ri-deployano perché il ReplicaSet non cambia. Kustomize risolve appendendo un **hash del contenuto** al nome della ConfigMap ad ogni render, e aggiornando automaticamente tutti i riferimenti.

```yaml
# base/kustomization.yaml
configMapGenerator:
- name: app-config
  literals:
  - LOG_LEVEL=info
  - FEATURE_FLAG_X=true
  files:
  - nginx.conf
  - app.properties=config/application.properties

secretGenerator:
- name: app-secrets
  literals:
  - API_TOKEN=dev-token
  type: Opaque

generatorOptions:
  disableNameSuffixHash: false   # Default: aggiunge -<hash> al nome
```

**Risultato del render:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-87hg9m2ft4   # ← hash del contenuto
data:
  LOG_LEVEL: info
  FEATURE_FLAG_X: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
      - name: myapp
        envFrom:
        - configMapRef:
            name: app-config-87hg9m2ft4   # ← aggiornato automaticamente!
```

Modifica `LOG_LEVEL=debug` → nuovo hash → Deployment modificato → **rolling update automatico**. Senza Kustomize dovresti fare `kubectl rollout restart` manualmente.

---

### Pattern di composizione

#### Components (riusabili, attivabili)

Un **component** è un frammento di Kustomize che puoi "incollare" in più overlay. Esempio: pattern TLS che vuoi attivare in staging e prod ma non in dev.

```
components/
└── tls/
    ├── kustomization.yaml
    ├── certificate.yaml
    └── ingress-tls-patch.yaml
```

```yaml
# components/tls/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component

resources:
- certificate.yaml

patches:
- path: ingress-tls-patch.yaml
```

```yaml
# overlays/prod/kustomization.yaml
resources:
- ../../base
components:
- ../../components/tls
```

#### Remote resources

`resources:` accetta URL Git — utile per tirare una base comune da un altro repo:

```yaml
resources:
- git::https://github.com/team/platform-bases//deployment?ref=v1.2.0
```

---

### Kustomize + Helm: integrazione

Kustomize può **gestire un chart Helm** tramite `helmCharts:` — utile quando vuoi patchare il render di un chart di terze parti senza fork.

```yaml
# kustomization.yaml
helmCharts:
- name: ingress-nginx
  repo: https://kubernetes.github.io/ingress-nginx
  version: 4.11.0
  releaseName: ingress
  namespace: ingress-nginx
  valuesInline:
    controller:
      replicaCount: 3
      service:
        type: LoadBalancer

patches:
- target:
    kind: Deployment
    name: ingress-ingress-nginx-controller
  patch: |-
    - op: add
      path: /spec/template/spec/tolerations
      value:
      - key: ingress
        operator: Exists
```

```bash
# Richiede il flag --enable-helm (il plugin non è sempre built-in)
kubectl kustomize --enable-helm .
```

---

### Integrazione con ArgoCD

ArgoCD supporta Kustomize nativamente — non serve altro: punti la `source.path` a una directory con `kustomization.yaml` e ArgoCD fa `kustomize build` per te.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: http://gitea.local/team/myapp
    targetRevision: main
    path: overlays/prod               # ← directory con kustomization.yaml
    kustomize:
      namePrefix: managed-
      commonLabels:
        env: production
        argocd-managed: "true"
      images:
      - registry.example.com/myapp:v1.5.3   # Override dell'image dalla CI
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
```

**Pattern comune in CI/CD:** la pipeline aggiorna **solo** il tag image nel `kustomization.yaml` dell'overlay target e fa git push. ArgoCD rileva il cambio e applica — senza toccare manifest o template.

```bash
# Nella pipeline CI, sul repo di deployment:
cd overlays/prod
kustomize edit set image myapp=registry.example.com/myapp:sha-abc1234
git add kustomization.yaml
git commit -m "ci: prod → sha-abc1234"
git push
```

---

### Trade-off Helm vs Kustomize — decision table

| Scenario | Scelta |
|----------|--------|
| Chart di terze parti (Prometheus, cert-manager, ingress-nginx) | **Helm** — usa i chart ufficiali |
| App proprietaria, 3-4 ambienti (dev/staging/prod) | **Kustomize** — overlay sono più pulite dei values-*.yaml |
| App proprietaria distribuita a N team interni | **Helm** — package versionato, lifecycle esplicito |
| Customizzare un chart di terze parti senza fork | **Helm + Kustomize** (`helmCharts:`) |
| Generare ConfigMap con rollout automatico | **Kustomize** (hash suffix) |
| Migrazione progressiva da manifest puri | **Kustomize** — ogni file resta valido YAML |

---

## Hands-on Guidato (90 min)

### Esercizio 1 — Migrazione da manifest puri a base + overlay

Partendo da tre file (`deployment.yaml`, `service.yaml`, `configmap.yaml`) di un'app nginx, creare la struttura base/overlay con dev e prod.

```bash
mkdir -p myapp/{base,overlays/dev,overlays/prod}

# Sposta i manifest esistenti nella base
cp deployment.yaml service.yaml configmap.yaml myapp/base/

# Crea la base kustomization
cat > myapp/base/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
- service.yaml
- configmap.yaml
commonLabels:
  app: webapp
EOF

# Overlay dev: 1 replica, image tag "dev"
cat > myapp/overlays/dev/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: webapp-dev
resources:
- ../../base
replicas:
- name: webapp
  count: 1
images:
- name: nginx
  newTag: "1.25-alpine"
commonLabels:
  env: dev
EOF

# Overlay prod: 4 replicas, image tag pinato, resources più alte
cat > myapp/overlays/prod/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: webapp-prod
resources:
- ../../base
replicas:
- name: webapp
  count: 4
images:
- name: nginx
  newTag: "1.25.3-alpine"
patches:
- path: resources-patch.yaml
commonLabels:
  env: prod
EOF

cat > myapp/overlays/prod/resources-patch.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
spec:
  template:
    spec:
      containers:
      - name: webapp
        resources:
          requests:
            cpu: 200m
            memory: 256Mi
          limits:
            cpu: 1
            memory: 512Mi
EOF

# Render e confronta
kubectl kustomize myapp/overlays/dev  > /tmp/dev.yaml
kubectl kustomize myapp/overlays/prod > /tmp/prod.yaml
diff /tmp/dev.yaml /tmp/prod.yaml

# Apply
kubectl create namespace webapp-dev
kubectl create namespace webapp-prod
kubectl apply -k myapp/overlays/dev
kubectl apply -k myapp/overlays/prod

kubectl get deploy -A -l app=webapp
```

### Esercizio 2 — ConfigMap generator con rollout automatico

```bash
cat > myapp/base/app.conf <<'EOF'
log_level=info
max_connections=100
EOF

# Sostituisci il configmap.yaml statico con un generator
cat > myapp/base/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
- deployment.yaml
- service.yaml

configMapGenerator:
- name: webapp-config
  files:
  - app.conf

commonLabels:
  app: webapp
EOF

# Render: osserva il suffisso hash della ConfigMap
kubectl kustomize myapp/base | grep -A 1 "name: webapp-config"
# → name: webapp-config-87hg9m2ft4

# Apply e verifica
kubectl apply -k myapp/overlays/dev
kubectl get configmap -n webapp-dev

# Modifica il file — il Deployment si ri-deploya da solo
echo "log_level=debug" > myapp/base/app.conf
echo "max_connections=500" >> myapp/base/app.conf

kubectl apply -k myapp/overlays/dev

# Nuova ConfigMap con hash diverso, vecchio ReplicaSet sostituito
kubectl get cm -n webapp-dev
kubectl rollout history deployment/webapp -n webapp-dev
```

### Esercizio 3 — Component TLS riutilizzabile

```bash
mkdir -p myapp/components/tls

cat > myapp/components/tls/kustomization.yaml <<'EOF'
apiVersion: kustomize.config.k8s.io/v1alpha1
kind: Component

patches:
- target:
    kind: Deployment
    name: webapp
  patch: |-
    - op: add
      path: /spec/template/metadata/annotations
      value:
        linkerd.io/inject: enabled
    - op: add
      path: /spec/template/spec/containers/0/env/-
      value:
        name: TLS_ENABLED
        value: "true"
EOF

# Attiva il component solo in prod
cat >> myapp/overlays/prod/kustomization.yaml <<'EOF'

components:
- ../../components/tls
EOF

# Render e verifica il patch applicato
kubectl kustomize myapp/overlays/prod | grep -A 2 "TLS_ENABLED"
```

---

## Capstone Challenge (30 min)

> **"Tre ambienti, un repo"**
>
> Il tuo team deve gestire la stessa app in tre ambienti con queste differenze:
>
> | Attributo | dev | staging | prod |
> |-----------|-----|---------|------|
> | Namespace | `app-dev` | `app-staging` | `app-prod` |
> | Replicas | 1 | 2 | 6 |
> | Image tag | `latest` | `staging-<sha>` | `v1.2.3` |
> | Ingress host | `dev.app.local` | `staging.app.example.com` | `app.example.com` |
> | HPA | No | No | Sì (2-10, CPU 60%) |
> | NetworkPolicy deny-all | No | Sì | Sì |
> | Resources | 100m/128Mi | 200m/256Mi | 500m/512Mi |
>
> 1. Struttura il repo con `base/`, `overlays/{dev,staging,prod}/`, `components/{hpa,networkpolicy}/`
> 2. Usa `configMapGenerator` per la configurazione dell'app
> 3. Verifica con `kubectl diff -k` che il render di prod contenga HPA e NetworkPolicy
> 4. **Bonus**: integra con ArgoCD — crea 3 `Application` (una per overlay) e verifica che siano tutte `Synced`

---

## Self-Study Assignment

- Leggere il [Kustomize Reference](https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/) — almeno le sezioni `resources`, `patches`, `generators`, `replacements`
- Esplorare il repo [kubernetes-sigs/kustomize/examples](https://github.com/kubernetes-sigs/kustomize/tree/master/examples) — contiene esempi reali per ogni feature
- Leggere [Kustomize Best Practices — Google Cloud](https://cloud.google.com/kubernetes-engine/enterprise/config-sync/docs/best-practices/kustomize) per pattern di organizzazione di repo multi-team
- Provare una migrazione: prendere un chart Helm che usi abitualmente e ricrearlo in Kustomize — annotare dove Helm è più pratico e dove Kustomize è più leggibile

---

## Dove andare da qui

- **Strumenti avanzati**: [kustomize-sops](https://github.com/viaduct-ai/kustomize-sops) per secret cifrati in Git, [kustomize-diff](https://github.com/databepo/kustomize-diff) per drift detection
- **ArgoCD ApplicationSet + Kustomize**: genera automaticamente Application per ogni overlay in un repo
- **OpenGitOps + Kustomize**: il pattern canonico per GitOps dichiarativo senza template engine
- **Policy validation**: integra `kustomize build | conftest` o `kustomize build | kyverno` per validare le overlay in CI prima del merge

---

## Risorse Aggiuntive

### Documentazione ufficiale

- [Kustomize Documentation](https://kubectl.docs.kubernetes.io/references/kustomize/) — guida di riferimento completa
- [Kustomize Glossary](https://kubectl.docs.kubernetes.io/references/kustomize/glossary/) — definizioni di base, overlay, component, generator, transformer
- [kubectl apply -k — kubernetes.io](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/) — uso di Kustomize via kubectl

### Pattern e best practice

- [Kustomize Examples — kubernetes-sigs](https://github.com/kubernetes-sigs/kustomize/tree/master/examples) — 40+ esempi pronti, da semplice a complesso
- [Kustomize Best Practices — Google Cloud](https://cloud.google.com/kubernetes-engine/enterprise/config-sync/docs/best-practices/kustomize) — organizzazione repo, multi-team, GitOps
- [Declarative Management with Kustomize — kubernetes.io](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/) — tutorial ufficiale step-by-step

### Helm vs Kustomize

- [Helm vs Kustomize — learnk8s](https://learnk8s.io/helm-kustomize-ksonnet) — confronto dettagliato con esempi
- [Using Kustomize with Helm — Helm docs](https://helm.sh/docs/chart_best_practices/templates/) — pattern di integrazione `helmCharts:`

### Integrazioni

- [ArgoCD + Kustomize](https://argo-cd.readthedocs.io/en/stable/user-guide/kustomize/) — features specifiche del supporto ArgoCD per Kustomize
- [Flux + Kustomize](https://fluxcd.io/flux/components/kustomize/) — Flux Kustomize Controller per GitOps nativo
- [kustomize-sops](https://github.com/viaduct-ai/kustomize-sops) — gestione secret cifrati con Mozilla SOPS
