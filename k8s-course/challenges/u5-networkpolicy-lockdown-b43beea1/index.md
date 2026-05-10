---
kind: challenge

title: "NetworkPolicy Lockdown: Isolamento Database"

description: |
  Implementa una strategia default-deny e allowlist per isolare un database PostgreSQL.
  Solo i Pod API devono poter connettersi al database. Verifica con test di connettività.

categories:
- kubernetes
- networking

tags:
- networkpolicy
- default-deny
- isolation
- zero-trust

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_stack:
    init: true
    run: |
      kubectl create namespace secure-app 2>/dev/null || true
      kubectl create deployment database -n secure-app --image=postgres:15-alpine 2>/dev/null || true
      kubectl set env deployment/database -n secure-app POSTGRES_PASSWORD=testpass 2>/dev/null || true
      kubectl patch deployment database -n secure-app --type=json         -p='[{"op":"add","path":"/spec/template/metadata/labels/tier","value":"db"},{"op":"add","path":"/spec/template/spec/containers/0/ports","value":[{"containerPort":5432}]}]' 2>/dev/null || true
      kubectl expose deployment database -n secure-app --name=database-svc --port=5432 2>/dev/null || true
      kubectl run api-pod -n secure-app --image=alpine:3.19 -l app=api,tier=backend --restart=Never -- sleep 3600 2>/dev/null || true
      kubectl run untrusted-pod -n secure-app --image=alpine:3.19 -l app=untrusted --restart=Never -- sleep 3600 2>/dev/null || true

  verify_default_deny:
    run: |
      # Check a default-deny NetworkPolicy exists for db tier
      kubectl get networkpolicy -n secure-app -o jsonpath='{.items[*].metadata.name}' \
        2>/dev/null | grep -q "default-deny\|deny-all\|db-deny" || exit 1

  verify_api_can_reach_db:
    run: |
      # api-pod should be able to reach database-svc:5432
      RESULT=$(kubectl exec -n secure-app api-pod -- \
        nc -zw 3 database-svc.secure-app.svc.cluster.local 5432 2>&1 && echo "ok" || echo "fail")
      [ "$RESULT" = "ok" ] || exit 1

  verify_untrusted_blocked:
    run: |
      # untrusted-pod should NOT be able to reach database-svc:5432
      RESULT=$(kubectl exec -n secure-app untrusted-pod -- \
        nc -zw 3 database-svc.secure-app.svc.cluster.local 5432 2>&1 && echo "ok" || echo "fail")
      [ "$RESULT" = "fail" ] || exit 1
---

_Implementa default-deny e allowlist per proteggere il database PostgreSQL._

---

## Scenario

Il namespace `secure-app` ha un database PostgreSQL che deve essere accessibile
solo dai Pod con label `app: api`. Attualmente, qualsiasi Pod nel cluster
può connettersi al database. Implementa il lockdown.

```bash
kubectl get pods -n secure-app --show-labels
```

---

## Task 1 — Default Deny (Isolamento Totale)

Inizia con una NetworkPolicy che blocca tutto il traffico in ingresso al database:

```bash
kubectl apply -n secure-app -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-db
spec:
  podSelector:
    matchLabels:
      tier: db
  policyTypes:
  - Ingress
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_default_deny
---
#active
In attesa di una NetworkPolicy default-deny per il database...

#completed
Default deny applicato. Il database è ora isolato.
::

---

## Task 2 — Allowlist per il Pod API

Ora aggiungi una regola per permettere solo ai Pod con `app: api` di raggiungere il database:

```bash
kubectl apply -n secure-app -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-to-db
spec:
  podSelector:
    matchLabels:
      tier: db
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api
    ports:
    - protocol: TCP
      port: 5432
  policyTypes:
  - Ingress
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_api_can_reach_db
---
#active
In attesa che `api-pod` possa raggiungere il database sulla porta 5432...

#completed
L'API può connettersi al database!
::

::simple-task
---
:tasks: tasks
:name: verify_untrusted_blocked
---
#active
In attesa che `untrusted-pod` venga bloccato dal database...

#completed
Il Pod non autorizzato è bloccato. Il database è protetto.
::

::hint-box
---
:summary: NetworkPolicy: Ingress vs Egress
---

- **Ingress policy**: controlla chi può entrare nel Pod
- **Egress policy**: controlla a chi può connettersi il Pod

Per un isolamento completo, spesso si configurano entrambe:
- Database: `Ingress` restrictive (solo da API)
- API: `Egress` restrictive (solo verso database e DNS)

DNS usa la porta 53 UDP — ricordati di permettere il traffico DNS
se usi `Egress` policy, altrimenti la risoluzione DNS fallisce!
::
