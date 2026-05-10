---
kind: unit

title: Container Privilegiati e Capabilities

name: container-privilegiati-pratica
---

## Obiettivi

Al termine di questa lezione sarai in grado di:

- Capire cosa sono le Linux capabilities e come Docker le gestisce
- Rimuovere e aggiungere capabilities singole a un container
- Applicare il principio del minimo privilegio ai container

---

## Linux Capabilities

Storicamente Linux divideva i privilegi in due categorie: **root** (può fare tutto) e **non-root** (non può fare quasi nulla). Le **capabilities** spezzano i poteri di root in unità granulari, permettendo di concedere solo i privilegi strettamente necessari.

Docker rimuove la maggior parte delle capabilities per default, ma ne lascia alcune. Puoi controllare ulteriormente quali capabilities sono disponibili.

---

## Rimuovere una Capability

Crea un container che non può eseguire `chown` (cambiare proprietario dei file):

```bash
docker run --rm -it --cap-drop=CHOWN busybox chown -R nobody /
# chown: /bin/true: Operation not permitted
# chown: /bin/getty: Operation not permitted
# ...
```

Il container è in esecuzione come root, ma non ha il privilegio `CAP_CHOWN` — il kernel blocca l'operazione.

---

## Rimuovere Tutte le Capabilities e Aggiungere Solo Quelle Necessarie

L'approccio più sicuro è partire da zero e aggiungere solo ciò che serve:

```bash
docker run -d \
  --cap-drop=all \
  --cap-add=setuid \
  --cap-add=setgid \
  busybox top
```

Questo container ha solo `CAP_SETUID` e `CAP_SETGID` — il minimo indispensabile per il suo funzionamento.

---

## Capabilities Comuni

| Capability | Cosa permette |
|-----------|---------------|
| `CAP_CHOWN` | Cambiare proprietario dei file |
| `CAP_NET_BIND_SERVICE` | Bind su porte < 1024 |
| `CAP_NET_RAW` | Usare socket raw (ping, ARP) |
| `CAP_SETUID` / `CAP_SETGID` | Cambiare UID/GID del processo |
| `CAP_SYS_ADMIN` | Operazioni di amministrazione (mount, ecc.) — **molto pericolosa** |
| `CAP_SYS_PTRACE` | Debug di altri processi |

---

## Container Privilegiati

Un container con `--privileged` ottiene **tutte** le capabilities e accesso diretto ai device dell'host:

```bash
docker run --privileged -it busybox sh
```

> **Attenzione:** I container privilegiati non sono raccomandati per l'uso in produzione. Un container privilegiato ha essenzialmente gli stessi poteri del processo host — l'isolamento è quasi azzerato. Usare solo quando strettamente necessario (es. container di sistema per gestione nodi).

---

## Verificare le Capabilities di un Container

```bash
# Avvia un container
docker run -d --name cap-test --cap-drop=all --cap-add=net_bind_service nginx

# Ispeziona le capabilities configurate
docker inspect cap-test | jq '.[0].HostConfig.CapAdd'
# ["NET_BIND_SERVICE"]

docker inspect cap-test | jq '.[0].HostConfig.CapDrop'
# ["ALL"]
```

---

## Oltre le Capabilities: Seccomp e AppArmor

Le capabilities controllano **quali poteri** ha un processo, ma non sono l'unico meccanismo di sicurezza. Docker usa tre livelli di isolamento complementari:

| Meccanismo | Cosa controlla | Granularità |
|-----------|---------------|-------------|
| **Capabilities** | Poteri privilegiati del processo (es. bind porte, mount) | ~40 capabilities Linux |
| **Seccomp** | Quali **syscall** il processo può eseguire | ~300+ syscall filtrabili |
| **AppArmor / SELinux** | Accesso a **file, rete, mount** specifici | Path-based (AppArmor) o label-based (SELinux) |

### Seccomp (Secure Computing Mode)

Docker applica un **profilo seccomp di default** che blocca ~44 syscall pericolose (come `reboot`, `mount`, `kexec_load`). Questo è attivo automaticamente.

```bash
# Verifica che seccomp è attivo
docker run --rm busybox grep Seccomp /proc/self/status
# → Seccomp:   2  (2 = filter mode, profilo attivo)

# Avvia un container SENZA seccomp (pericoloso!)
docker run --security-opt seccomp=unconfined busybox

# Usa un profilo seccomp personalizzato
docker run --security-opt seccomp=my-profile.json nginx
```

### AppArmor

Su sistemi Ubuntu/Debian, Docker applica automaticamente un profilo AppArmor (`docker-default`) che limita l'accesso a `/proc`, `/sys` e mount operations.

```bash
# Verifica il profilo AppArmor attivo
docker inspect --format='{{.AppArmorProfile}}' <container_id>
# → docker-default

# Disabilita AppArmor per un container (non consigliato)
docker run --security-opt apparmor=unconfined nginx
```

> **In Kubernetes:** il campo `securityContext.seccompProfile` nel Pod spec controlla seccomp. Il valore `RuntimeDefault` applica il profilo di default del container runtime — equivalente al comportamento Docker. AppArmor si configura tramite annotazioni sul Pod.
