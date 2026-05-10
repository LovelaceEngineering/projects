---
kind: unit

title: "Incontro 1 — Sotto il Cofano: Internals di Docker"

name: docker-internals-teoria

tutorials:
  container-filesystem-from-scratch: {}
  container-networking-from-scratch: {}
  controlling-process-resources-with-cgroups: {}
---

> **Playground per questo incontro**
>
> Puoi seguire tutti gli esercizi di questo incontro in autonomia usando il playground Docker di iximiuz Labs:
> [https://labs.iximiuz.com/playgrounds/docker](https://labs.iximiuz.com/playgrounds/docker)
>
> Il playground ti fornisce un ambiente Linux con Docker pre-installato, pronto all'uso senza nessuna configurazione locale.

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Descrivere la catena di esecuzione Docker (CLI → daemon → containerd → runc → kernel)
- Spiegare i 7 Linux namespaces e come Docker li usa per isolare i container
- Leggere le metriche cgroup v2 di un container in esecuzione e diagnosticare un OOM kill
- Navigare la struttura OverlayFS di un container e capire il copy-on-write
- Creare manualmente un network namespace con veth pair e capire come i container comunicano
- Applicare `nsenter` e `unshare` per entrare e creare namespace dal vivo

---

## Teoria (50 min)

### L'Architettura di Docker: dalla CLI al Kernel

Quando esegui `docker run nginx`, dietro le quinte avviene una catena di deleghe:

```
docker CLI
    │  (REST over Unix socket: /var/run/docker.sock)
    ▼
dockerd  (Docker daemon)
    │  (gRPC)
    ▼
containerd  (container lifecycle manager)
    │  (fork/exec via containerd-shim)
    ▼
runc  (OCI runtime)
    │  (syscalls al kernel)
    ▼
Linux Kernel  (namespaces, cgroups, OverlayFS)
```

**Perché questa separazione?**

- **dockerd** gestisce l'API, le immagini, i volumi e la rete
- **containerd** gestisce il ciclo di vita dei container (start, stop, snapshot)
- **runc** è il componente che *effettivamente* crea i namespace e applica i cgroup — è un binario piccolo e senza dipendenze
- **containerd-shim** rimane in esecuzione anche dopo che `runc` esce, tenendo aperti gli stdin/stdout del container

Questo design permette di aggiornare `dockerd` senza killare i container esistenti.

> **Curiosità:** Kubernetes non usa il Docker daemon. Il kubelet parla direttamente con **containerd** via CRI (Container Runtime Interface). Il formato immagine Docker/OCI è però lo stesso: le immagini costruite con `docker build` funzionano in Kubernetes senza modifiche.

Puoi verificare l'albero di processi mentre un container è in esecuzione:

```bash
docker run -d --name test nginx
# Trova il PID del container
CPID=$(docker inspect -f '{{.State.Pid}}' test)
# Guarda l'albero: containerd-shim → runc → nginx
pstree -p $CPID
```

---

### Linux Namespaces: l'Illusione dell'Isolamento

Un **namespace** è un wrapper del kernel attorno a una risorsa globale che fa sembrare al processo che vive al suo interno di avere la propria istanza privata di quella risorsa.

Docker usa **7 namespace** (tutti creati con `clone(2)` al momento della creazione del container):

| Namespace | Flag `clone()` | Cosa isola |
|-----------|----------------|------------|
| **Mount (mnt)** | `CLONE_NEWNS` | Tabella dei mount point — ogni container ha il suo `/proc`, `/sys`, `/` |
| **Process ID (pid)** | `CLONE_NEWPID` | Albero dei PID — il processo init del container ha PID 1 |
| **Network (net)** | `CLONE_NEWNET` | Interfacce di rete, tabelle di routing, iptables, socket |
| **IPC** | `CLONE_NEWIPC` | Code di messaggi System V, semafori condivisi, shared memory |
| **UTS** | `CLONE_NEWUTS` | Hostname e NIS domainname |
| **User** | `CLONE_NEWUSER` | UID/GID mapping — UID 0 nel container può mapparsi a UID 1000 sull'host |
| **Cgroup** | `CLONE_NEWCGROUP` | Vista dell'albero cgroup — nasconde le configurazioni dell'host |

Le syscall fondamentali sono:
- `clone(2)` — crea un nuovo processo in uno o più namespace nuovi
- `unshare(2)` — sposta il processo corrente in nuovi namespace
- `setns(2)` — entra in un namespace esistente (usato da `docker exec`)

#### Ispezione dei Namespace di un Container

Ogni processo ha i propri namespace visibili in `/proc/<pid>/ns/`:

```bash
# Avvia un container
docker run -d --name demo nginx

# Trova il PID del processo principale
CPID=$(docker inspect -f '{{.State.Pid}}' demo)

# Visualizza i namespace del container
ls -la /proc/$CPID/ns/
# lrwxrwxrwx cgroup -> cgroup:[4026532456]
# lrwxrwxrwx ipc -> ipc:[4026532393]
# lrwxrwxrwx mnt -> mnt:[4026532391]
# lrwxrwxrwx net -> net:[4026532396]
# lrwxrwxrwx pid -> pid:[4026532394]
# lrwxrwxrwx uts -> uts:[4026532392]

# Confronta con i namespace del processo host (PID 1)
ls -la /proc/1/ns/
# I numeri inode sono diversi = namespace separati
```

#### Entrare in un Namespace con `nsenter`

`docker exec` usa `setns()` per entrare nei namespace del container. Puoi fare la stessa cosa manualmente:

```bash
# Entra in tutti i namespace del container dall'host
sudo nsenter --target $CPID --mount --uts --ipc --net --pid

# Ora sei "dentro" il container (ma con i privilegi di root dell'host)
hostname          # vedremo il nome del container
ip addr           # solo le interfacce del container
ps aux            # solo i processi del container
```

#### Il Namespace PID: PID 1 nel Container

Dentro un container, il processo principale vede se stesso come PID 1:

```bash
docker run --rm alpine ps aux
# PID 1 è il processo principale
# Non ci sono altri processi visibili

# Ma dall'host, ha un PID normale
docker run -d --name pidtest sleep 3600
docker inspect -f '{{.State.Pid}}' pidtest
# Es: 12345 — un PID normale nell'albero dei processi dell'host
```

#### Il Namespace User: Rootless Containers

Il user namespace è il più potente: permette di mappare UID 0 (root) nel container a un UID non privilegiato sull'host. Questo è il fondamento dei **rootless containers**.

```bash
# Container con user namespace (rootless)
docker run --rm --user 1000:1000 alpine id
# uid=1000 gid=1000

# Verifica: il processo è non privilegiato sull'host
docker run -d --user 1000:1000 --name unpriv nginx
CPID=$(docker inspect -f '{{.State.Pid}}' unpriv)
cat /proc/$CPID/status | grep '^Uid'
# Uid: 1000  1000  1000  1000  ← non root sull'host
```

---

### cgroups v2: Limiti di Risorse

I **control groups (cgroups)** sono la tecnologia del kernel Linux che permette di limitare, misurare e isolare l'utilizzo di risorse (CPU, RAM, I/O, PID) di un insieme di processi.

Docker usa **cgroups v2** (unified hierarchy) su versioni kernel moderne (≥ 5.0) e distribuzioni come Ubuntu 22.04+, RHEL 9+.

> **Come rilevare la versione cgroup attiva:**
> ```bash
> # "tmpfs" = cgroup v1, "cgroup2fs" = cgroup v2
> stat -fc %T /sys/fs/cgroup/
> # oppure
> mount | grep cgroup
> ```

Il filesystem di cgroup è montato su `/sys/fs/cgroup/`. Ogni container Docker ottiene un cgroup dedicato sotto:
```
/sys/fs/cgroup/system.slice/docker-<container-id>.scope/
```

#### Le Risorse Controllabili

| File cgroup | Significato |
|-------------|-------------|
| `memory.max` | Limite massimo di RAM in byte (`max` = illimitato) |
| `memory.current` | RAM attualmente usata |
| `memory.events` | Contatori OOM (oom_kill, oom) |
| `cpu.max` | Quota CPU: `<quota_us> <period_us>` — es. `100000 100000` = 1 core |
| `cpu.stat` | Statistiche CPU (usage_usec, throttled_usec) |
| `pids.max` | Numero massimo di processi (prevenzione fork bomb) |
| `io.max` | Limiti di I/O su disco per dispositivo |

#### Applicare Limiti con Docker

```bash
# Container con 256MB di RAM e 0.5 CPU
docker run -d \
  --memory=256m \
  --cpus=0.5 \
  --pids-limit=100 \
  --name limited nginx

# Verifica i valori nel filesystem cgroup
CID=$(docker inspect -f '{{.Id}}' limited)
cat /sys/fs/cgroup/system.slice/docker-${CID}.scope/memory.max
# 268435456  (= 256 * 1024 * 1024)

cat /sys/fs/cgroup/system.slice/docker-${CID}.scope/cpu.max
# 50000 100000  (= 50% di 1 core)
```

#### Rilevare un OOM Kill

Quando un container supera il limite di memoria, il kernel Linux attiva l'**OOM (Out-Of-Memory) killer** che termina il processo.

```bash
# Avvia un container con solo 10MB di RAM
docker run -d --memory=10m --name oom-test nginx

# Forza un consumo eccessivo di memoria
docker exec oom-test sh -c "cat /dev/urandom | head -c 50m > /dev/null"

# Il container crasha — controlla l'evento
docker inspect oom-test | jq '.[0].State'
# "OOMKilled": true

# Leggi i contatori OOM dal cgroup
CID=$(docker inspect -f '{{.Id}}' oom-test)
cat /sys/fs/cgroup/system.slice/docker-${CID}.scope/memory.events
# oom 1
# oom_kill 1
```

#### Verificare i Limiti dall'interno del Container

Interessante: i container "vedono" il loro cgroup grazie al **cgroup namespace**:

```bash
docker run --rm --memory=128m alpine sh -c "cat /sys/fs/cgroup/memory.max"
# 134217728  (= 128MB) — il container vede il proprio limite, non quello dell'host
```

> **Vista del container vs vista dell'host:**
> Il percorso cgroup **dentro il container** è sempre `/sys/fs/cgroup/memory.max` (la radice del cgroup namespace del container).
> Dall'**host**, lo stesso cgroup si trova in `/sys/fs/cgroup/system.slice/docker-<CID>.scope/memory.max`.
> Entrambi mostrano lo stesso valore — sono due viste dello stesso oggetto kernel.

---

### OverlayFS: Il Filesystem a Strati

OverlayFS è il **union filesystem** usato da Docker come storage driver (`overlay2`). Permette di sovrapporre directory read-only con un layer read-write, creando una vista unificata.

#### Il Concetto di Union Mount

L'idea fondamentale: più directory ("branch") vengono fuse in un'unica vista unificata. In caso di conflitto (stesso file in più layer), vince il layer più in alto.

```
┌─────────────────────────────────┐
│  Container Layer (upperdir)     │  ← read-write, specifico del container
│  /etc/nginx/nginx.conf (modif.) │
├─────────────────────────────────┤
│  Image Layer 3 (lowerdir)       │  ← read-only
│  /etc/nginx/nginx.conf (orig.)  │
├─────────────────────────────────┤
│  Image Layer 2 (lowerdir)       │  ← read-only
│  /usr/bin/nginx                 │
├─────────────────────────────────┤
│  Image Layer 1 (lowerdir)       │  ← read-only (base image)
│  /lib, /bin, /etc, ...          │
└─────────────────────────────────┘
         ▼ merged view ▼
┌─────────────────────────────────┐
│        Container View           │
│  Tutto unificato — /etc, /usr,  │
│  /lib, con le modifiche del     │
│  container in cima              │
└─────────────────────────────────┘
```

#### Come Docker usa OverlayFS

Docker monta l'overlay con un comando simile a questo (semplificato):

```bash
mount -t overlay overlay \
  -o lowerdir=/layer3:/layer2:/layer1,\
     upperdir=/container-rw,\
     workdir=/container-work \
  /container-merged
```

Le quattro directory rilevanti per ogni container:

| Directory | Ruolo |
|-----------|-------|
| `lowerdir` | Stack di layer read-only dell'immagine (separati da `:`) |
| `upperdir` | Layer read-write del container (le modifiche) |
| `workdir` | Directory di lavoro interna per operazioni atomiche |
| `merged` | Il filesystem che il container vede come `/` |

#### Copy-on-Write (CoW)

**Prima scrittura** su un file che esiste solo in `lowerdir`:
1. Il file viene **copiato** da `lowerdir` a `upperdir`
2. La modifica viene applicata alla copia in `upperdir`
3. La vista `merged` mostra la versione modificata

**Cancellazione** di un file da `lowerdir`:
- Viene creato un **whiteout file** in `upperdir` (un file speciale con modo `c 0 0`)
- La vista `merged` non mostra più il file, ma il layer inferiore non viene toccato

```bash
# Ispeziona la struttura OverlayFS di un container
docker run -d --name overlay-demo nginx

CID=$(docker inspect -f '{{.Id}}' overlay-demo)
docker inspect overlay-demo | jq '.[0].GraphDriver.Data'
# {
#   "LowerDir": "/var/lib/docker/overlay2/abc.../diff:...",
#   "MergedDir": "/var/lib/docker/overlay2/xyz.../merged",
#   "UpperDir": "/var/lib/docker/overlay2/xyz.../diff",
#   "WorkDir": "/var/lib/docker/overlay2/xyz.../work"
# }

# Modifica un file nel container
docker exec overlay-demo sh -c "echo 'hello' > /tmp/test.txt"

# Il file appare solo nell'upperdir (layer del container)
UPPER=$(docker inspect overlay-demo | jq -r '.[0].GraphDriver.Data.UpperDir')
ls $UPPER/tmp/
# test.txt  ← solo il layer del container lo contiene
```

#### Sharing dei Layer tra Container

Più container che usano la stessa immagine base **condividono i lowerdir** — nessuna copia:

```bash
# Avvia 5 container nginx
for i in $(seq 1 5); do docker run -d --name nginx$i nginx; done

# Tutti condividono gli stessi layer dell'immagine
docker inspect nginx1 nginx2 nginx3 | jq '.[].GraphDriver.Data.LowerDir' | head -5
# Stessi path! Solo UpperDir è diverso per ciascuno
```

---

### Container Networking: veth, Bridge e NAT

Quando Docker crea un container con la configurazione di rete di default (`--network bridge`), costruisce un piccolo stack di rete virtuale:

```
Host Kernel
┌──────────────────────────────────────────────┐
│                                              │
│  docker0 bridge (172.17.0.1/16)             │
│       │                                      │
│  veth0 (host end) ─── veth1 (container end) │
│                              │               │
│                    Network Namespace         │
│                    del Container             │
│                    (eth0: 172.17.0.2)        │
│                                              │
│  iptables: SNAT per outbound traffic         │
│  iptables: DNAT per port mapping (-p 80:80)  │
└──────────────────────────────────────────────┘
```

#### I Componenti

**docker0 bridge**: Un'interfaccia di rete virtuale sull'host, funziona come uno switch Layer 2. Tutti i container connessi alla rete bridge di default sono "collegati" a questo bridge.

**veth pair**: Una coppia di interfacce di rete virtuali collegate come un tubo — quello che entra da un lato esce dall'altro. Docker crea una coppia per ogni container:
- Un'estremità rimane nel **network namespace dell'host** (appare come `vethXXXXXX` con `ip link`)
- L'altra estremità va nel **network namespace del container** (appare come `eth0`)

**iptables**: Docker gestisce automaticamente regole iptables per:
- **NAT/MASQUERADE**: i container usano l'IP dell'host per accedere a internet
- **DNAT**: il port mapping `-p 8080:80` traduce le connessioni in arrivo verso il container

```bash
# Ispeziona la configurazione di rete di un container
docker run -d --name netdemo -p 8080:80 nginx

# Vedi le regole iptables create da Docker
sudo iptables -t nat -L -n -v | grep DOCKER

# Trova la veth dell'host associata al container
CPID=$(docker inspect -f '{{.State.Pid}}' netdemo)
# Il network namespace del container
sudo nsenter --target $CPID --net ip addr
# eth0: inet 172.17.0.X  ← IP del container

# Le veth sull'host
ip link | grep -A1 veth
```

#### Reti User-Defined

Le reti create con `docker network create` usano un bridge separato e offrono **DNS integrato** (i container si trovano per nome):

```bash
docker network create mynet

docker run -d --name db --network mynet postgres:16
docker run -d --name app --network mynet \
  -e DB_HOST=db \
  myapp

# "app" può raggiungere "db" per hostname — Docker risolve i nomi via DNS interno
docker exec app ping db
```

---

### Security Primitives: Capabilities e Seccomp

Storicamente, i processi Linux sono o **root** (con tutti i privilegi) o **non-root** (senza). Le **capabilities** spezzano questi privilegi in unità granulari.

#### Linux Capabilities

Docker **rimuove** la maggior parte delle capabilities per default, lasciando solo quelle necessarie:

```bash
# Le capabilities di default di Docker (subset sicuro)
# CAP_CHOWN, CAP_DAC_OVERRIDE, CAP_FSETID, CAP_FOWNER,
# CAP_NET_BIND_SERVICE, CAP_NET_RAW (←rimuovibile!),
# CAP_SETGID, CAP_SETUID, CAP_SETFCAP, CAP_MKNOD,
# CAP_AUDIT_WRITE, CAP_KILL, CAP_SYS_CHROOT

# Container minimale — nessuna capability
docker run --rm --cap-drop ALL alpine id

# Aggiungi solo ciò che serve (es. bind su porta <1024)
docker run --rm --cap-drop ALL --cap-add NET_BIND_SERVICE nginx
```

#### Seccomp: Filtro Syscall

Seccomp (Secure Computing Mode) filtra le **system call** che un container può eseguire. Docker applica un profilo seccomp di default che blocca ~44 syscall pericolose.

```bash
# Verifica il profilo seccomp di un container
docker inspect demo | jq '.[0].HostConfig.SecurityOpt'
# ["seccomp=..."]  ← profilo JSON

# Container senza seccomp (più permissivo, meno sicuro)
docker run --rm --security-opt seccomp=unconfined alpine \
  strace ls 2>&1 | head -5
```

> **Per Kubernetes:** I `SecurityContext` di un Pod applicano queste stesse primitive a livello orchestrato. `runAsNonRoot`, `capabilities.drop`, `seccompProfile` mappano direttamente a queste funzionalità kernel.

---

## Hands-on Guidato (90 min)

### Esercizio 1 — Ispezione Namespace di un Container Live

```bash
# Step 1: Avvia un container in background
docker run -d --name live nginx

# Step 2: Trova il PID del processo nel container
CPID=$(docker inspect -f '{{.State.Pid}}' live)
echo "PID del container: $CPID"

# Step 3: Confronta i namespace del container con quelli dell'host
echo "=== Namespace del container ==="
ls -la /proc/$CPID/ns/

echo "=== Namespace dell'host (PID 1) ==="
ls -la /proc/1/ns/

# Step 4: Verifica che montino filesystem diversi
sudo nsenter --target $CPID --mount ls /
# Vedremo il filesystem del container (Alpine/Debian), non quello dell'host

# Step 5: Confronta i PID
ps aux | grep nginx           # PID alto sull'host
sudo nsenter --target $CPID --pid ps aux  # PID 1 nel container
```

### Esercizio 2 — Container "a Mano" con `unshare`

Creiamo un container manualmente, senza Docker:

```bash
# Step 1: Scarica una rootfs Alpine
mkdir -p /tmp/mycontainer/rootfs
docker export $(docker create alpine) | tar -x -C /tmp/mycontainer/rootfs

# Step 2: Crea un namespace isolato ed entra
sudo unshare \
  --mount \
  --uts \
  --ipc \
  --pid \
  --fork \
  --map-root-user \
  chroot /tmp/mycontainer/rootfs /bin/sh

# Dentro il "container a mano":
hostname mycontainer  # cambia l'hostname (UTS namespace)
hostname              # → mycontainer
ps aux                # → solo sh (PID 1) e ps
id                    # → uid=0(root) — ma mappato a user non-root sull'host
```

> **Nota:** Questo è esattamente ciò che `runc` fa, in modo più sofisticato. `runc` legge un file `config.json` (lo spec OCI) e chiama `clone()` con i flag dei namespace appropriati.

### Esercizio 3 — Esplorazione OverlayFS

```bash
# Step 1: Avvia un container
docker run -d --name overlay-test nginx

# Step 2: Ispeziona la struttura dei layer
docker inspect overlay-test | jq '.[0].GraphDriver.Data'

# Step 3: Salva i path
LOWER=$(docker inspect overlay-test | jq -r '.[0].GraphDriver.Data.LowerDir' | cut -d: -f1)
UPPER=$(docker inspect overlay-test | jq -r '.[0].GraphDriver.Data.UpperDir')
MERGED=$(docker inspect overlay-test | jq -r '.[0].GraphDriver.Data.MergedDir')

# Step 4: Verifica il mount OverlayFS attivo
mount | grep overlay

# Step 5: Crea un file nel container
docker exec overlay-test sh -c "echo 'test' > /tmp/overlaytest.txt"

# Step 6: Trova il file nell'upperdir (ma non nel lowerdir)
ls $UPPER/tmp/         # → overlaytest.txt ← modifiche del container
ls $LOWER/tmp/ 2>/dev/null || echo "Non esiste nel lower layer"

# Step 7: Elimina il container — le modifiche scompaiono
docker rm -f overlay-test
ls $UPPER/tmp/ 2>/dev/null || echo "Layer rimosso"
```

### Esercizio 4 — OOM Kill con cgroups

```bash
# Step 1: Avvia un container con memoria limitata
docker run -d --memory=50m --memory-swap=50m --name oom-demo nginx
CID=$(docker inspect -f '{{.Id}}' oom-demo)

# Step 2: Verifica il limite nel cgroup
CGROUP_PATH="/sys/fs/cgroup/system.slice/docker-${CID}.scope"
cat $CGROUP_PATH/memory.max
# 52428800  (= 50MB)

# Step 3: Guarda i contatori OOM prima del test
cat $CGROUP_PATH/memory.events

# Step 4: Causa un OOM (genera dati casuali in RAM)
docker exec oom-demo sh -c \
  "dd if=/dev/urandom of=/dev/null bs=1M count=100 &
   dd if=/dev/urandom bs=1M count=100 | cat > /dev/null" &

# Step 5: Monitora lo stato
watch docker ps -a --filter name=oom-demo
# Lo stato diventerà "Exited (137)"

# Step 6: Verifica l'OOM kill
docker inspect oom-demo | jq '.[0].State | {OOMKilled, ExitCode}'
# "OOMKilled": true, "ExitCode": 137

cat $CGROUP_PATH/memory.events 2>/dev/null || \
  docker inspect oom-demo | jq '.[0].HostConfig.Memory'
```

### Esercizio 5 — Network Namespace Manuale

```bash
# Step 1: Crea due network namespace
sudo ip netns add ns-red
sudo ip netns add ns-blue

# Step 2: Crea un veth pair
sudo ip link add veth-red type veth peer name veth-blue

# Step 3: Assegna le estremità ai namespace
sudo ip link set veth-red netns ns-red
sudo ip link set veth-blue netns ns-blue

# Step 4: Configura gli indirizzi IP
sudo ip netns exec ns-red ip addr add 10.10.0.1/24 dev veth-red
sudo ip netns exec ns-blue ip addr add 10.10.0.2/24 dev veth-blue

# Step 5: Attiva le interfacce
sudo ip netns exec ns-red ip link set veth-red up
sudo ip netns exec ns-blue ip link set veth-blue up

# Step 6: Testa la connettività
sudo ip netns exec ns-red ping -c 3 10.10.0.2
# 3 packets transmitted, 3 received

# Step 7: Confronta con Docker
docker run -d --name net-test nginx
CPID=$(docker inspect -f '{{.State.Pid}}' net-test)
sudo nsenter --target $CPID --net ip addr
# eth0 con IP Docker (172.17.0.x)

# Cleanup
sudo ip netns del ns-red
sudo ip netns del ns-blue
```

---

## Capstone Challenge (30 min)

> **"Il Container che Uccide Se Stesso"**
>
> Un container in produzione continua a riavviarsi ogni pochi minuti senza messaggi
> di errore chiari nei log applicativi. Il team sospetta un problema di memoria.
>
> **Setup della challenge:**
> ```bash
> docker run -d \
>   --restart=always \
>   --memory=30m \
>   --memory-swap=30m \
>   --name mystery-app \
>   nginx
> ```
>
> **Il tuo compito:**
>
> 1. Identifica se il container sta venendo killato dall'OOM killer
>    (hint: `docker inspect`, `memory.events` nel cgroup)
> 2. Leggi quante volte l'OOM killer è intervenuto
> 3. Trova il limite di memoria attuale e proponi il valore corretto
>    (hint: usa `docker stats` per osservare il consumo reale)
> 4. Modifica il container per usare il limite corretto e verifica che smetta di riavviarsi
>
> **Bonus:** Riesci a simulare lo stesso comportamento usando direttamente i file cgroup,
> senza usare `docker inspect`?

---

## Riepilogo Concetti Chiave

| Tecnologia | Funzione | Tool di ispezione |
|------------|----------|-------------------|
| Namespaces | Isolamento (vista) | `lsns`, `/proc/PID/ns/`, `nsenter` |
| cgroups v2 | Limitazione (risorse) | `/sys/fs/cgroup/`, `systemd-cgtop` |
| OverlayFS | Filesystem a layer | `docker inspect`, `/var/lib/docker/overlay2/` |
| veth + bridge | Rete virtuale | `ip link`, `ip netns`, `bridge fdb` |
| Capabilities | Privilegi granulari | `capsh --print`, `getpcaps PID` |

---

## Self-Study Assignment

Completa questi tutorial interattivi su iximiuz Labs prima del prossimo incontro (60–90 min totali). Ogni tutorial ha un playground integrato dove puoi eseguire i comandi direttamente nel browser:

::card
---
:content: tutorials.container-filesystem-from-scratch
---
::

::card
---
:content: tutorials.container-networking-from-scratch
---
::

::card
---
:content: tutorials.controlling-process-resources-with-cgroups
---
::

**Letture di approfondimento:**

- [How Docker Actually Works](https://oneuptime.com/blog/post/2025-12-08-how-docker-actually-works/view) — catena di esecuzione, OCI, networking
- [Deep Dive into Docker Union Filesystem](https://martinheinz.dev/blog/44) — OverlayFS, CoW, whiteout files
- [Container Architecture: Namespaces, cgroups, OverlayFS](https://k8studio.io/tutorials/container-architecture-namespaces-cgroups-overlayfs/) — overview completo

**Per andare ancora più a fondo:**

```bash
# Leggi la documentazione del kernel sui namespaces
man 7 namespaces
man 7 cgroups
man 8 ip-netns

# Esplora la struttura cgroup del tuo sistema
systemd-cgtop          # monitor in tempo reale
systemctl status docker # vedi il cgroup di dockerd
```

---

## Risorse Aggiuntive

### Specifiche e Standard Ufficiali
- [OCI Runtime Specification](https://github.com/opencontainers/runtime-spec) — il contratto che ogni container runtime deve implementare: lifecycle, process, mounts, hooks
- [OCI Image Specification](https://github.com/opencontainers/image-spec) — formato standardizzato di immagine: manifest JSON, image config, layers tar.gz
- [OCI Distribution Specification](https://github.com/opencontainers/distribution-spec) — API REST dei container registry (push, pull, discover, referrers)
- [Linux man7: namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html) — documentazione canonica kernel Linux sui namespace: tipi, API, semantica
- [Linux man7: cgroups(7)](https://man7.org/linux/man-pages/man7/cgroups.7.html) — control groups v1 e v2 a confronto, interfacce del kernel
- [Linux Kernel Docs: Control Groups v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html) — guida ufficiale del kernel con tutti i controller disponibili (cpu, memory, io, pid)
- [Docker Engine Security](https://docs.docker.com/engine/security/) — panoramica sicurezza: namespace, cgroup, capabilities, seccomp, AppArmor

### Blog e Articoli Tecnici
- [Julia Evans — What even is a container?](https://jvns.ca/blog/2016/10/10/what-even-is-a-container/) — spiegazione chiara e accessibile con disegni a matita, ottimo punto di partenza assoluto
- [Julia Evans — How containers work: overlayfs](https://jvns.ca/blog/2019/11/18/how-containers-work--overlayfs/) — OverlayFS spiegato con esempi pratici, whiteout files, copy-on-write layer
- [Ivan Velichko — Container Learning Path (iximiuz.com)](https://iximiuz.com/en/posts/container-learning-path/) — percorso di apprendimento strutturato da zero agli internals avanzati
- [Martin Heinz — Deep Dive into Docker's Overlay Filesystem](https://martinheinz.dev/blog/44) — OverlayFS in profondità: layer ordering, benchmark, casi d'uso
- [Jérôme Petazzoni — container.training](https://container.training/) — materiale formativo completo sui container, liberamente disponibile con slide e lab interattivi
- [Brendan Gregg — Linux Performance Tools](https://www.brendangregg.com/linuxperf.html) — mappa completa degli strumenti di performance e profiling su Linux (cgroup, perf, ftrace, bpftrace)

### Video Fondamentali
- [**"Containers From Scratch" — Liz Rice (GOTO 2018)**](https://www.youtube.com/watch?v=8fi7uSYlOdc) — live coding di un container in Go in 30 minuti: fork, namespace, cgroup, pivot_root. Assolutamente imperdibile
- [**"Cgroups, namespaces, and beyond" — Jérôme Petazzoni (DockerCon 2015)**](https://www.youtube.com/watch?v=sK5i-N34im8) — il talk che ha reso comprensibili gli internals dei container a migliaia di sviluppatori
- [**"CAP_NET_RAW and ARP Spoofing in Your Cluster" — Liz Rice (KubeCon NA 2019)**](https://www.youtube.com/watch?v=f-dN8Osm8z0) — live demo di come la capability CAP_NET_RAW abilita attacchi ARP/DNS spoofing nei cluster Kubernetes: cosa togliere e cosa tenere per limitare la superficie d'attacco

### Strumenti e Repository
- [lizrice/containers-from-scratch](https://github.com/lizrice/containers-from-scratch) — codice sorgente Go del talk GOTO: container implementato in ~100 righe, da studiare riga per riga
- [p8952/bocker](https://github.com/p8952/bocker) — Docker reimplementato in 100 righe di bash, estremamente didattico
- [opencontainers/runc](https://github.com/opencontainers/runc) — runtime OCI di riferimento usato da Docker, containerd, CRI-O
- [containers/crun](https://github.com/containers/crun) — runtime OCI scritto in C, ultra-leggero (~700KB), usato da Podman
- [seccomp Profiles for Docker](https://docs.docker.com/engine/security/seccomp/) — profili seccomp predefiniti e come creare profili personalizzati con `--security-opt`

### Approfondimenti Avanzati
- [LWN.net — Namespaces in operation (serie completa)](https://lwn.net/Articles/531114/) — serie di articoli tecnici su tutti i tipi di namespace: mount, pid, network, user, cgroup, uts
- [LWN.net — A decade of container security](https://lwn.net/Articles/896235/) — evoluzione della sicurezza dei container nel kernel Linux negli ultimi 10 anni
- [Quarkslab — Analysis of runc](https://blog.quarkslab.com/analysis-of-runc.html) — analisi di sicurezza di runc: vulnerabilità storiche (CVE-2019-5736), escape, best practice attuali
