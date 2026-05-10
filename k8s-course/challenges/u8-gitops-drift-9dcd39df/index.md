---
kind: challenge

title: "GitOps Drift: ArgoCD Self-Heal"

description: |
  Simula un drift manuale su una risorsa gestita da ArgoCD e osserva il self-healing.
  Configura un'Application ArgoCD da un repo Git e verifica che il drift venga
  corretto automaticamente entro 3 minuti.

categories:
- kubernetes

tags:
- argocd
- gitops
- self-healing
- drift

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_argocd:
    init: true
    run: |
      # Install ArgoCD (lightweight)
      kubectl create namespace argocd 2>/dev/null || true
      kubectl apply -n argocd \
        -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml \
        2>/dev/null || true
      # Wait briefly for ArgoCD
      sleep 30
      kubectl wait pod -n argocd -l app.kubernetes.io/name=argocd-server \
        --for=condition=Ready --timeout=120s 2>/dev/null || true

  verify_app_synced:
    run: |
      # Check ArgoCD Application exists and is synced
      STATUS=$(kubectl get application -n argocd gitops-demo \
        -o jsonpath='{.status.sync.status}' 2>/dev/null || echo "missing")
      [ "$STATUS" = "Synced" ] || exit 1

  verify_drift_detected:
    run: |
      # Check /tmp/drift-detected.txt exists
      [ -f /tmp/drift-detected.txt ] || exit 1
      grep -q "OutOfSync\|Degraded\|drift" /tmp/drift-detected.txt || exit 1

  verify_self_healed:
    run: |
      # After manual drift, ArgoCD should sync back automatically
      STATUS=$(kubectl get application -n argocd gitops-demo \
        -o jsonpath='{.status.sync.status}' 2>/dev/null || echo "missing")
      [ "$STATUS" = "Synced" ] || exit 1
      HEALTH=$(kubectl get application -n argocd gitops-demo \
        -o jsonpath='{.status.health.status}' 2>/dev/null || echo "missing")
      [ "$HEALTH" = "Healthy" ] || exit 1
---

_Configura ArgoCD, simula un drift manuale, e osserva il self-healing automatico._

---

## Scenario

ArgoCD è stato installato nel namespace `argocd`. Il tuo compito è:
1. Creare un'Application ArgoCD che punta a un repo Git
2. Simulare un drift manuale (cambiare direttamente il cluster)
3. Osservare come ArgoCD rileva il drift e lo corregge automaticamente

---

## Task 1 — Crea un'Application ArgoCD

Usa il repo di esempio ufficiale ArgoCD:

```bash
# Attendi che ArgoCD sia pronto
kubectl wait pod -n argocd -l app.kubernetes.io/name=argocd-server \
  --for=condition=Ready --timeout=120s

# Ottieni la password admin
ARGOCD_PASS=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d)
echo "Password: $ARGOCD_PASS"

# Crea l'Application via kubectl (senza UI)
kubectl apply -n argocd -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: gitops-demo
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
    syncOptions:
    - CreateNamespace=true
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_app_synced
---
#active
In attesa che l'Application `gitops-demo` sia in stato Synced...

#completed
L'Application ArgoCD è sincronizzata con il repository Git!
::

---

## Task 2 — Simula un Drift

Modifica manualmente una risorsa gestita da ArgoCD e documenta il drift:

```bash
# Cambia il numero di repliche direttamente nel cluster
kubectl scale deployment guestbook-ui --replicas=5

# ArgoCD dovrebbe rilevare la discrepanza entro ~3 minuti
# Monitora lo stato
watch kubectl get application gitops-demo -n argocd \
  -o jsonpath='{.status.sync.status}{"\n"}'

# Oppure con argocd CLI (se disponibile)
# argocd app get gitops-demo

# Salva l'evidenza del drift
kubectl get application gitops-demo -n argocd -o jsonpath='{.status.sync.status}' \
  > /tmp/drift-detected.txt
echo " drift" >> /tmp/drift-detected.txt
echo "Repliche prima del heal: $(kubectl get deployment guestbook-ui -o jsonpath='{.spec.replicas}')" \
  >> /tmp/drift-detected.txt
```

::simple-task
---
:tasks: tasks
:name: verify_drift_detected
---
#active
In attesa di `/tmp/drift-detected.txt` con evidenza del drift (OutOfSync/drift)...

#completed
Drift documentato!
::

---

## Task 3 — Osserva il Self-Healing

ArgoCD con `selfHeal: true` correggerà automaticamente il drift:

```bash
# Aspetta il self-heal (max 3 minuti)
for i in $(seq 1 18); do
  STATUS=$(kubectl get application gitops-demo -n argocd \
    -o jsonpath='{.status.sync.status}' 2>/dev/null)
  echo "$(date +%T) Status: $STATUS"
  [ "$STATUS" = "Synced" ] && break
  sleep 10
done

# Verifica che le repliche siano tornate al valore Git
kubectl get deployment guestbook-ui -o jsonpath='{.spec.replicas}'
```

::simple-task
---
:tasks: tasks
:name: verify_self_healed
---
#active
In attesa che ArgoCD ripristini lo stato Synced dopo il drift...

#completed
Self-healing completato! ArgoCD ha ripristinato lo stato desiderato dal Git repo.
::

::hint-box
---
:summary: GitOps: Pull Model vs Push Model
---

| Modello | Come funziona | Tool tipici |
|---------|--------------|-------------|
| **Pull** (GitOps) | Agent nel cluster legge Git e applica | ArgoCD, Flux |
| **Push** (CI/CD) | Pipeline esterna fa kubectl apply | GitHub Actions, Jenkins |

**Vantaggi GitOps Pull:**
- Il cluster non ha mai credenziali esterne
- Drift detection automatica
- Audit trail completo su Git
- Rollback = revert del commit Git

`selfHeal: true` è la funzionalità che distingue GitOps da "GitOps manuale":
senza di essa, ArgoCD rileva il drift ma non lo corregge automaticamente.
::
