---
kind: unit
title: "Challenge — Internals di Docker"
name: container-internals-challenges-unit
---

# Challenge — Incontro 1: Internals di Docker

Queste challenge accompagnano l'**Incontro 1** (Sotto il Cofano: Internals di Docker).
Mettono alla prova la comprensione dei primitivi Linux che rendono possibili i container.

---

## 1. Container a Mano: Namespaces e pivot_root

**Difficoltà:** hard | **Tempo stimato:** 45–60 min

Crea un ambiente containerizzato **senza Docker**, usando solo i primitivi Linux:
`unshare` per i namespace e `pivot_root` per isolare il filesystem.

Questo esercizio ti porta "sotto il cofano" per capire esattamente cosa fa Docker
quando lancia un container — dalla creazione dei namespace PID/NET/MNT
fino all'isolamento del root filesystem.

**Cosa imparerai:**
- Come funzionano `unshare` e i Linux namespace in pratica
- La differenza tra `chroot` e `pivot_root`
- Perché il PID 1 nel container è diverso dal PID host

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u1-container-from-scratch-17f85009)

---

## 2. Il Detective dei Cgroup: OOM Diagnostics

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Un container in produzione continua a riavviarsi senza messaggi di errore chiari.
Il tuo compito è diagnosticare l'OOM kill usando i **cgroup v2**: leggere `memory.events`,
analizzare `memory.max` vs `memory.current`, e correggere il memory limit.

**Cosa imparerai:**
- Come leggere i file del cgroup v2 (`/sys/fs/cgroup/...`)
- La differenza tra OOM kill del kernel e OOM kill di Docker
- Come impostare limiti di memoria realistici basandoti sul profilo di consumo

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u1-cgroup-oom-detective-b68e283e)
