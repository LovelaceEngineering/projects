---
kind: challenge

title: "Il Microservizio Disperso: Debugging 3-Tier"

description: |
  Un'architettura 3-tier (frontend, api, database) ha errori multipli: selector mismatch,
  DNS errato, e NetworkPolicy troppo restrittiva. Trova e correggi tutti i problemi.

categories:
- kubernetes
- networking

tags:
- service-discovery
- dns
- networkpolicy
- debugging

difficulty: hard

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_broken_stack:
    init: true
    run: |
      kubectl create namespace microapp 2>/dev/null || true
      # Database (works fine)
      kubectl create deployment database -n microapp --image=redis:7-alpine -- redis-server 2>/dev/null || true
      kubectl expose deployment database -n microapp --name=database-svc --port=6379 2>/dev/null || true
      # API (selector mismatch bug: service will point to wrong label)
      kubectl create deployment api -n microapp --image=nginx:alpine 2>/dev/null || true
      kubectl expose deployment api -n microapp --name=api-svc --port=8080 --target-port=8080 2>/dev/null || true
      kubectl patch svc api-svc -n microapp --type=json -p='[{"op":"replace","path":"/spec/selector/app","value":"api-wrong-label"}]' 2>/dev/null || true
      # Frontend pod
      kubectl run frontend -n microapp --image=alpine:3.19 -l app=frontend --restart=Never -- sleep 3600 2>/dev/null || true
      # NetworkPolicy: only allows frontend->api, but wrong label
      printf 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: api-ingress\n  namespace: microapp\nspec:\n  podSelector:\n    matchLabels:\n      app: api\n  ingress:\n  - from:\n    - podSelector:\n        matchLabels:\n          app: frontend-wrong\n  policyTypes:\n  - Ingress\n' > /tmp/netpol.yaml && kubectl apply -f /tmp/netpol.yaml 2>/dev/null || true

  verify_selector_fixed:
    run: |
      # Check api-svc has correct selector matching api pods
      SELECTOR=$(kubectl get svc api-svc -n microapp \
        -o jsonpath='{.spec.selector.app}' 2>/dev/null || echo "wrong")
      [ "$SELECTOR" = "api" ] || exit 1
      # Check endpoints are populated
      ENDPOINTS=$(kubectl get endpoints api-svc -n microapp \
        -o jsonpath='{.subsets[0].addresses}' 2>/dev/null || echo "")
      [ -n "$ENDPOINTS" ] || exit 1

  verify_networkpolicy_fixed:
    run: |
      # Check the NetworkPolicy allows frontend pods
      SELECTOR=$(kubectl get networkpolicy api-ingress -n microapp \
        -o jsonpath='{.spec.ingress[0].from[0].podSelector.matchLabels.app}' 2>/dev/null || echo "wrong")
      [ "$SELECTOR" = "frontend" ] || exit 1
---

_Tre microservizi, tre bug di networking. Risolvi il selector mismatch e la NetworkPolicy errata._

---

## Scenario

L'applicazione `microapp` ha tre componenti: `frontend`, `api`, e `database`.
Il frontend non riesce a raggiungere l'API, e l'API non raggiunge il database.
Esamina lo stack e trova i bug.

```bash
kubectl get all -n microapp
kubectl get networkpolicies -n microapp
```

---

## Bug 1 — Service Selector Mismatch

L'`api-svc` non ha endpoint perché il selector è sbagliato.

```bash
# Diagnosi: controlla gli endpoint
kubectl get endpoints api-svc -n microapp

# Diagnosi: confronta selector del Service con labels dei Pod
kubectl get svc api-svc -n microapp -o yaml | grep selector -A5
kubectl get pods -n microapp -l app=api --show-labels
```

Correggi il selector del Service:

```bash
kubectl patch svc api-svc -n microapp \
  --type=json \
  -p='[{"op":"replace","path":"/spec/selector/app","value":"api"}]'
```

::simple-task
---
:tasks: tasks
:name: verify_selector_fixed
---
#active
In attesa che `api-svc` abbia il selector corretto e gli endpoint popolati...

#completed
Service selector corretto! L'API è ora raggiungibile dal Service.
::

---

## Bug 2 — NetworkPolicy Troppo Restrittiva

La NetworkPolicy blocca il traffico dal frontend perché usa il label sbagliato.

```bash
# Diagnosi: esamina la NetworkPolicy
kubectl get networkpolicy api-ingress -n microapp -o yaml

# Test connettività prima del fix
kubectl exec -n microapp frontend -- wget -qO- --timeout=2 http://api-svc.microapp:8080/ 2>&1
```

Correggi la NetworkPolicy:

```bash
kubectl patch networkpolicy api-ingress -n microapp \
  --type=json \
  -p='[{"op":"replace","path":"/spec/ingress/0/from/0/podSelector/matchLabels/app","value":"frontend"}]'
```

::simple-task
---
:tasks: tasks
:name: verify_networkpolicy_fixed
---
#active
In attesa che la NetworkPolicy `api-ingress` usi il label corretto `app: frontend`...

#completed
NetworkPolicy corretta! Il frontend può ora raggiungere l'API.
::

::hint-box
---
:summary: Come debuggare NetworkPolicy
---

Le NetworkPolicy NON hanno un modo diretto per vedere perché bloccano.
Usa questa tecnica:

1. `kubectl exec pod -- wget/curl` per testare connettività
2. Se fallisce e c'è una NetworkPolicy, prova a cancellarla temporaneamente
3. Se funziona senza policy → la policy è il problema
4. Ispeziona `podSelector`, `namespaceSelector`, e `ipBlock` nella policy

Tool utile: `netpol-analyzer` (terze parti) o Cilium's Network Policy editor.
::
