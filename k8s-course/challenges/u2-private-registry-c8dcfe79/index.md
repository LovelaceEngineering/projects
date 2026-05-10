---
kind: challenge

title: "Registry Privato: Setup e Integrazione Containerd"

description: |
  Configura un registry Docker privato locale, fai push di un'immagine,
  e configura containerd per usarlo come mirror. Confronta docker pull vs nerdctl pull.

categories:
- containers

tags:
- registry
- containerd
- nerdctl
- mirror

difficulty: easy

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: docker

tasks:
  init_registry:
    init: true
    run: |
      # Start a local registry
      docker run -d -p 5000:5000 --name local-registry --restart=always registry:2 || true

  verify_image_pushed:
    run: |
      # Check that localhost:5000/myapp:v1 exists in the registry
      CATALOG=$(curl -s http://localhost:5000/v2/_catalog 2>/dev/null || echo "{}")
      echo "$CATALOG" | grep -q "myapp" || exit 1
      TAGS=$(curl -s http://localhost:5000/v2/myapp/tags/list 2>/dev/null || echo "{}")
      echo "$TAGS" | grep -q "v1" || exit 1

  verify_pulled_via_nerdctl:
    run: |
      # Check that the image was pulled with nerdctl (image exists in containerd)
      nerdctl image ls 2>/dev/null | grep -q "localhost:5000/myapp" || exit 1
---

_Configura un registry privato locale e integralo con Docker e containerd/nerdctl._

---

## Scenario

In ambienti enterprise si usa spesso un registry privato invece di Docker Hub.
In questo challenge configuri `registry:2` come registry locale,
fai push di un'immagine, e la pull con sia `docker` che `nerdctl` (containerd).

Un registry locale è già stato avviato su `localhost:5000`.

---

## Task 1 — Push di un'Immagine nel Registry Privato

Tagga un'immagine esistente con il prefisso del registry locale e fai push:

```bash
# Pull un'immagine pubblica da usare come base
docker pull nginx:alpine

# Tagga per il registry locale
docker tag nginx:alpine localhost:5000/myapp:v1

# Push al registry locale
docker push localhost:5000/myapp:v1

# Verifica che sia nel catalog
curl -s http://localhost:5000/v2/_catalog
curl -s http://localhost:5000/v2/myapp/tags/list
```

::simple-task
---
:tasks: tasks
:name: verify_image_pushed
---
#active
In attesa di `localhost:5000/myapp:v1` nel registry locale...

#completed
L'immagine è stata pubblicata nel registry privato.
::

---

## Task 2 — Pull con nerdctl (containerd)

`nerdctl` è il CLI per containerd, compatibile con la sintassi Docker.
Per registry insicuri (HTTP), bisogna configurare `--insecure-registry`:

```bash
# Pull con nerdctl (usa containerd direttamente)
nerdctl pull --insecure-registry localhost:5000/myapp:v1

# Verifica le immagini in containerd
nerdctl image ls
```

::simple-task
---
:tasks: tasks
:name: verify_pulled_via_nerdctl
---
#active
In attesa che `localhost:5000/myapp:v1` sia presente nelle immagini containerd...

#completed
Ottimo! L'immagine è stata scaricata tramite containerd con nerdctl.
::

::hint-box
---
:summary: Differenza: Docker vs nerdctl vs crictl
---

| Tool | Runtime | Uso principale |
|------|---------|---------------|
| `docker` | dockerd | Sviluppo locale, build |
| `nerdctl` | containerd | Produzione, compatibile Docker CLI |
| `crictl` | CRI (containerd/CRI-O) | Debug Kubernetes, nessun build |

In Kubernetes, `crictl` è il tool standard per ispezionare container sul nodo,
ma non supporta build né push. `nerdctl` è più completo per sviluppo.
::

---

## Bonus — Configurare containerd come Mirror

Per usare il registry privato come mirror di Docker Hub,
aggiungi questa configurazione a `/etc/containerd/config.toml`:

```toml
[plugins."io.containerd.grpc.v1.cri".registry.mirrors]
  [plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]
    endpoint = ["http://localhost:5000", "https://registry-1.docker.io"]
```

Dopo `systemctl restart containerd`, le pull di immagini Docker Hub
cercheranno prima nel registry locale.
