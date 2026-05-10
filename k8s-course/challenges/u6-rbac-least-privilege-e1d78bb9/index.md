---
kind: challenge

title: "RBAC Least Privilege: Token Compromesso"

description: |
  Un ServiceAccount token è stato compromesso. Analizza i permessi eccessivi,
  riduci i privilegi senza rompere l'applicazione, e verifica che il principio
  del minimo privilegio sia rispettato.

categories:
- kubernetes
- security

tags:
- rbac
- serviceaccount
- least-privilege
- authorization

difficulty: hard

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_overprivileged:
    init: true
    run: |
      kubectl create namespace rbac-lab 2>/dev/null || true
      # Create overprivileged ServiceAccount
      kubectl create serviceaccount app-sa -n rbac-lab 2>/dev/null || true
      printf 'apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: app-clusterrole\nrules:\n- apiGroups: ["*"]\n  resources: ["*"]\n  verbs: ["*"]\n' > /tmp/cr.yaml && kubectl apply -f /tmp/cr.yaml 2>/dev/null || true
      kubectl create clusterrolebinding app-clusterrolebinding         --clusterrole=app-clusterrole         --serviceaccount=rbac-lab:app-sa 2>/dev/null || true
      kubectl run app-pod -n rbac-lab --image=bitnami/kubectl:latest         --serviceaccount=app-sa         -l app=myapp         --restart=Never -- sleep 3600 2>/dev/null || true

  verify_clusterrolebinding_removed:
    run: |
      # ClusterRoleBinding must not exist or not bind app-sa to cluster-admin/wildcard
      BINDING=$(kubectl get clusterrolebinding app-clusterrolebinding 2>/dev/null | grep app-clusterrolebinding || echo "")
      [ -z "$BINDING" ] || exit 1

  verify_namespaced_role:
    run: |
      # A Role (not ClusterRole) must exist in rbac-lab for app-sa
      ROLE_COUNT=$(kubectl get role -n rbac-lab 2>/dev/null | grep -c . || echo 0)
      [ "$ROLE_COUNT" -ge 2 ] || exit 1  # Header + at least 1 role

  verify_app_still_works:
    run: |
      # The app should still be able to list pods in its own namespace
      TOKEN=$(kubectl exec -n rbac-lab app-pod -- \
        cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>/dev/null)
      [ -n "$TOKEN" ] || exit 1
      RESULT=$(kubectl exec -n rbac-lab app-pod -- \
        kubectl get pods -n rbac-lab 2>&1 | grep -v "Error\|forbidden" | grep -c . || echo 0)
      [ "$RESULT" -ge 1 ] || exit 1
---

_Riduci i permessi di un ServiceAccount compromesso senza rompere l'applicazione._

---

## Scenario

Il ServiceAccount `app-sa` nel namespace `rbac-lab` ha un ClusterRoleBinding a una
ClusterRole con wildcard (`*`) su tutti i verbi e risorse. Un token è stato compromesso.

L'app ha bisogno solo di:
- `list` e `get` sui Pod nel proprio namespace
- `get` sui ConfigMap nel proprio namespace

Il tuo obiettivo: rimuovere i permessi eccessivi e configurare il minimo necessario.

---

## Analisi Iniziale

```bash
# Scopri cosa può fare app-sa
kubectl auth can-i --list --as=system:serviceaccount:rbac-lab:app-sa
kubectl auth can-i create pods --as=system:serviceaccount:rbac-lab:app-sa
kubectl auth can-i delete nodes --as=system:serviceaccount:rbac-lab:app-sa  # dovrebbe essere yes!
```

---

## Task 1 — Rimuovi il ClusterRoleBinding

Elimina il binding eccessivo che dà accesso a tutto il cluster:

```bash
kubectl delete clusterrolebinding app-clusterrolebinding
```

::simple-task
---
:tasks: tasks
:name: verify_clusterrolebinding_removed
---
#active
In attesa che il ClusterRoleBinding `app-clusterrolebinding` sia rimosso...

#completed
ClusterRoleBinding rimosso. Il ServiceAccount non ha più accesso al cluster.
::

---

## Task 2 — Crea Role con Minimo Privilegio

Crea un Role (namespace-scoped, non ClusterRole) con solo i permessi necessari:

```bash
kubectl apply -n rbac-lab -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-minimal-role
  namespace: rbac-lab
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app-minimal-binding
  namespace: rbac-lab
subjects:
- kind: ServiceAccount
  name: app-sa
  namespace: rbac-lab
roleRef:
  kind: Role
  name: app-minimal-role
  apiGroup: rbac.authorization.k8s.io
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_namespaced_role
---
#active
In attesa di un Role namespace-scoped in `rbac-lab`...

#completed
Role con minimo privilegio creato nel namespace corretto.
::

---

## Task 3 — Verifica che l'App Funzioni

```bash
# Verifica che l'app possa ancora fare le operazioni necessarie
kubectl auth can-i list pods -n rbac-lab \
  --as=system:serviceaccount:rbac-lab:app-sa  # deve essere YES

# Verifica che NON possa fare operazioni rischiose
kubectl auth can-i delete nodes \
  --as=system:serviceaccount:rbac-lab:app-sa  # deve essere NO

kubectl auth can-i create pods -n rbac-lab \
  --as=system:serviceaccount:rbac-lab:app-sa  # deve essere NO
```

::simple-task
---
:tasks: tasks
:name: verify_app_still_works
---
#active
In attesa che `app-pod` possa ancora listare i Pod nel proprio namespace...

#completed
L'app funziona con il minimo privilegio necessario.
::

::hint-box
---
:summary: Role vs ClusterRole: quando usare quale
---

| Tipo | Scope | Quando usarlo |
|------|-------|---------------|
| `Role` | Namespace | App che opera in un solo namespace |
| `ClusterRole` | Cluster intero | Operatori cluster-wide, monitoring |
| `RoleBinding` | Namespace | Bind un Role O ClusterRole a namespace |
| `ClusterRoleBinding` | Cluster | Bind solo ClusterRole, scope globale |

**Regola d'oro**: usa sempre `Role` + `RoleBinding` se l'app vive in un namespace.
Usa `ClusterRole` solo per risorse cluster-scoped (Nodes, PersistentVolumes).
::
