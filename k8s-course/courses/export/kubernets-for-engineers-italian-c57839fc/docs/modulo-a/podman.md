
## Obiettivi

Al termine di questa lezione sarai in grado di:

- Capire le differenze tra Podman e Docker
- Eseguire container con Podman
- Utilizzare podman-compose e podman-pod


## Cos'è Podman?

Podman è un'alternativa a Docker che non richiede un daemon in esecuzione. Ogni container è un processo figlio diretto del comando `podman`, il che lo rende più sicuro e compatibile con `systemd`.

Differenze chiave:
- **Senza daemon**: nessun processo centralizzato sempre in esecuzione
- **Rootless per default**: può eseguire container senza privilegi di root
- **Compatibile con Docker**: stessa sintassi dei comandi (`podman run` = `docker run`)
- **Supporto nativo ai Pod**: il concetto di Pod (più container che condividono risorse) è integrato


## Eseguire un Container con Podman

```bash
podman run --rm -it ubi bash
```

L'immagine `ubi` è un'immagine minimale basata su [Red Hat Universal Base Image](https://catalog.redhat.com/software/containers/ubi8/ubi/) — liberamente redistribuibile e supportata da Red Hat.

- `--rm` rimuove il container al termine dell'esecuzione
- `-it` esegue il container in modalità interattiva con un pseudo-TTY


## Comandi Equivalenti Docker ↔ Podman

| Docker | Podman |
|--------|--------|
| `docker run` | `podman run` |
| `docker build` | `podman build` |
| `docker images` | `podman images` |
| `docker ps` | `podman ps` |
| `docker pull` | `podman pull` |
| `docker push` | `podman push` |

In molti casi puoi semplicemente creare un alias:

```bash
alias docker=podman
```


## Podman Pod

Un **pod** in Podman raggruppa più container che condividono lo stesso network namespace (esattamente come un Pod Kubernetes):

```bash
# Crea un pod
podman pod create --name mio-pod -p 8080:80

# Aggiungi container al pod
podman run -d --pod mio-pod --name web nginx
podman run -d --pod mio-pod --name sidecar busybox sleep 3600

# I container condividono la rete — il sidecar può raggiungere nginx su localhost:80
podman exec sidecar wget -qO- localhost:80

# Lista dei pod
podman pod list
```


## Podman Compose e Generazione YAML Kubernetes

### podman-compose

Podman supporta i file `docker-compose.yml` tramite `podman-compose`:

```bash
# Installa podman-compose
pip3 install podman-compose

# Usa come Docker Compose
podman-compose up -d
podman-compose ps
podman-compose down
```

### Da Podman a Kubernetes: `podman generate kube`

Podman può **generare manifest Kubernetes** direttamente da container o pod in esecuzione — un ponte diretto tra sviluppo locale e deployment K8s:

```bash
# Genera YAML Kubernetes da un pod Podman esistente
podman generate kube mio-pod > mio-pod.yaml
cat mio-pod.yaml
# → apiVersion: v1, kind: Pod, con tutti i container, volumi, porte

# Genera da un singolo container
podman generate kube web > web-pod.yaml

# Includi anche il Service
podman generate kube mio-pod --service > mio-pod-con-service.yaml
```

### Da Kubernetes a Podman: `podman play kube`

Il percorso inverso — esegui manifest Kubernetes direttamente con Podman, senza un cluster:

```bash
# Esegui un Pod Kubernetes con Podman
podman play kube mio-pod.yaml

# Ferma e rimuovi
podman play kube --down mio-pod.yaml
```

> **Workflow consigliato:** sviluppa con `podman pod create` → testa localmente → `podman generate kube` → applica il YAML su un cluster Kubernetes reale. Questo elimina la necessità di scrivere YAML da zero.
