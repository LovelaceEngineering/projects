---
kind: challenge

title: "Container a Mano: Namespaces e pivot_root"

description: |
  Crea un ambiente containerizzato senza Docker usando solo i primitivi Linux:
  unshare per i namespace e pivot_root per isolare il filesystem.
  Capire come Docker costruisce i container dall'interno.

categories:
- linux
- containers

tags:
- namespaces
- unshare
- pivot-root
- internals

difficulty: medium

createdAt: 2026-02-23
updatedAt: 2026-02-23

cover: __static__/cover.png

playground:
  name: docker

tasks:
  init_rootfs:
    init: true
    run: |
      # Download Alpine minimal rootfs
      mkdir -p /tmp/alpine-rootfs
      curl -sL https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-minirootfs-3.19.1-x86_64.tar.gz \
        | tar xz -C /tmp/alpine-rootfs || true
      # Fallback: use docker export
      if [ ! -f /tmp/alpine-rootfs/bin/sh ]; then
        docker create --name tmp-alpine alpine:3.19 sh 2>/dev/null
        docker export tmp-alpine | tar x -C /tmp/alpine-rootfs 2>/dev/null
        docker rm tmp-alpine 2>/dev/null
      fi

  verify_new_uts_namespace:
    run: |
      # Check student created a file /tmp/container-hostname.txt with a custom hostname
      [ -f /tmp/container-hostname.txt ] || exit 1
      HOSTNAME=$(cat /tmp/container-hostname.txt | tr -d '[:space:]')
      # Must be different from the host hostname
      [ "$HOSTNAME" != "$(hostname)" ] || exit 1
      [ -n "$HOSTNAME" ] || exit 1

  verify_new_pid_namespace:
    run: |
      # Check /tmp/container-pid1.txt contains "1" (PID 1 inside namespace)
      [ -f /tmp/container-pid1.txt ] || exit 1
      PID=$(cat /tmp/container-pid1.txt | tr -d '[:space:]')
      [ "$PID" = "1" ] || exit 1
---

_Costruisci un container "a mano" usando `unshare`, `chroot`/`pivot_root` e i namespace Linux._

---

## Scenario

I container Docker sono costruiti su primitivi Linux: namespace per l'isolamento e
OverlayFS per il filesystem. In questo challenge crei un ambiente containerizzato
usando solo strumenti standard Linux, senza Docker.

Il rootfs Alpine è già stato preparato in `/tmp/alpine-rootfs`.

---

## Task 1 — Isola l'UTS Namespace (hostname)

Usa `unshare` per creare un nuovo UTS namespace e cambia il nome dell'host all'interno.
Salva il nuovo hostname in `/tmp/container-hostname.txt` dall'interno del "container":

```bash
# Crea un nuovo UTS namespace
unshare --uts bash -c '
  hostname my-container
  hostname > /tmp/container-hostname.txt
  echo "Dentro il container, hostname: $(hostname)"
  echo "Fuori il container, hostname vero: unchanged"
'
```

::simple-task
---
:tasks: tasks
:name: verify_new_uts_namespace
---
#active
In attesa del file `/tmp/container-hostname.txt` con un hostname diverso da quello dell'host...

#completed
Perfetto! Hai isolato con successo il namespace UTS.
::

::hint-box
---
:summary: Hint — UTS Namespace
---

Il namespace UTS (Unix Time-Sharing) isola hostname e domainname.
`unshare --uts` crea un nuovo namespace UTS per il processo figlio.
Le modifiche all'hostname sono visibili solo all'interno del namespace.
::

---

## Task 2 — Isola il PID Namespace

Ora crea un nuovo PID namespace. Il primo processo all'interno deve essere PID 1.
Salva il proprio PID in `/tmp/container-pid1.txt`:

```bash
unshare --pid --fork bash -c '
  echo $$ > /tmp/container-pid1.txt
  echo "Il mio PID dentro il namespace: $$"
'
```

::simple-task
---
:tasks: tasks
:name: verify_new_pid_namespace
---
#active
In attesa del file `/tmp/container-pid1.txt` contenente il PID 1...

#completed
Eccellente! Hai creato un PID namespace isolato con PID 1 come primo processo.
::

::hint-box
---
:summary: Hint — PID Namespace e --fork
---

`--fork` è necessario con `--pid` perché il processo deve essere un figlio del processo
che chiama `unshare`. Senza `--fork`, il processo corrente manterrebbe il suo PID originale
nel nuovo namespace.
::

---

## Bonus — Tutti i Namespace Insieme

Per creare un container completo con tutti i namespace isolati:

```bash
unshare --mount --uts --ipc --pid --net --fork \
  chroot /tmp/alpine-rootfs /bin/sh -c '
    mount -t proc proc /proc
    hostname full-container
    echo "PID: $$, Hostname: $(hostname)"
  '
```

::hint-box
---
:summary: Approfondimento — pivot_root vs chroot
---

`pivot_root` è più sicuro di `chroot` perché cambia completamente la root del
filesystem mount namespace, impedendo escape via `chroot` ricorsivi. Docker usa
`pivot_root` internamente. La differenza: `chroot` cambia solo la radice dei path,
mentre `pivot_root` riorganizza il mount namespace.
::
