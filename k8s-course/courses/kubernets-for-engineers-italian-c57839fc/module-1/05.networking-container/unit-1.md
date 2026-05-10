---
kind: unit

title: Networking dei Container

name: networking-container-pratica
---

## Obiettivi

Al termine di questa lezione sarai in grado di:

- Capire le modalità di rete disponibili in Docker
- Sperimentare con le reti `none`, `host` e `bridge`
- Condividere lo stack di rete tra container

---

## Modalità di Rete in Docker

Docker offre diverse modalità di rete, ognuna con un caso d'uso specifico.

### Nessuna rete (`--net=none`)

Il container ha solo l'interfaccia di loopback — nessun accesso alla rete:

```bash
docker run --net=none busybox ifconfig
# lo        Link encap:Local Loopback
#           inet addr:127.0.0.1  Mask:255.0.0.0
#           UP LOOPBACK RUNNING  MTU:65536  Metric:1
```

Utile per container che non devono comunicare con l'esterno (es. job di calcolo batch).

### Rete dell'host (`--network host`)

Il container condivide lo stack di rete dell'host — stesse interfacce, stessi IP, stesse porte:

```bash
docker run --network host busybox ifconfig
# Vedrai le stesse interfacce dell'host (eth0, wlan0, ecc.)
```

> **Attenzione:** Con `--network host` non c'è isolamento di rete. Il container può accedere a tutte le porte dell'host e viceversa. Usare con cautela.

### Rete bridge (default)

Quando non specifichi la rete, Docker usa la rete `bridge` di default. Il container ottiene un IP privato (tipicamente `172.17.0.x`) e comunica con l'esterno via NAT:

```bash
docker run -d -p 8080:80 nginx
curl localhost:8080
```

### Condividere la rete tra container

Due container possono condividere lo stesso network namespace usando `--net=container:<nome>`:

```bash
# Avvia il primo container
docker run --name foo -d busybox sleep 3600

# Avvia il secondo container nello stesso namespace di rete
docker run --net=container:foo -it busybox /bin/sh

# Dentro il secondo container, vedrai le stesse interfacce di "foo"
ifconfig
```

Questo è lo stesso meccanismo usato dai **Pod** in Kubernetes: tutti i container di un Pod condividono lo stesso network namespace.

---

## Reti User-Defined Bridge con DNS Automatico

La rete bridge di default (`docker0`) ha un limite importante: i container possono comunicarsi solo via IP, non per nome. Le **reti user-defined** risolvono questo problema fornendo un DNS integrato.

```bash
# Crea una rete personalizzata
docker network create mynet

# Avvia due container nella stessa rete
docker run -d --name web --network mynet nginx
docker run -d --name api --network mynet busybox sleep 3600

# Il container "api" può raggiungere "web" per nome!
docker exec api wget -qO- http://web
# → pagina HTML di nginx
```

### Default Bridge vs User-Defined Bridge

| Caratteristica | Default Bridge (`docker0`) | User-Defined Bridge |
|---------------|---------------------------|---------------------|
| **DNS automatico** | No — solo IP | Sì — risoluzione per nome container |
| **Isolamento** | Tutti i container sulla stessa rete | Solo i container aggiunti esplicitamente |
| **Connect/Disconnect** | Richiede restart | A caldo con `docker network connect/disconnect` |
| **Variabili d'ambiente** | Condivise via `--link` (deprecato) | Non necessario — usa DNS |

```bash
# Comandi utili per le reti
docker network ls                     # Lista tutte le reti
docker network inspect mynet          # Dettagli (subnet, container connessi)
docker network connect mynet <container>   # Collega un container esistente
docker network disconnect mynet <container> # Scollega
docker network rm mynet               # Rimuovi la rete
```

> **Best practice:** usa sempre reti user-defined per i tuoi progetti. La rete bridge di default è utile solo per test rapidi.

---

## Docker Compose — Orchestrare Multi-Container

Quando un'applicazione è composta da più servizi (web server, API, database), gestire ogni container manualmente diventa scomodo. **Docker Compose** permette di definire e avviare tutti i servizi con un unico file.

### Esempio: Applicazione Web + API + Database

```yaml
# docker-compose.yml
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - api

  api:
    build: ./api          # Costruisci dal Dockerfile in ./api
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:                # Volume persistente per il database
```

### Comandi Essenziali

```bash
# Avvia tutti i servizi (in background)
docker compose up -d

# Vedi lo stato dei servizi
docker compose ps

# Vedi i log di tutti i servizi (follow)
docker compose logs -f

# Log di un singolo servizio
docker compose logs -f api

# Ferma e rimuovi tutto (container, reti)
docker compose down

# Ferma e rimuovi tutto INCLUSI i volumi (attenzione: cancella i dati!)
docker compose down -v

# Ricostruisci le immagini e riavvia
docker compose up -d --build
```

### Come Funziona la Rete in Compose

Docker Compose crea automaticamente una **rete user-defined** per ogni progetto. Tutti i servizi possono comunicarsi usando il **nome del servizio** come hostname:

```
web  → può raggiungere "api" e "db" per nome
api  → può raggiungere "db" per nome
db   → raggiungibile come "db" dagli altri servizi
```

Non serve configurare nulla: il DNS è automatico.

> **Da Docker Compose a Kubernetes:** Compose è ottimo per lo sviluppo locale. In produzione, gli stessi concetti (multi-container, volumi, reti) si traducono in oggetti Kubernetes: Deployment, Service, PersistentVolumeClaim. Lo strumento `kompose` può convertire un `docker-compose.yml` in manifest Kubernetes.

---

## Risorse

- [Docker Networking Overview — docs.docker.com](https://docs.docker.com/engine/network/)
- [Bridge Network Driver — docs.docker.com](https://docs.docker.com/engine/network/drivers/bridge/)
- [Docker Compose Overview — docs.docker.com](https://docs.docker.com/compose/)
- [Compose File Reference — docs.docker.com](https://docs.docker.com/reference/compose-file/)
- [Kompose — Kubernetes + Compose](https://kompose.io/)
