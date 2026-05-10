---
kind: challenge

title: "Il Detective dei Cgroup: OOM Diagnostics"

description: |
  Un container in produzione continua a riavviarsi senza messaggi di errore chiari.
  Usa i cgroup v2 per diagnosticare l'OOM kill, leggere memory.events, e correggere il memory limit.

categories:
- linux
- containers

tags:
- cgroups
- oom
- docker
- memory

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: docker

tasks:
  init_scenario:
    init: true
    run: |
      # Start a container with tight memory limit that will OOM
      docker run -d \
        --name mem-hog \
        --memory=32m \
        --restart=always \
        polinux/stress \
        stress --vm 1 --vm-bytes 64M --vm-hang 0 || true

  verify_found_oom:
    run: |
      # Check student has written the oom_kill count to /tmp/oom-report.txt
      [ -f /tmp/oom-report.txt ] || exit 1
      grep -q "oom_kill" /tmp/oom-report.txt || exit 1

  verify_fixed_container:
    run: |
      # Check a fixed container is running with memory >= 96m
      MEM=$(docker inspect mem-hog-fixed 2>/dev/null \
            | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['HostConfig']['Memory'])" 2>/dev/null || echo 0)
      [ "$MEM" -ge 96000000 ] || exit 1
      STATUS=$(docker inspect -f '{{.State.Status}}' mem-hog-fixed 2>/dev/null || echo "missing")
      [ "$STATUS" = "running" ] || exit 1
---

_Un container sta crashando silenziosamente. Il tuo compito: trovare la causa nei cgroup e correggere il memory limit._

---

## Scenario

Il container `mem-hog` è stato deployato con un memory limit troppo basso.
Continua a essere ucciso dall'OOM killer del kernel ma Docker lo riavvia automaticamente,
rendendo difficile diagnosticare il problema dai soli log.

Il tuo obiettivo è:
1. Trovare e leggere il file `memory.events` del container nel filesystem cgroup v2
2. Documentare il numero di OOM kills in `/tmp/oom-report.txt`
3. Riavviare il container con un memory limit corretto (≥ 96m) e nome `mem-hog-fixed`

---

## Task 1 — Leggi memory.events

Trova il cgroup del container `mem-hog` e leggi il file `memory.events`.

```bash
# Trova il PID del container
PID=$(docker inspect -f '{{.State.Pid}}' mem-hog)

# Trova il cgroup path
cat /proc/$PID/cgroup

# Leggi memory.events (cgroup v2)
# Il path tipico è /sys/fs/cgroup/system.slice/docker-<FULL_ID>.scope/memory.events
CGROUP_PATH=$(cat /proc/$PID/cgroup | grep -oP '(?<=0::).*')
cat /sys/fs/cgroup${CGROUP_PATH}/memory.events
```

Scrivi il valore di `oom_kill` in `/tmp/oom-report.txt`:

```bash
CGROUP_PATH=$(cat /proc/$(docker inspect -f '{{.State.Pid}}' mem-hog)/cgroup | grep -oP '(?<=0::).*')
grep oom_kill /sys/fs/cgroup${CGROUP_PATH}/memory.events > /tmp/oom-report.txt
```

::simple-task
---
:tasks: tasks
:name: verify_found_oom
---
#active
In attesa del file `/tmp/oom-report.txt` con il valore `oom_kill`...

#completed
Perfetto! Hai trovato le prove dell'OOM kill nei cgroup.
::

::hint-box
---
:summary: Hint — Come trovare il path cgroup
---

Con cgroup v2, ogni container ha un path nel formato:
`/sys/fs/cgroup/system.slice/docker-<ID>.scope/`

Puoi trovare l'ID completo con:
```bash
docker inspect -f '{{.Id}}' mem-hog
```
::

---

## Task 2 — Correggi il Memory Limit

Ora che hai diagnosticato il problema, avvia una versione corretta del container con almeno 96m di memoria:

```bash
docker run -d \
  --name mem-hog-fixed \
  --memory=128m \
  polinux/stress \
  stress --vm 1 --vm-bytes 64M --vm-hang 0
```

::simple-task
---
:tasks: tasks
:name: verify_fixed_container
---
#active
In attesa del container `mem-hog-fixed` con memory limit ≥ 96m in stato running...

#completed
Ottimo! Il container `mem-hog-fixed` è in esecuzione con un memory limit adeguato.
::

::hint-box
---
:summary: Hint — Perché 96m?
---

L'applicazione `stress` sta cercando di allocare 64MB di heap più overhead del runtime.
Un limite di 96m–128m è sufficiente. Nella realtà, si farebbe profiling dell'applicazione
per trovare il limite ottimale.
::
