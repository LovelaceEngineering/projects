---
kind: lesson

title: Immagini Come Professionisti

description: |
  Dockerfile avanzato (multi-stage, distroless, utente non-root), OCI Image Spec e registry,
  containerd vs Docker daemon e CRI. Operare con ctr, nerdctl e crictl.

name: image-building
slug: incontro-2

createdAt: 2026-02-23
updatedAt: 2026-02-23

playground:
  name: docker
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Costruire immagini Docker ottimizzate con multi-stage build e utenti non-root
- Spiegare l'OCI Image Specification e come funziona un registry
- Distinguere containerd, Docker daemon e CRI — e sapere quando usare ognuno
- Operare con `ctr`, `nerdctl` e `crictl` per gestire immagini e container

## Teoria (50 min)

### Dockerfile Avanzato

Un Dockerfile naif produce immagini grandi, lente e insicure. I pattern professionali:

**Multi-stage build:** Separa l'ambiente di build da quello di runtime.
Il binario compilato viene copiato in un'immagine base minimale (distroless o scratch).

```dockerfile
# Stage 1: build
FROM golang:1.22 AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o myapp .

# Stage 2: runtime
FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/myapp /myapp
USER nonroot
ENTRYPOINT ["/myapp"]
```

**Layer caching:** Le istruzioni `COPY` e `RUN` invalidano la cache da quel punto in poi.
Copiare prima i file che cambiano meno (es. `go.mod`) e poi il sorgente.

**Utente non-root:** Mai eseguire processi come UID 0 in un container.
Usare `USER 65534` (nobody) o creare un utente dedicato con `adduser`.

### OCI Image Spec e Registry

L'OCI Image Specification definisce il formato di un'immagine container:
- Un **manifest** JSON che elenca i layer
- Ogni layer è un tar.gz identificato da digest SHA-256
- Un registry è una semplice API HTTP(S) con autenticazione opzionale

### containerd, Docker Daemon e CRI

```
kubectl → CRI → containerd → runc → container
         (gRPC)
docker  → Docker daemon → containerd → runc → container
nerdctl → containerd → runc → container
```

- **Docker daemon** aggiunge funzionalità (networks, volumes, Swarm) su containerd
- **containerd** è il runtime standard Kubernetes (via CRI plugin)
- **nerdctl** è un CLI Docker-compatibile per containerd senza daemon layer

## Hands-on Guidato (90 min)

### Esercizio 1 — Da 1GB a meno di 20MB

Dato un'applicazione Java/Go con Dockerfile naif, ottimizzarla con:
1. Multi-stage build
2. Base image distroless
3. Utente non-root
4. Rimozione di secrets hardcodati (usare build args)

```bash
# Build e confronto dimensioni
docker build -t app:naive -f Dockerfile.naive .
docker build -t app:optimized -f Dockerfile.optimized .
docker images | grep app
```

### Esercizio 2 — Registry Privato Locale

```bash
# Avvia il registry
docker run -d -p 5000:5000 --name registry registry:2

# Push dell'immagine
docker tag app:optimized localhost:5000/app:v1
docker push localhost:5000/app:v1

# Configura containerd mirror
cat /etc/containerd/config.toml
# Aggiungi mirror entry per localhost:5000
```

### Esercizio 3 — `ctr` vs `nerdctl` vs `crictl`

La stessa operazione (pull, list, inspect) con tre CLI diverse:

```bash
# Docker CLI
docker pull nginx:alpine
docker images nginx

# nerdctl (Docker-compatible)
nerdctl pull nginx:alpine
nerdctl images nginx

# ctr (containerd low-level)
ctr images pull docker.io/library/nginx:alpine
ctr images list

# crictl (CRI-focused, come lo vede Kubernetes)
crictl pull nginx:alpine
crictl images
```

## Capstone Challenge (30 min)

> **"Il Dockerfile del Disastro"**
>
> Viene fornito un Dockerfile Java (o Go) con 4 problemi:
> 1. Immagine finale 900MB+ (JDK invece di JRE, artifacts di build inclusi)
> 2. Processo che gira come root
> 3. Build artifacts esposti nel layer finale
> 4. Database password hardcodata nel Dockerfile
>
> Riscrivere il Dockerfile risolvendo tutti e 4 i problemi.
> Target: immagine < 50MB, utente non-root, zero secrets.

## Self-Study Assignment

Completa questi materiali su iximiuz Labs prima del prossimo incontro (60–90 min totali):

::card
---
:content: tutorials.containers_vs_pods
---
::

Completa anche lo **Skill Path "Build Container Images Like a Pro"** disponibile su iximiuz Labs
(cerca "build container images" nella sezione Skill Paths della piattaforma).
