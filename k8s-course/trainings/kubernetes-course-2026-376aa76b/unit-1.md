---
kind: unit

title: "Incontro 1 — Sotto il Cofano: Internals di Docker"

name: unit-1

createdAt: 2026-02-23
updatedAt: 2026-02-23

tutorials:
  container_filesystem_from_scratch: {}
  container_networking_from_scratch: {}
  controlling_process_resources_with_cgroups: {}

challenges:
  u1_cgroup_oom_detective_b68e283e: {}
  u1_container_from_scratch_17f85009: {}
---

## Obiettivi dell'incontro

Al termine di questo incontro i partecipanti saranno in grado di:

- Spiegare i 7 Linux namespaces e come Docker li usa per isolare i container
- Leggere le metriche cgroup v2 di un container in esecuzione e diagnosticare un OOM kill
- Navigare la struttura OverlayFS di un container e capire il copy-on-write
- Creare un network namespace con veth pair e capire come i container comunicano

---

## Teoria (50 min)

### Linux Namespaces

I namespaces sono il meccanismo del kernel Linux che permette di isolare le risorse tra processi.
Docker usa 7 tipi di namespace:

| Namespace | Flag | Isola |
|-----------|------|-------|
| Mount (mnt) | `CLONE_NEWNS` | Filesystem mounts |
| Process ID (pid) | `CLONE_NEWPID` | Visibilità dei PID |
| Network (net) | `CLONE_NEWNET` | Interfacce, tabelle routing, iptables |
| IPC | `CLONE_NEWIPC` | Code di messaggi, semafori condivisi |
| UTS | `CLONE_NEWUTS` | Hostname e domainname |
| User | `CLONE_NEWUSER` | UID/GID mapping |
| Cgroup | `CLONE_NEWCGROUP` | Vista dell'albero cgroup |

Le syscall principali sono `clone(2)` (crea processo in nuovo namespace) e `unshare(2)`
(sposta processo corrente in nuovo namespace).

### cgroups v2

I control groups (cgroups) limitano e misurano le risorse dei processi. Docker usa cgroups v2:

- `memory.max` — limite massimo di RAM; superarlo attiva l'OOM killer
- `memory.events` — contatore degli OOM kills
- `cpu.max` — quota CPU (es. `100000 100000` = 1 core)

### OverlayFS

OverlayFS è il driver di storage di default di Docker. Monta tre directory:

- `lowerdir` — layer read-only (l'immagine base, stacked)
- `upperdir` — layer read-write (le modifiche del container)
- `merged` — la vista unificata che vede il processo nel container

La prima scrittura su un file di `lowerdir` lo copia in `upperdir` (copy-on-write).

---

## Hands-on Guidato (90 min)

### Esercizio 1 — Container "a mano" con `unshare` e `pivot_root`

Creare un ambiente containerizzato senza Docker, usando solo strumenti standard Linux:

```bash
# Crea un bundle rootfs minimo
mkdir -p /tmp/mycontainer/rootfs
# ... (decomprime un'immagine Alpine)

# Entra in namespace isolati
unshare --mount --uts --ipc --pid --net --fork --user --map-root-user \
  chroot /tmp/mycontainer/rootfs /bin/sh
```

### Esercizio 2 — OOM Detection con cgroups

```bash
# Avvia container con memory limit
docker run -d --memory=50m --name mem-test nginx

# Trova il cgroup path
cat /proc/$(docker inspect -f '{{.State.Pid}}' mem-test)/cgroup

# Leggi le metriche
cat /sys/fs/cgroup/system.slice/docker-<id>.scope/memory.max
cat /sys/fs/cgroup/system.slice/docker-<id>.scope/memory.events
```

### Esercizio 3 — Esplorazione OverlayFS

```bash
# Ispeziona il layer structure di un'immagine
docker inspect nginx | jq '.[0].GraphDriver'

# Naviga i layer sul filesystem
ls /var/lib/docker/overlay2/
mount | grep overlay
```

### Esercizio 4 — Network Namespace con veth pair

```bash
# Crea due namespace
ip netns add ns1
ip netns add ns2

# Crea un veth pair e assegna le estremità
ip link add veth1 type veth peer name veth2
ip link set veth1 netns ns1
ip link set veth2 netns ns2

# Configura IP e testa connettività
ip netns exec ns1 ip addr add 10.0.0.1/24 dev veth1
ip netns exec ns2 ip addr add 10.0.0.2/24 dev veth2
ip netns exec ns1 ping 10.0.0.2
```

---

## Capstone Challenge (30 min)

> **"Il Container che Uccide Se Stesso"**
>
> Un container in produzione continua a riavviarsi senza messaggi di errore chiari.
> Il tuo compito: trovare la causa analizzando i cgroup, leggere `memory.events`,
> e proporre il fix (memory limit corretto, ottimizzazione dell'app, o entrambi).

---

## Self-Study Assignment

Completa questi materiali su iximiuz Labs prima del prossimo incontro (60–90 min totali):

::card
---
:content: tutorials.container_filesystem_from_scratch
---
::

::card
---
:content: tutorials.container_networking_from_scratch
---
::

::card
---
:content: tutorials.controlling_process_resources_with_cgroups
---
::
