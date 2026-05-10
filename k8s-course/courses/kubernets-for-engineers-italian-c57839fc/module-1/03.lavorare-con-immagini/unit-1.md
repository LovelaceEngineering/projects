---
kind: unit

title: Lavorare con le Immagini

name: lavorare-con-immagini-pratica
---

## Obiettivi

Al termine di questa lezione sarai in grado di:

- Capire come vengono costruite e create le immagini container
- Creare un'immagine da zero usando `FROM scratch`
- Ispezionare i layer di un'immagine

---

## Creare un'Immagine da Scratch

L'istruzione `FROM scratch` è il punto di partenza più minimale possibile: un'immagine completamente vuota. È utile per capire cosa contiene davvero un'immagine container.

### Esempio: immagine CentOS da zero

```dockerfile
FROM scratch
ADD centos-7-docker.tar.xz /
LABEL org.label-schema.schema-version="1.0" \
    org.label-schema.name="CentOS Base Image" \
    org.label-schema.vendor="CentOS" \
    org.label-schema.license="GPLv2" \
    org.label-schema.build-date="20180804"
CMD ["/bin/bash"]
```

Costruisci l'immagine:

```bash
docker build --tag centos:7 .
```

Esegui il container:

```bash
docker run -ti centos:7
```

> **Cosa sta succedendo:** L'istruzione `ADD` decomprime l'archivio `.tar.xz` nella root dell'immagine. Il risultato è un filesystem completo CentOS 7 con le librerie, i binari e le configurazioni necessarie per eseguire un sistema minimale.

---

## Ispezionare i Layer di un'Immagine

Ogni istruzione nel Dockerfile crea un nuovo **layer**. Puoi ispezionare la struttura dei layer con:

```bash
# Mostra la storia di build dell'immagine
docker history centos:7

# Ispeziona i metadati dell'immagine
docker inspect centos:7

# Mostra i dettagli dei layer
docker inspect centos:7 | jq '.[0].RootFS'
```

---

## Comandi Utili per le Immagini

```bash
# Lista di tutte le immagini locali
docker images

# Cerca un'immagine nel Docker Hub
docker search nginx

# Scarica un'immagine
docker pull nginx:alpine

# Tagga un'immagine con un nuovo nome
docker tag nginx:alpine mio-registry/nginx:v1

# Rimuovi un'immagine locale
docker rmi centos:7

# Rimuovi tutte le immagini non utilizzate
docker image prune -a
```

---

## Image Scanning — Trovare Vulnerabilità

Prima di deployare un'immagine in produzione, è buona pratica scansionarla per vulnerabilità note. **Trivy** è lo strumento open-source più usato:

```bash
# Scansiona un'immagine per vulnerabilità
trivy image nginx:alpine

# Solo vulnerabilità HIGH e CRITICAL
trivy image --severity HIGH,CRITICAL nginx:alpine

# Scansiona un'immagine locale (non ancora pushata)
trivy image --input myapp.tar

# Output in formato JSON (per CI/CD pipeline)
trivy image -f json -o results.json nginx:alpine
```

| Strumento | Tipo | Note |
|-----------|------|------|
| **Trivy** | CLI open-source (Aqua Security) | CVE, misconfiguration, secrets, SBOM |
| **Docker Scout** | Integrato in Docker Desktop | `docker scout quickview`, dashboard web |
| **Grype** | CLI open-source (Anchore) | Alternativa leggera a Trivy |

> **Approfondimento:** la scansione delle immagini è trattata in dettaglio nella Lezione 9 (Image Building Avanzato) con copertura di SBOM, supply chain security e integrazione in CI/CD.

### Risorse

- [Trivy Documentation](https://trivy.dev/)
- [Docker Scout — docs.docker.com](https://docs.docker.com/scout/)
