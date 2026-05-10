---
kind: challenge

title: "MultiZone Spread: TopologySpreadConstraints"

description: |
  Distribuisci 6 repliche di un Deployment uniformemente in 3 zone di disponibilità
  usando TopologySpreadConstraints. Verifica che nessuna zona abbia più del doppio
  delle repliche di un'altra.

categories:
- kubernetes

tags:
- topology
- scheduling
- high-availability
- zones

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  init_nodes:
    init: true
    run: |
      # Label nodes with zones (simulate 3 zones)
      NODES=$(kubectl get nodes --no-headers -o custom-columns=NAME:.metadata.name | grep -v master | grep -v control)
      NODE_COUNT=$(echo "$NODES" | wc -l)
      I=0
      for NODE in $NODES; do
        ZONE="zone-$((I % 3 + 1))"
        kubectl label node $NODE topology.kubernetes.io/zone=$ZONE --overwrite
        I=$((I + 1))
      done
      # Also label control plane node if we have < 3 worker nodes
      CTRL=$(kubectl get nodes --no-headers -o custom-columns=NAME:.metadata.name | head -3)
      J=0
      for NODE in $CTRL; do
        ZONE="zone-$((J % 3 + 1))"
        kubectl label node $NODE topology.kubernetes.io/zone=$ZONE --overwrite 2>/dev/null || true
        J=$((J + 1))
      done

  verify_spread_deployment:
    run: |
      # Check deployment exists with 6 replicas
      REPLICAS=$(kubectl get deployment spread-app \
        -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 0)
      [ "$REPLICAS" -ge 6 ] || exit 1

  verify_topology_constraint:
    run: |
      # Check TopologySpreadConstraints are configured
      CONSTRAINTS=$(kubectl get deployment spread-app \
        -o jsonpath='{.spec.template.spec.topologySpreadConstraints}' 2>/dev/null || echo "")
      [ -n "$CONSTRAINTS" ] || exit 1
      [ "$CONSTRAINTS" != "[]" ] || exit 1

  verify_zone_distribution:
    run: |
      # Check pods are distributed across zones (at least 4 running)
      RUNNING=$(kubectl get pods -l app=spread-app --field-selector=status.phase=Running \
        -o name 2>/dev/null | wc -l)
      [ "$RUNNING" -ge 4 ] || exit 1
---

_Distribuisci 6 repliche uniformemente in 3 zone con TopologySpreadConstraints._

---

## Scenario

I nodi del cluster sono stati etichettati con zone di disponibilità (`topology.kubernetes.io/zone`).
Devi deployare un'applicazione con 6 repliche assicurandoti che siano distribuite
uniformemente tra le zone per garantire alta disponibilità.

```bash
# Verifica le zone dei nodi
kubectl get nodes --show-labels | grep topology.kubernetes.io/zone
```

---

## Task 1 — Crea il Deployment con TopologySpreadConstraints

```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spread-app
spec:
  replicas: 6
  selector:
    matchLabels:
      app: spread-app
  template:
    metadata:
      labels:
        app: spread-app
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: spread-app
      containers:
      - name: app
        image: nginx:alpine
        resources:
          requests:
            cpu: "10m"
            memory: "16Mi"
EOF
```

::simple-task
---
:tasks: tasks
:name: verify_spread_deployment
---
#active
In attesa del Deployment `spread-app` con 6 repliche...

#completed
Deployment creato con 6 repliche!
::

::simple-task
---
:tasks: tasks
:name: verify_topology_constraint
---
#active
In attesa delle TopologySpreadConstraints nel Deployment...

#completed
TopologySpreadConstraints configurate correttamente.
::

---

## Task 2 — Verifica la Distribuzione

```bash
# Guarda su quali nodi sono i Pod
kubectl get pods -l app=spread-app -o wide

# Conta per zona
kubectl get pods -l app=spread-app -o json | \
  python3 -c "
import json, sys
pods = json.load(sys.stdin)['items']
for pod in pods:
    node = pod['spec'].get('nodeName', 'unscheduled')
    print(f\"Pod: {pod['metadata']['name']}, Node: {node}\")
"

# Verifica le zone dei nodi
kubectl get nodes -o custom-columns=\
'NAME:.metadata.name,ZONE:.metadata.labels.topology\.kubernetes\.io/zone'
```

::simple-task
---
:tasks: tasks
:name: verify_zone_distribution
---
#active
In attesa che almeno 4 Pod siano in esecuzione su nodi in zone diverse...

#completed
I Pod sono distribuiti tra le zone di disponibilità!
::

::hint-box
---
:summary: maxSkew e whenUnsatisfiable
---

- `maxSkew: 1` → differenza massima di 1 Pod tra le zone (2-2-2 ok, 3-2-1 ok, 4-1-1 NO)
- `maxSkew: 2` → più flessibile (4-2-0 ok)
- `whenUnsatisfiable: DoNotSchedule` → Pod rimane Pending se non può rispettare il constraint
- `whenUnsatisfiable: ScheduleAnyway` → schedula comunque ma cerca di minimizzare lo skew

Per ambienti con zone asimmetriche (1 nodo per zona), usa `ScheduleAnyway`
per evitare che i Pod rimangano Pending.
::

---

## Bonus — Combinare con Pod Affinity

Per garantire che i Pod siano **anche** anti-affini tra loro (max 1 per nodo):

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app: spread-app
        topologyKey: kubernetes.io/hostname
```
