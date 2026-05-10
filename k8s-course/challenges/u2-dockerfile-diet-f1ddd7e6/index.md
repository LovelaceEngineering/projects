---
kind: challenge

title: "Dockerfile Diet: Da 800MB a sotto 20MB"

description: |
  Ottimizza un Dockerfile Java/Go naif che produce un'immagine da ~800MB.
  Risolvi 4 problemi: peso eccessivo, processo root, build artifacts nell'immagine,
  e secret hardcodata. L'immagine finale deve stare sotto 20MB e girare senza root.

categories:
- containers

tags:
- dockerfile
- multi-stage
- distroless
- image-optimization

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: docker

tasks:
  init_bad_dockerfile:
    init: true
    run: |
      mkdir -p /opt/challenge/app
      printf 'package main\n\nimport (\n    "fmt"\n    "net/http"\n)\n\nconst DB_PASSWORD = "supersecret123"\n\nfunc main() {\n    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {\n        fmt.Fprintf(w, "Hello from Go app!\\n")\n    })\n    http.ListenAndServe(":8080", nil)\n}\n' > /opt/challenge/app/main.go
      printf 'FROM golang:1.21\nWORKDIR /app\nCOPY app/ .\nRUN go build -o server main.go\nENV DB_PASSWORD=supersecret123\nEXPOSE 8080\nCMD ["./server"]\n' > /opt/challenge/Dockerfile.bad
      echo "Bad Dockerfile ready at /opt/challenge/Dockerfile.bad"

  verify_small_image:
    run: |
      # Check that 'app-optimized:latest' image exists and is < 30MB
      docker image inspect app-optimized:latest >/dev/null 2>&1 || exit 1
      SIZE=$(docker image inspect app-optimized:latest \
             --format='{{.Size}}' 2>/dev/null || echo 999999999)
      [ "$SIZE" -lt 30000000 ] || exit 1

  verify_non_root:
    run: |
      # Check the image doesn't run as root (UID 0)
      USER=$(docker run --rm --entrypoint '' app-optimized:latest id -u 2>/dev/null || echo 0)
      [ "$USER" != "0" ] || exit 1

  verify_no_secret:
    run: |
      # Check DB_PASSWORD is not baked into the image
      docker save app-optimized:latest | tar x -O --wildcards '*.tar' 2>/dev/null \
        | tar t 2>/dev/null | head -20 > /dev/null
      # Check env vars don't contain the secret
      ENV_VARS=$(docker inspect app-optimized:latest --format='{{.Config.Env}}' 2>/dev/null || echo "")
      echo "$ENV_VARS" | grep -q "supersecret" && exit 1
      # Check history doesn't contain secret in RUN commands (simplified check)
      docker history --no-trunc app-optimized:latest 2>/dev/null | grep -q "supersecret" && exit 1
      exit 0
---

_Un Dockerfile con 4 problemi classici da correggere: peso, root, artifact, secret._

---

## Scenario

Il tuo collega ha scritto il seguente `Dockerfile.bad` per un microservizio Go.
L'immagine risultante pesa ~800MB, gira come root, include il compilatore Go,
e ha la password del database hardcodata come variabile d'ambiente.

```dockerfile
FROM golang:1.21
WORKDIR /app
COPY app/ .
RUN go build -o server main.go
ENV DB_PASSWORD=supersecret123
EXPOSE 8080
CMD ["./server"]
```

Il codice sorgente è in `/opt/challenge/app/main.go`.

**Il tuo obiettivo:** Costruire `app-optimized:latest` che risolve tutti e 4 i problemi.

---

## Problema 1 — Peso Eccessivo (~800MB → < 30MB)

Usa un **multi-stage build**: compila in un'immagine builder, poi copia solo il binario
in un'immagine minimale (`scratch` o `gcr.io/distroless/static`):

```dockerfile
# Stage 1: Build
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY app/ .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o server main.go

# Stage 2: Runtime minimale
FROM scratch
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]
```

::simple-task
---
:tasks: tasks
:name: verify_small_image
---
#active
In attesa dell'immagine `app-optimized:latest` con dimensione < 30MB...

#completed
Ottimo! L'immagine pesa meno di 30MB.
::

---

## Problema 2 — Processo Root

Con `scratch` o `distroless`, aggiungi un utente non-root.
Con `distroless/static:nonroot` l'utente non-root è già incluso:

```dockerfile
FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/server /server
USER nonroot:nonroot
EXPOSE 8080
CMD ["/server"]
```

::simple-task
---
:tasks: tasks
:name: verify_non_root
---
#active
In attesa che `app-optimized:latest` giri come utente non-root (UID ≠ 0)...

#completed
Perfetto! Il container non gira più come root.
::

---

## Problema 3 & 4 — Build Artifacts e Secret

Con il multi-stage build, i build artifacts (compilatore, sorgenti) non finiscono nell'immagine finale.
Per il secret, **mai** usare `ENV` per valori sensibili — usare runtime injection:

```dockerfile
# SBAGLIATO: il secret è nell'immagine e nella history
ENV DB_PASSWORD=supersecret123

# CORRETTO: iniettato a runtime
# docker run -e DB_PASSWORD=$DB_PASSWORD app-optimized:latest
```

::simple-task
---
:tasks: tasks
:name: verify_no_secret
---
#active
In attesa che `app-optimized:latest` non contenga `supersecret` né nell'env né nella history...

#completed
Eccellente! Nessun secret hardcodato nell'immagine.
::

---

## Soluzione Completa

Crea `/opt/challenge/Dockerfile.optimized` e costruisci l'immagine:

```bash
cat > /opt/challenge/Dockerfile.optimized << 'EOF'
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY app/ .
RUN CGO_ENABLED=0 GOOS=linux go build -a -o server main.go

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/server /server
USER nonroot:nonroot
EXPOSE 8080
CMD ["/server"]
EOF

cd /opt/challenge && docker build -f Dockerfile.optimized -t app-optimized:latest .
docker image ls app-optimized:latest
```
