---
kind: unit

title: Primi Passi con Docker

name: primi-passi-pratica
---

## Obiettivi

Al termine di questa lezione sarai in grado di:

- Installare e utilizzare un runtime Docker e il suo client
- Eseguire il tuo primo container
- Capire cosa succede dietro le quinte di un `docker run`

---

## Installazione di Docker

Il modo più rapido per installare Docker su un nodo Linux è usare lo script ufficiale:

```bash
curl -fsSL get.docker.com -o get-docker.sh && sudo sh get-docker.sh && sudo systemctl start docker && sudo systemctl enable docker
```

Non dimenticare di aggiungere il tuo utente al gruppo `docker`, altrimenti dovrai usare `sudo` per ogni comando:

```bash
sudo usermod -aG docker $USER
```

> **Nota:** Dovrai effettuare logout e login perché la modifica al gruppo abbia effetto.

---

## Eseguire il Primo Container

```bash
docker run busybox echo Hello World
```

**Cosa è appena successo?**

1. Il client Docker ha contattato il processo daemon Docker
2. Il daemon Docker ha scaricato l'immagine `busybox` dal Docker Hub
3. Il daemon ha creato un nuovo container da quell'immagine, eseguendo il comando che ha prodotto l'output
4. Il daemon ha inviato l'output al client Docker, che lo ha mostrato nel tuo terminale
5. Il container ha terminato l'esecuzione ed è stato distrutto

---

## Eseguire un Container in Background

Usa il flag `-d` (detached) per eseguire un container in background e `-p` per mappare le porte:

```bash
docker run -d -p 80:80 nginx
```

Verifica che funzioni collegandoti al container:

```bash
curl localhost
```

Dovresti vedere la pagina di benvenuto di nginx.

---

## Comandi Fondamentali

```bash
# Lista dei container in esecuzione
docker ps

# Lista di tutti i container (anche quelli fermi)
docker ps -a

# Ferma un container
docker stop <container_id>

# Rimuovi un container
docker rm <container_id>

# Lista delle immagini locali
docker images

# Rimuovi un'immagine
docker rmi <image_id>
```

---

## Ciclo di Vita e Restart Policy

Un container Docker attraversa diversi stati durante il suo ciclo di vita:

| Stato | Significato |
|-------|-------------|
| `created` | Container creato ma non ancora avviato |
| `running` | Container in esecuzione |
| `paused` | Processi sospesi (SIGSTOP) |
| `exited` | Container terminato (exit code disponibile) |
| `dead` | Container in stato di errore irrecuperabile |

```bash
# Ispeziona lo stato corrente di un container
docker inspect --format='{{.State.Status}}' <container_id>

# Vedi exit code dell'ultimo run
docker inspect --format='{{.State.ExitCode}}' <container_id>
```

Le **restart policy** determinano cosa succede quando un container termina:

| Policy | Comportamento |
|--------|--------------|
| `no` | Non riavviare mai (default) |
| `on-failure[:max]` | Riavvia solo su exit code ≠ 0 (opzionale: max N tentativi) |
| `unless-stopped` | Riavvia sempre, tranne se fermato manualmente |
| `always` | Riavvia sempre, anche dopo un `docker stop` + restart del daemon |

```bash
# Avvia nginx con riavvio automatico
docker run -d --restart=unless-stopped --name web nginx

# Cambia la restart policy di un container esistente
docker update --restart=on-failure:3 web
```

> **Tip:** In produzione si usa quasi sempre `unless-stopped` o `always`. In Kubernetes il concetto equivalente è il campo `restartPolicy` del Pod (`Always`, `OnFailure`, `Never`).

---

## Log dei Container

Docker cattura tutto ciò che un processo scrive su **stdout** e **stderr** e lo rende disponibile tramite `docker logs`:

```bash
# Log completi
docker logs <container_id>

# Follow in tempo reale (come tail -f)
docker logs -f <container_id>

# Log dall'ultima ora
docker logs --since 1h <container_id>

# Ultime 50 righe
docker logs --tail 50 <container_id>

# Combinazione: ultime 20 righe + follow
docker logs --tail 20 -f <container_id>

# Con timestamp
docker logs -t <container_id>
```

Il **log driver** di default è `json-file`, che salva i log come file JSON sul filesystem dell'host. Altri driver comuni:

| Driver | Destinazione |
|--------|-------------|
| `json-file` | File JSON locale (default) |
| `journald` | systemd journal |
| `syslog` | Server syslog |
| `fluentd` | Fluentd collector |
| `none` | Nessun log (disabilita) |

> **Attenzione:** Con il driver `json-file`, i log crescono senza limite. Configura la rotazione:
> ```bash
> docker run -d --log-opt max-size=10m --log-opt max-file=3 nginx
> ```

---

## Accedere a un Container in Esecuzione

### `docker exec` — Eseguire comandi in un container attivo

```bash
# Shell interattiva
docker exec -it <container_id> /bin/bash
# oppure /bin/sh per immagini minimali (alpine, busybox)
docker exec -it <container_id> sh

# Comando one-shot (senza shell interattiva)
docker exec <container_id> cat /etc/nginx/nginx.conf
docker exec <container_id> env

# Eseguire come utente specifico
docker exec -u root <container_id> apt-get update
```

### `docker exec` vs `docker attach`

| Comando | Cosa fa | Quando usare |
|---------|---------|-------------|
| `docker exec` | Avvia un **nuovo processo** nel container | Debug, ispezione, comandi one-shot |
| `docker attach` | Si collega allo **stdin/stdout del processo principale** (PID 1) | Interagire con il processo principale |

> **Attenzione:** Con `docker attach`, premere `Ctrl+C` invia SIGINT al processo principale — potrebbe fermare il container! Usa `Ctrl+P, Ctrl+Q` per uscire senza fermarlo.

---

## Risorse

- [Docker CLI Reference — docker run](https://docs.docker.com/reference/cli/docker/container/run/)
- [Docker Logging — Configure logging drivers](https://docs.docker.com/engine/logging/configure/)
- [Docker Restart Policies](https://docs.docker.com/engine/containers/start-containers-automatically/)
- [Container Lifecycle — Docker docs](https://docs.docker.com/get-started/docker-concepts/running-containers/)
