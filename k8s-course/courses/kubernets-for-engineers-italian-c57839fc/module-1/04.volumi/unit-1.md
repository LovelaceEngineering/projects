---
kind: unit

title: Volumi e Dati Persistenti

name: volumi-pratica
---

## Obiettivi

Al termine di questa lezione sarai in grado di:

- Capire la differenza tra un volume e un bind mount
- Creare e gestire volumi con Docker e Podman
- Persistere i dati oltre il ciclo di vita del container

---

## Il Problema: i Dati nel Container Sono Effimeri

Quando un container viene rimosso, tutto il suo filesystem (il layer read-write di OverlayFS) viene cancellato. I volumi risolvono questo problema fornendo storage persistente esterno al ciclo di vita del container.

---

## Bind Mount

Un **bind mount** monta una directory dell'host direttamente nel container:

Sintassi Docker (classica con `-v`):

```bash
docker run -v /percorso/sull/host:/percorso/nel/container \
    [opzioni...] <immagine> [comando]
```

Sintassi Podman (con `--mount`):

```bash
podman run --name mycontainer \
    --mount type=bind,src=/percorso/sull/host,dst=/percorso/nel/container \
    [opzioni...] <immagine> [comando]
```

### Esercizio: Bind Mount

```bash
# Crea un file di log sull'host
LOG_SRC=~/lab.log
LOG_DST=/var/log/dpkg.log

# Avvia un container con bind mount
podman run -d --name bind-container \
    --mount type=bind,src=$LOG_SRC,dst=$LOG_DST \
    -p 80:80 drupal
```

Scrivi qualcosa dal container:

```bash
podman exec -it bind-container bash
echo "Questo è un log dall'interno del container" >> /var/log/dpkg.log
exit

# Verifica che il file sia visibile sull'host
cat ~/lab.log
```

Il contenuto è condiviso in tempo reale tra host e container.

---

## Volumi Docker/Podman

Un **volume** è gestito dal runtime (Docker o Podman) e ha un ciclo di vita indipendente dal container:

```bash
# Crea un volume
podman volume create volume1

# Avvia un container usando il volume
podman run -d --name volume-container \
    --mount type=volume,src=volume1,dst=/var/log \
    -p 80:80 drupal

# Ispeziona il container per vedere dove è montato il volume
podman inspect volume-container
```

---

## Volume vs Bind Mount

| Caratteristica | Bind Mount | Volume |
|---------------|------------|--------|
| **Gestione** | Manuale (path sull'host) | Gestito dal runtime |
| **Portabilità** | Dipende dal path dell'host | Indipendente dall'host |
| **Backup** | Copia manuale della directory | `docker volume` / `podman volume` |
| **Caso d'uso** | Sviluppo locale, config files | Dati di produzione, database |

---

## Comandi Utili per i Volumi

```bash
# Lista dei volumi
podman volume list

# Ispeziona un volume
podman volume inspect volume1

# Rimuovi un volume
podman volume rm volume1

# Rimuovi tutti i volumi non utilizzati
podman volume prune
```

---

## tmpfs Mount — Storage in RAM

Un **tmpfs mount** scrive i dati direttamente in memoria RAM — non persiste su disco e viene eliminato alla rimozione del container. Utile per dati sensibili temporanei (token, sessioni) che non devono toccare il filesystem.

```bash
# Monta un tmpfs da 64MB in /tmp/secure
docker run -d --name secure-app \
    --tmpfs /tmp/secure:rw,size=64m,noexec \
    nginx

# Verifica
docker exec secure-app df -h /tmp/secure
# → tmpfs    64M     0   64M   0% /tmp/secure

# Alternativa con --mount
docker run -d --name secure-app2 \
    --mount type=tmpfs,destination=/tmp/secure,tmpfs-size=67108864 \
    nginx
```

| Caratteristica | Bind Mount | Volume | tmpfs |
|---------------|------------|--------|-------|
| **Dove vive** | Filesystem host | Area gestita dal runtime | RAM |
| **Persistenza** | Sì | Sì | No (solo vita del container) |
| **Performance** | Disco host | Disco host | Molto veloce (RAM) |
| **Caso d'uso** | Sviluppo, config | Produzione, database | Dati sensibili, cache temporanea |

---

## Backup e Restore di un Volume

Pattern comune per creare un backup di un volume Docker usando un container `busybox` con `tar`:

```bash
# Backup: monta il volume + una directory host, archivia con tar
docker run --rm \
    -v volume1:/source:ro \
    -v $(pwd):/backup \
    busybox tar czf /backup/volume1-backup.tar.gz -C /source .

# Restore: decomprimi l'archivio nel volume di destinazione
docker run --rm \
    -v volume1-restored:/target \
    -v $(pwd):/backup:ro \
    busybox tar xzf /backup/volume1-backup.tar.gz -C /target
```

> **Tip:** Automatizza i backup con un cron job o un container dedicato. In Kubernetes, il concetto equivalente è Velero per il backup dei PersistentVolume.
