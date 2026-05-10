---
kind: unit

title: Registry dei Container

name: registry-pratica
---

## Obiettivi

Al termine di questa lezione sarai in grado di:

- Eseguire un registry locale per push e pull di immagini
- Capire la differenza tra registry e repository
- Interagire con registry remoti usando Docker, Podman e strumenti come `crane`

---

## Registry Locale

Un registry locale è utile per lo sviluppo e il testing, evitando di dipendere da un registry esterno.

### Avviare un registry locale

```bash
docker run -d -p 5000:5000 --name registry registry:latest
```

### Push di un'immagine al registry locale

```bash
# Scarica un'immagine dal Docker Hub
docker pull ubuntu

# Taggala per il registry locale
docker tag ubuntu localhost:5000/ubuntu

# Effettua il push
docker push localhost:5000/ubuntu
```

### Ispezionare il registry con `crane`

[crane](https://github.com/google/go-containerregistry) è uno strumento per interagire con i registry OCI senza Docker:

```bash
# Installa crane
VERSION=$(curl -s "https://api.github.com/repos/google/go-containerregistry/releases/latest" | jq -r '.tag_name')
ARCH=x86_64
OS=Linux
curl -sL "https://github.com/google/go-containerregistry/releases/download/${VERSION}/go-containerregistry_${OS}_${ARCH}.tar.gz" > go-containerregistry.tar.gz
tar -zxvf go-containerregistry.tar.gz -C /usr/local/bin/ crane

# Lista il catalogo del registry locale
crane catalog localhost:5000
```

---

## Interagire con Registry Remoti

I comandi seguenti funzionano sia con `docker` che con `podman`.

### Cercare un'immagine in un registry

```bash
podman search registry.access.redhat.com <pattern>
```

### Scaricare un'immagine da un registry

```bash
podman pull registry.access.redhat.com/rhel7/rhel
```

### Taggare un'immagine

```bash
podman tag registry.access.redhat.com/rhel7/rhel rhel7/rhel
```

### Push verso un registry remoto

```bash
# Autenticati al registry
podman login -u <username> -p <password> <registry>:<porta>

# Effettua il push
podman push rhel7/rhel <registry>:<porta>/<username>/rhel7/rhel
```

---

## Registry vs Repository

- **Registry**: il server che ospita le immagini (es. `docker.io`, `ghcr.io`, `registry.access.redhat.com`)
- **Repository**: una collezione di immagini con lo stesso nome ma tag diversi all'interno di un registry (es. `library/nginx` contiene `nginx:latest`, `nginx:alpine`, `nginx:1.25`)
