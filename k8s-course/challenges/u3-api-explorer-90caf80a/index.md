---
kind: challenge

title: "API Explorer: Kubernetes via curl e kubectl -v=8"

description: |
  Interagisci con l'API server Kubernetes direttamente via curl e usa kubectl --v=8
  per capire le REST call sottostanti. Scopri come kubectl è solo un client HTTP.

categories:
- kubernetes

tags:
- api-server
- rest
- kubectl
- curl

difficulty: easy

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: k8s-omni

tasks:
  verify_curl_pods:
    run: |
      # Check that /tmp/api-pods.json exists and contains pod list
      [ -f /tmp/api-pods.json ] || exit 1
      python3 -c 'import json,sys; d=json.load(open("/tmp/api-pods.json")); sys.exit(0 if d.get("kind")=="PodList" else 1)' 2>/dev/null || exit 1

  verify_verbose_understood:
    run: |
      # Check /tmp/kubectl-verbose.txt exists and shows HTTP methods
      [ -f /tmp/kubectl-verbose.txt ] || exit 1
      grep -q "GET\|POST\|PATCH\|PUT" /tmp/kubectl-verbose.txt || exit 1
---

_Scopri che kubectl è solo un client HTTP: interagisci con l'API server direttamente via curl._

---

## Scenario

Ogni operazione `kubectl` è una chiamata REST all'API server.
Capire questa astrazione ti permette di automatizzare operazioni, debuggare problemi
di permessi, e integrare Kubernetes con qualsiasi linguaggio o tool HTTP.

---

## Task 1 — Interroga l'API Server con curl

Usa il token del ServiceAccount per autenticarti e lista i Pod nel namespace `default`:

```bash
# Ottieni le credenziali
TOKEN=$(kubectl create token default)
APISERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CA_CERT=/etc/kubernetes/pki/ca.crt

# Lista tutti i Pod via API REST
curl -s \
  --header "Authorization: Bearer $TOKEN" \
  --cacert $CA_CERT \
  $APISERVER/api/v1/namespaces/default/pods \
  > /tmp/api-pods.json

# Ispeziona il risultato
cat /tmp/api-pods.json | python3 -m json.tool | head -30
```

::simple-task
---
:tasks: tasks
:name: verify_curl_pods
---
#active
In attesa del file `/tmp/api-pods.json` con una lista di Pod valida...

#completed
Hai interrogato l'API server direttamente con curl!
::

::hint-box
---
:summary: Hint — Dove trovare il CA certificate
---

Su cluster kubeadm, il CA certificate è in `/etc/kubernetes/pki/ca.crt`.
In alternativa, puoi disabilitare la verifica TLS con `--insecure` (solo per test!):
```bash
curl -k --header "Authorization: Bearer $TOKEN" $APISERVER/api/v1/namespaces/default/pods
```
::

---

## Task 2 — Decodifica kubectl con --v=8

Esegui qualsiasi comando kubectl con verbosità massima e salva l'output per analizzarlo:

```bash
# Cattura le REST call di kubectl get pods
kubectl get pods --v=8 2>&1 | tee /tmp/kubectl-verbose.txt | head -60

# Cerca le righe con le chiamate HTTP
grep "GET\|POST\|PATCH" /tmp/kubectl-verbose.txt
```

::simple-task
---
:tasks: tasks
:name: verify_verbose_understood
---
#active
In attesa del file `/tmp/kubectl-verbose.txt` con le chiamate HTTP...

#completed
Ora sai che kubectl è solo un client HTTP con convenzioni.
::

::hint-box
---
:summary: Livelli di verbosità kubectl
---

| Flag | Output |
|------|--------|
| `--v=1` | Warning importanti |
| `--v=4` | Debug info |
| `--v=6` | Richieste HTTP (URL + metodo) |
| `--v=8` | Richieste HTTP + headers + body |
| `--v=10` | Risposta HTTP completa (dump raw) |

Per trovare l'endpoint esatto di qualsiasi risorsa:
```bash
kubectl api-resources --verbs=list -o wide
```
::

---

## Bonus — Crea un Pod via API REST

```bash
curl -s -X POST \
  --header "Authorization: Bearer $TOKEN" \
  --header "Content-Type: application/json" \
  --cacert $CA_CERT \
  $APISERVER/api/v1/namespaces/default/pods \
  -d '{
    "apiVersion": "v1",
    "kind": "Pod",
    "metadata": {"name": "api-created-pod"},
    "spec": {
      "containers": [{
        "name": "nginx",
        "image": "nginx:alpine"
      }]
    }
  }' | python3 -m json.tool
```
