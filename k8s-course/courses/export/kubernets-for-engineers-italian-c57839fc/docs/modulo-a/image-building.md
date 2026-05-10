# Immagini Come Professionisti

> **Playground per questo incontro:** usa il playground Docker su iximiuz Labs per seguire
> tutti gli esempi in modo interattivo:
> **https://labs.iximiuz.com/playgrounds/docker**
> — o il playground nerdctl per la parte containerd:
> **https://labs.iximiuz.com/playgrounds/nerdctl**

---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Costruire immagini Docker ottimizzate con multi-stage build, distroless e utente non-root
- Spiegare la struttura interna di un'immagine OCI: manifest, layers, config
- Interagire con un registry privato via API REST e Docker CLI
- Distinguere Docker daemon, containerd e CRI — e usare `ctr`, `nerdctl`, `crictl`
- Debuggare immagini rotte identificando dipendenze mancanti e problemi di layer

---

## Teoria (50 min)

### Anatomia di un'Immagine Container

Prima di scrivere un Dockerfile, bisogna capire cosa c'è dentro un'immagine.

Un'immagine container è un **insieme ordinato di layer** immutabili più un file di configurazione.
Quando il container runtime crea un container, monta i layer in sola lettura via OverlayFS
e aggiunge un layer scrivibile sopra.

```
docker inspect ubuntu:22.04 --format '{{json .RootFS}}' | jq
{
  "Type": "layers",
  "Layers": [
    "sha256:a1360aae5271...",   ← layer 1: base filesystem
    "sha256:e8c5906f8bde...",   ← layer 2: apt cache/index
    "sha256:3dbab57537...",     ← layer 3: package installs
  ]
}
```

Ogni layer è un **tar.gz delta** che aggiunge, modifica o cancella file rispetto al layer precedente.
I file cancellati vengono rappresentati con **whiteout files** (`.wh.filename`).

### OCI Image Specification

L'[OCI Image Specification](https://github.com/opencontainers/image-spec) standardizza il formato
delle immagini in modo che strumenti diversi (Docker, Podman, containerd, Buildah) possano
usare le stesse immagini.

Una immagine OCI è composta da tre artefatti:

```
Image Reference
└── OCI Image Index (manifest list, opzionale — per multi-arch)
    └── OCI Image Manifest
        ├── Image Config  (JSON con Env, Cmd, Entrypoint, WorkDir, Labels...)
        └── Layers[]      (tar.gz, identificati da SHA-256 digest)
```

**Image Manifest** — il file JSON principale:

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "config": {
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "size": 7023,
    "digest": "sha256:b5b2b2c507..."
  },
  "layers": [
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "size": 32654,
      "digest": "sha256:9834876dcc..."
    },
    {
      "mediaType": "application/vnd.oci.image.layer.v1.tar+gzip",
      "size": 16724,
      "digest": "sha256:3c3a4604a5..."
    }
  ]
}
```

Esplorare un'immagine OCI direttamente:

```bash
# Salva l'immagine come tar e ispeziona la struttura OCI
docker save nginx:alpine -o nginx.tar
mkdir nginx-contents && tar xf nginx.tar -C nginx-contents
ls nginx-contents/
# index.json  manifest.json  blobs/  oci-layout

cat nginx-contents/index.json | jq
# → manifest digest SHA-256

# Leggi il manifest
cat nginx-contents/blobs/sha256/<digest-del-manifest> | jq

# Leggi il config (env, cmd, history)
cat nginx-contents/blobs/sha256/<digest-del-config> | jq '.config'
```

### Come Funziona un Registry

Un registry è una semplice **API HTTP(S) RESTful** definita dalla [OCI Distribution Spec](https://github.com/opencontainers/distribution-spec).

```
# Flusso di un docker pull nginx:alpine

1. GET /v2/                                  # ping, verifica autenticazione
2. GET /v2/library/nginx/manifests/alpine    # scarica il manifest
3. GET /v2/library/nginx/blobs/<digest>      # scarica ogni layer (parallel)
4. GET /v2/library/nginx/blobs/<config-digest>  # scarica il config
```

Puoi interagire con il registry direttamente via curl:

```bash
# Ottieni il token per Docker Hub
TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/nginx:pull" \
  | jq -r .token)

# Scarica il manifest di nginx:alpine
curl -H "Authorization: Bearer $TOKEN" \
     -H "Accept: application/vnd.oci.image.manifest.v1+json" \
     https://registry-1.docker.io/v2/library/nginx/manifests/alpine | jq

# Avvia un registry locale (senza autenticazione)
docker run -d -p 5000:5000 --name registry registry:2

# Push di un'immagine al registry locale
docker tag nginx:alpine localhost:5000/nginx:alpine
docker push localhost:5000/nginx:alpine

# Verifica via API
curl http://localhost:5000/v2/_catalog | jq
curl http://localhost:5000/v2/nginx/tags/list | jq
```

---

### Dockerfile Professionale: Multi-Stage Builds

Un Dockerfile naif produce immagini grandi, lente da scaricare e con superficie d'attacco enorme.
Il pattern multi-stage separa l'ambiente di build da quello di runtime.

#### Il Problema

```dockerfile
# ❌ Dockerfile naif — include compilatore, sorgenti, cache nel layer finale
FROM golang:1.22
WORKDIR /app
COPY . .
RUN go build -o myapp .
# Dimensione finale: ~800MB (include tutto il toolchain Go)
```

#### La Soluzione: Multi-Stage

```dockerfile
# ✅ Dockerfile ottimizzato — solo il binario nel layer finale

# Stage 1: build environment
FROM golang:1.22 AS builder
WORKDIR /app

# PRIMA copia i file di dipendenze (cambiano raramente → cache stabile)
COPY go.mod go.sum ./
RUN go mod download

# POI copia i sorgenti (cambiano spesso → invalida cache da qui in poi)
COPY . .
# CGO_ENABLED=0  → disabilita l'interop C → binario staticamente linkato (no dipendenze libc)
# GOOS=linux     → target OS Linux, anche se si builda su macOS
# -trimpath      → rimuove i percorsi sorgente dal binario (build riproducibile, binario più piccolo)
# -ldflags="-w -s" → rimuove debug info e symbol table (~30% riduzione dimensione)
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o myapp .

# Stage 2: runtime environment minimale
FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/myapp /myapp
USER nonroot:nonroot
ENTRYPOINT ["/myapp"]
# Dimensione finale: ~5MB (solo il binario staticamente linkato)
```

**Confronto dimensioni:**

```bash
docker build -t myapp:naive -f Dockerfile.naive .
docker build -t myapp:optimized -f Dockerfile.optimized .
docker images | grep myapp
# myapp   naive      abc123   800MB
# myapp   optimized  def456   5.2MB
```

#### Layer Caching in Profondità

Docker riusa i layer già presenti in cache se l'istruzione e il suo input non sono cambiati.
L'invalidazione è **a cascata**: se un layer viene invalidato, tutti i layer successivi vengono ricostruiti.

```
Dockerfile          Quando si invalida la cache
──────────────     ──────────────────────────────
FROM golang:1.22    solo se l'immagine base cambia
COPY go.mod .       se go.mod o go.sum cambiano
RUN go mod download se il layer precedente è invalidato
COPY . .            ad ogni modifica del sorgente  ← spostare qui
RUN go build ...    ad ogni COPY . . invalido
```

**Regola d'oro:** istruzioni che cambiano raramente in alto, quelle che cambiano spesso in basso.

#### Il file `.dockerignore`

Senza un `.dockerignore`, Docker invia l'intero contenuto della directory al daemon come **build context** — inclusi `.git/`, `node_modules/`, file `.env` con segreti, e file di build pesanti. Questo rallenta la build e può includere accidentalmente dati sensibili nei layer.

```
# .dockerignore — pattern esclude dal build context
.git/
.gitignore
*.env
.env.*
node_modules/
dist/
coverage/
*.log
Dockerfile*
docker-compose*
README.md
```

> **Perché è importante:** anche se un file non viene `COPY`-ato nel layer finale, il suo contenuto viaggia sulla rete socket `/var/run/docker.sock`. File grandi nel build context rallentano ogni `docker build`, anche se l'istruzione `COPY` li esclude.

#### Il Problema dei Secrets nel Build

> **BuildKit** è il motore di build moderno di Docker (abilitato di default in Docker Desktop e Docker Engine 23+). La direttiva `# syntax=docker/dockerfile:1` in cima al Dockerfile attiva le funzionalità avanzate di BuildKit come `--mount=type=secret`, `--mount=type=cache` e build multi-platform. Senza BuildKit queste istruzioni vengono ignorate o causano un errore.

```dockerfile
# ❌ Il secret viene incluso nella storia del layer e non può essere rimosso!
RUN curl -H "Authorization: Bearer mysecret" https://api.example.com/pkg.tar.gz | tar xz
```

```dockerfile
# ✅ Usa BuildKit secrets — il file non entra mai nei layer
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=mytoken \
    curl -H "Authorization: Bearer $(cat /run/secrets/mytoken)" \
    https://api.example.com/pkg.tar.gz | tar xz

# Build con il secret
docker build --secret id=mytoken,src=./mytoken.txt .
```

---

### Base Images: scratch, distroless, Alpine, Ubuntu

Scegliere la base image giusta è una decisione di sicurezza, non solo di dimensione.

| Base Image | Dimensione | Shell | Package manager | Usata per |
|------------|------------|-------|-----------------|-----------|
| `scratch` | 0 byte | ✗ | ✗ | Binari statici (Go, Rust) senza nessuna dipendenza |
| `gcr.io/distroless/static` | ~2MB | ✗ | ✗ | Go, Rust statici |
| `gcr.io/distroless/base` | ~20MB | ✗ | ✗ | C/C++ dinamici, libc necessaria |
| `gcr.io/distroless/java17` | ~200MB | ✗ | ✗ | Java, solo JRE |
| `alpine:3.20` | ~7MB | ash | apk | Debug possibile, dipendenze musl |
| `debian:slim` | ~75MB | bash | apt | Compatibilità massima, glibc |
| `ubuntu:22.04` | ~77MB | bash | apt | Applicazioni legacy |

> **Alpine vs distroless — libc diversa:**
> Alpine usa **musl libc** (leggera, non 100% compatibile con glibc). Le immagini `gcr.io/distroless/base` e `distroless/java` usano **glibc** (Debian).
> Per binari Go compilati staticamente (`CGO_ENABLED=0`) entrambe funzionano — non ci sono dipendenze libc.
> Per applicazioni C/C++, Java con JNI nativo, o librerie crittografiche (es. alcune versioni di OpenSSL), usa un'immagine glibc-based (distroless o debian:slim) per evitare problemi di compatibilità silenziosi.

#### I 6 Errori di `FROM scratch`

Usare `FROM scratch` sembra l'opzione più sicura, ma presenta trappole nascoste:

1. **CA certificates mancanti** — HTTPS fallisce senza `/etc/ssl/certs/ca-certificates.crt`
2. **Directory di sistema assenti** — `/tmp`, `/var`, `/home` non esistono
3. **User/group files mancanti** — `/etc/passwd`, `/etc/group` assenti: `--user` non funziona
4. **Timezone data assente** — `/usr/share/zoneinfo/` mancante
5. **Shared libraries assenti** — binari dinamicamente linkati non partono senza `libc.so.6`
6. **Network config assente** — `/etc/nsswitch.conf` mancante: DNS resolution può fallire

**Soluzione:** per la maggior parte dei casi, usare `distroless` invece di `scratch` —
include CA certs, passwd/group, tzdata ma niente shell né package manager.

```dockerfile
# Aggiunta manuale di CA certs se si usa scratch
FROM alpine:3.20 AS certs
RUN apk add --no-cache ca-certificates

FROM scratch
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/myapp /myapp
ENTRYPOINT ["/myapp"]
```

---

### Utente Non-Root: Sicurezza Fondamentale

I container che girano come `root` (UID 0) sono pericolosi: se il processo viene compromesso,
l'attaccante ha accesso root al filesystem del container e, potenzialmente (con escape di namespace),
al nodo host.

```dockerfile
# ❌ Mai eseguire come root (default Dockerfile senza USER)
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y myapp
CMD ["myapp"]  # gira come root!

# ✅ Crea un utente dedicato
FROM debian:slim
RUN groupadd --gid 10001 appgroup && \
    useradd --uid 10001 --gid 10001 --no-create-home appuser
COPY myapp /usr/local/bin/myapp
USER 10001:10001
ENTRYPOINT ["myapp"]
```

```bash
# Verifica che il container non giri come root
docker run --rm myapp:secure id
# uid=10001(appuser) gid=10001(appgroup)

# Con distroless/nonroot, UID 65532 è predefinito
docker run --rm gcr.io/distroless/static:nonroot id
# uid=65532(nonroot) gid=65532(nonroot)
```

---

### containerd, Docker Daemon e CRI: Architettura Completa

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER SPACE                              │
│                                                                 │
│  kubectl  ──────────────────────────────────────► kube-apiserver│
│                                                        │        │
│  docker ──► Docker Daemon ──────────────────────────► │        │
│                                │                       │        │
│  nerdctl ───────────────────── ▼                       │        │
│                         containerd ◄────────── kubelet │        │
│                              │  (CRI gRPC plugin)      │        │
│  ctr ───────────────────► containerd API               │        │
│                              │                         │        │
│  crictl ─────────────────────┘ (via CRI socket)        │        │
│                              │                         │        │
│                           runc/kata/gvisor             │        │
│                              │                         │        │
│                         Container Processes            │        │
└──────────────────────────────────────────────────────────── ───┘
```

**Cosa fa ogni componente:**

| Tool | Parla con | Scopo principale |
|------|-----------|------------------|
| `docker` CLI | Docker daemon | Developer experience completa (network, volume, compose) |
| `dockerd` | containerd | Aggiunge API Docker su containerd |
| `containerd` | runc/shim | Image management, container lifecycle, snapshotter |
| `ctr` | containerd API | Debug/admin di containerd a basso livello |
| `nerdctl` | containerd | Alternativa Docker-compatible senza daemon Docker |
| `crictl` | CRI socket (`/run/containerd/containerd.sock`) | Debug di container Kubernetes |
| `runc` | Linux kernel | Esegue il container (namespaces, cgroups, pivot_root) |

**Namespace separati — store di immagini distinti:**

containerd usa i **namespace** per separare le immagini dei vari client. Ogni tool vede solo le immagini nel proprio namespace:

| Tool | Namespace containerd | Vede le immagini Docker? |
|------|---------------------|--------------------------|
| `docker` | `moby` | sì (il proprio store) |
| `nerdctl` | `default` | no |
| `crictl` | `k8s.io` | no (solo le immagini K8s) |

> **Implicazione pratica:** se fai `docker pull nginx` sull'host, un `ctr images list` nel namespace `default` restituisce lista vuota. Se vuoi vedere le immagini Docker con `ctr`, usa `ctr --namespace moby images list`.

**Perché containerd è il runtime default di Kubernetes:**

- Kubernetes deprecò `dockershim` (il layer di compatibilità Docker-CRI) in K8s 1.20
  e lo rimossero in 1.24
- `containerd` implementa direttamente il **CRI (Container Runtime Interface)** via gRPC
- Più leggero di Docker: niente daemon con socket Unix aggiuntivo, meno processi
- Supporta **snapshotter** pluggabili: overlayfs (default), devmapper, zfs, btrfs

---

### `ctr`, `nerdctl`, `crictl`: Uso Pratico

#### `ctr` — containerd basso livello

`ctr` è il CLI ufficiale di containerd. Verboso ma utile per capire l'architettura interna.

```bash
# Namespace containerd: docker usa "moby", k8s usa "k8s.io"
ctr namespaces list

# Pull di un'immagine (nel namespace default)
ctr images pull docker.io/library/nginx:alpine

# Lista immagini
ctr images list

# Monta un'immagine per ispezionare il filesystem
mkdir /tmp/nginx-fs
ctr images mount docker.io/library/nginx:alpine /tmp/nginx-fs
ls /tmp/nginx-fs
ctr images unmount /tmp/nginx-fs

# Esporta come OCI tarball
ctr images export nginx.tar docker.io/library/nginx:alpine
```

#### `nerdctl` — Docker-compatible per containerd

`nerdctl` ha la stessa interfaccia di `docker` ma parla direttamente con containerd.

```bash
# Identico a docker pull / run / build
nerdctl pull nginx:alpine
nerdctl run -d -p 8080:80 --name webserver nginx:alpine
nerdctl ps
nerdctl logs webserver
nerdctl exec -it webserver sh
nerdctl stop webserver && nerdctl rm webserver

# Build (usa BuildKit integrato)
nerdctl build -t myapp:v1 .

# Push a registry locale
nerdctl tag myapp:v1 localhost:5000/myapp:v1
nerdctl push localhost:5000/myapp:v1 --insecure-registry

# Compose (nerdctl supporta docker-compose.yaml)
nerdctl compose up -d
```

#### `crictl` — CRI tools per Kubernetes

`crictl` comunica con il CRI socket e mostra cosa Kubernetes "vede" realmente.

```bash
# Configura il socket (su nodo Kubernetes)
cat > /etc/crictl.yaml <<EOF
runtime-endpoint: unix:///run/containerd/containerd.sock
image-endpoint: unix:///run/containerd/containerd.sock
EOF

# Lista container (come li vede kubelet, non Docker)
crictl ps

# Lista immagini nel namespace k8s.io
crictl images

# Pull di un'immagine nel namespace k8s.io
crictl pull nginx:alpine

# Inspect di un container in esecuzione
crictl inspect <container-id>

# Logs di un container Kubernetes
crictl logs <container-id>

# Stat delle risorse (CPU/RAM) di ogni container
crictl stats
```

---

## Hands-on Guidato (90 min)

### Esercizio 1 — Ottimizzazione Immagine Go: da 800MB a 5MB

Partiamo da un'applicazione Go con HTTP server e la ottimizziamo in 4 passi.

```dockerfile
# server.go (applicazione di esempio)
# package main
# import (
#   "fmt"
#   "net/http"
# )
# func main() {
#   http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
#     fmt.Fprintln(w, "Hello from container!")
#   })
#   http.ListenAndServe(":8080", nil)
# }
```

**Passo 1 — Dockerfile naif:**
```dockerfile
FROM golang:1.22
WORKDIR /app
COPY . .
RUN go build -o server .
EXPOSE 8080
CMD ["./server"]
```

```bash
docker build -t server:v1-naive .
docker images server:v1-naive  # ~850MB
```

**Passo 2 — Multi-stage:**
```dockerfile
FROM golang:1.22 AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM debian:bookworm-slim
COPY --from=builder /app/server /server
CMD ["/server"]
```

```bash
docker build -t server:v2-multistage .
docker images server:v2-multistage  # ~75MB
```

**Passo 3 — distroless:**
```dockerfile
FROM golang:1.22 AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o server .

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]
```

```bash
docker build -t server:v3-distroless .
docker images server:v3-distroless  # ~5MB

# Verifica che non ci sia shell
docker run --rm -it server:v3-distroless sh  # → exec failed: no such file
```

**Passo 4 — Layer cache ottimizzata (aggiungere go.mod):**
```bash
# Modifica server.go e rebuilda — nota quanto è veloce la cache
touch server.go
time docker build -t server:v3-distroless .
```

### Esercizio 2 — Registry Locale e OCI Inspection

```bash
# Avvia registry locale
docker run -d -p 5000:5000 --name registry \
  -v /tmp/registry-data:/var/lib/registry \
  registry:2

# Push di più versioni
docker tag server:v3-distroless localhost:5000/server:v1
docker push localhost:5000/server:v1

# Esplora via API REST (OCI Distribution Spec)
# Lista repository
curl http://localhost:5000/v2/_catalog | jq
# → {"repositories":["server"]}

# Lista tags
curl http://localhost:5000/v2/server/tags/list | jq

# Scarica il manifest
curl -H "Accept: application/vnd.oci.image.manifest.v1+json" \
     http://localhost:5000/v2/server/manifests/v1 | jq

# Calcola la dimensione totale dell'immagine
curl -s -H "Accept: application/vnd.oci.image.manifest.v1+json" \
     http://localhost:5000/v2/server/manifests/v1 | \
  jq '[.layers[].size] | add'

# Ispeziona un layer (scaricalo come tar.gz e vedi i file)
DIGEST=$(curl -s -H "Accept: application/vnd.oci.image.manifest.v1+json" \
         http://localhost:5000/v2/server/manifests/v1 | jq -r '.layers[0].digest')
curl -s http://localhost:5000/v2/server/blobs/$DIGEST | tar tz | head -20
```

### Esercizio 3 — `ctr` vs `nerdctl` vs `crictl`

La stessa operazione con tre CLI diverse per capire la prospettiva di ognuna:

```bash
# ── DOCKER (su Docker Desktop o Docker Engine) ──────────────────────────────
docker pull nginx:alpine
docker images nginx
docker inspect nginx:alpine | jq '.[0].RootFS.Layers | length'

# ── NERDCTL (containerd diretto) ──────────────────────────────────────────
# Namespace di default (non "moby" come docker)
nerdctl --namespace default pull nginx:alpine
nerdctl --namespace default images

# Build con nerdctl (usa BuildKit)
nerdctl build -t myapp:test .

# ── CTR (containerd low-level) ─────────────────────────────────────────────
ctr --namespace default images pull docker.io/library/nginx:alpine
ctr --namespace default images list | grep nginx

# Monta e ispeziona
mkdir /tmp/nginx-mnt
ctr --namespace default images mount docker.io/library/nginx:alpine /tmp/nginx-mnt
ls /tmp/nginx-mnt/etc/nginx/
ctr --namespace default images unmount /tmp/nginx-mnt

# ── CRICTL (vista Kubernetes sul CRI socket) ─────────────────────────────────
# Su un nodo Kubernetes:
crictl --runtime-endpoint unix:///run/containerd/containerd.sock images
crictl pull nginx:alpine
crictl images | grep nginx

# Nota: crictl vede solo immagini nel namespace "k8s.io"
# docker/nerdctl vede namespace "moby"/"default"
# → sono store separati!
```

### Esercizio 4 — Dockerfile del Disastro → Dockerfile Professionale

Dato un Dockerfile problematico (Java), riscriverlo completamente:

```dockerfile
# ❌ PRIMA: Dockerfile disastroso
FROM maven:3.9-openjdk-17        # JDK intero (400MB) nel layer finale
WORKDIR /app
COPY . .
RUN mvn clean package            # artifact di build inclusi
ENV DB_PASSWORD=supersecret123   # ❌ secret hardcodato in chiaro!
CMD ["java", "-jar", "target/app.jar"]
# Corre come root, dimensione ~600MB
```

```dockerfile
# ✅ DOPO: Dockerfile professionale
# syntax=docker/dockerfile:1

# Stage 1: dipendenze Maven (cache separata)
FROM maven:3.9-eclipse-temurin-17 AS deps
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Stage 2: build
FROM deps AS builder
COPY src/ ./src/
RUN mvn clean package -DskipTests -B

# Stage 3: runtime minimale
FROM eclipse-temurin:17-jre-alpine
RUN addgroup -g 10001 appgroup && \
    adduser -u 10001 -G appgroup -H -D appuser && \
    mkdir /app && chown appuser:appgroup /app
WORKDIR /app
COPY --from=builder /app/target/app.jar app.jar
USER 10001:10001
ENTRYPOINT ["java", "-jar", "app.jar"]
# DB_PASSWORD inviata via Secret Kubernetes, non nel Dockerfile!
# Dimensione: ~180MB (solo JRE Alpine, niente Maven, niente sorgenti)
```

```bash
# Dimensioni a confronto
docker build -t app:disaster -f Dockerfile.disaster .
docker build -t app:professional -f Dockerfile.professional .
docker images | grep app

# Verifica non-root
docker run --rm app:professional id
# uid=10001(appuser) gid=10001(appgroup)

# Verifica no shell in distroless (se hai usato distroless/java)
docker run --rm -it app:professional sh  # → no such file
```

### Esercizio 5 — Confronto Namespace containerd

```bash
# Visualizza tutti i namespace di containerd
ctr namespaces list
# NAME    LABELS
# default        ← nerdctl/ctr default
# moby           ← docker engine
# k8s.io         ← kubelet/crictl

# Ogni namespace ha il suo store di immagini separato
ctr --namespace moby images list | head    # immagini Docker
ctr --namespace k8s.io images list | head  # immagini Kubernetes
ctr --namespace default images list | head # immagini nerdctl/ctr

# Copia un'immagine tra namespace
ctr --namespace moby images export img.tar nginx:alpine
ctr --namespace k8s.io images import img.tar
```

---

## Capstone Challenge (30 min)

> **"Il Dockerfile del Disastro"**
>
> Viene fornito un Dockerfile Node.js con i seguenti problemi:
>
> 1. **Immagine finale 1.2GB+**: usa `node:18` (include npm, yarn, Python, gcc) anche in produzione
> 2. **Corre come root**: nessun `USER`
> 3. **Build artifacts inclusi**: `node_modules` di sviluppo (devDependencies) nel layer finale
> 4. **Secret hardcodato**: `ENV API_KEY=sk-prod-abc123` nel Dockerfile
> 5. **Cache invalidata ad ogni push**: `COPY . .` prima di `npm install`
>
> **Obiettivo:**
> - Immagine finale < 100MB
> - Utente non-root (UID 1001)
> - Solo `node_modules` di produzione (`--omit=dev`)
> - Nessun secret nel Dockerfile (usare `--build-arg` o runtime env)
> - Cache ottimizzata: `COPY package*.json` prima di `npm ci`
>
> **Verifica:**
> ```bash
> docker build -t nodeapp:challenge .
> docker run --rm nodeapp:challenge id       # uid=1001
> docker images nodeapp:challenge            # < 100MB
> docker history nodeapp:challenge           # no API_KEY nella history!
> docker run --rm nodeapp:challenge env | grep API_KEY  # vuoto
> ```

---

## Riepilogo Concetti Chiave

| Concetto | Cosa sapere |
|----------|-------------|
| **OCI Image** | manifest + config + layers (tar.gz SHA-256) |
| **Layer cache** | Invalida a cascata: metti `COPY sorgenti` il più in basso possibile |
| **Multi-stage** | Stage di build separato da stage di runtime con `COPY --from=` |
| **distroless** | Niente shell, niente package manager: superficie d'attacco minima |
| **Non-root** | `USER 10001` nel Dockerfile; `runAsNonRoot: true` in Kubernetes |
| **BuildKit secrets** | `--mount=type=secret` per secrets non inclusi nei layer |
| **containerd** | Runtime di Kubernetes; ctr/nerdctl/crictl per gestirlo |
| **Registry API** | OCI Distribution Spec: `/v2/_catalog`, `/v2/<name>/manifests/<ref>` |

---

## Self-Study Assignment

Completa questi tutorial su iximiuz Labs prima del prossimo incontro (60–90 min totali):

!!! tip "Lab iximiuz"
    Completa il tutorial: **Docker Multi Stage Builds**


!!! tip "Lab iximiuz"
    Completa il tutorial: **Pitfalls Of From Scratch Images**


!!! tip "Lab iximiuz"
    Completa il tutorial: **Containerd Cli**


Completa anche il **Skill Path "Build Container Images Like a Pro"**:
- https://labs.iximiuz.com/skill-paths/build-container-images

**Letture consigliate:**
- [OCI Image Spec — opencontainers/image-spec](https://github.com/opencontainers/image-spec)
- [OCI Distribution Spec — API del registry](https://github.com/opencontainers/distribution-spec)
- [Distroless images — GoogleContainerTools](https://github.com/GoogleContainerTools/distroless)
- [BuildKit secrets documentation](https://docs.docker.com/build/building/secrets/)

---

## Risorse Aggiuntive

### Specifiche e Standard Ufficiali
- [OCI Image Specification](https://github.com/opencontainers/image-spec) — spec completa del formato immagine OCI: manifest, config, layers, image index (multi-platform)
- [OCI Distribution Specification](https://github.com/opencontainers/distribution-spec) — API REST dei registry: push/pull, chunked upload, referrers API per attestazioni
- [Docker Official Docs — Build](https://docs.docker.com/build/) — BuildKit, Dockerfile reference, build cache, secrets, multi-platform builds
- [Docker Official Docs — Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/) — guida ufficiale: layer ordering, COPY vs ADD, multi-stage, .dockerignore

### Blog e Articoli Tecnici
- [Ivan Velichko — OCI Image and Runtime Specs (iximiuz.com)](https://iximiuz.com/en/posts/oci-image-and-runtime-specs/) — esplorazione delle spec OCI con comandi pratici e visualizzazioni
- [Ivan Velichko — Exploring Container Image Layers (iximiuz.com)](https://iximiuz.com/en/posts/container-layers/) — come funzionano i layer, union filesystem, copy-on-write
- [Martin Heinz — Every Container User Should Know About Distroless](https://martinheinz.dev/blog/38) — vantaggi, trade-off e debugging delle immagini distroless
- [Martin Heinz — Building Docker Images The Proper Way](https://martinheinz.dev/blog/42) — ottimizzazione del build process: cache, multi-stage, layer ordering
- [Chainguard Academy — Secure Container Images](https://edu.chainguard.dev/) — corso gratuito su immagini sicure, SBOM, firme digitali, zero-CVE images

### Sicurezza delle Immagini e Supply Chain
- [Trivy — Aqua Security](https://trivy.dev/) — scanner open source per vulnerabilità in immagini, filesystem, git repo, Kubernetes
- [Grype — Anchore](https://github.com/anchore/grype) — vulnerability scanner per immagini container e SBOM
- [Syft — Anchore](https://github.com/anchore/syft) — genera Software Bill of Materials (SBOM) da immagini container in formato SPDX, CycloneDX
- [Cosign — Sigstore](https://docs.sigstore.dev/cosign/overview/) — firma e verifica delle immagini container con chiavi keyless e Rekor transparency log
- [SLSA Framework](https://slsa.dev/) — Supply chain Levels for Software Artifacts: framework per la sicurezza della supply chain software
- [Docker Scout](https://docs.docker.com/scout/) — analisi delle vulnerabilità e policy integrata in Docker Desktop e Docker Hub

### Strumenti e Repository
- [moby/buildkit](https://github.com/moby/buildkit) — il backend di build di Docker: cache distribuita, multi-platform, secrets, SSH forwarding
- [GoogleContainerTools/distroless](https://github.com/GoogleContainerTools/distroless) — immagini distroless ufficiali di Google: static, base, cc, java, python, nodejs
- [chainguard-images](https://github.com/chainguard-images) — immagini minimali con CVE count zero, aggiornate quotidianamente, firmate con cosign
- [containerd](https://containerd.io/) — il runtime container di riferimento usato da Kubernetes, Docker, minikube, k3s
- [nerdctl](https://github.com/containerd/nerdctl) — Docker-compatible CLI per containerd con supporto BuildKit nativo e Compose

### Formati Alternativi di Build
- [Buildpacks.io — Cloud Native Buildpacks](https://buildpacks.io/) — costruisci immagini senza Dockerfile: rilevamento automatico del linguaggio, patch automatiche
- [ko — Build Go containers](https://ko.build/) — build di immagini Go senza Dockerfile, push diretto al registry, integrazione nativa con K8s
- [Jib — Google](https://github.com/GoogleContainerTools/jib) — build di immagini Java senza Docker daemon, plugin Maven/Gradle
- [Kaniko — Google](https://github.com/GoogleContainerTools/kaniko) — build di immagini Dockerfile all'interno di un container K8s, senza privilegi Docker
