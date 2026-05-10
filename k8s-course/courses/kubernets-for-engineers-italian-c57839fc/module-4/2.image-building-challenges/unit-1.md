---
kind: unit
title: "Challenge — Image Building"
name: image-building-challenges-unit
---

# Challenge — Incontro 2: Image Building

Queste challenge accompagnano l'**Incontro 2** (Immagini Come Professionisti).
Mettono alla prova le skill di ottimizzazione Dockerfile e gestione dei registry.

---

## 1. Dockerfile Diet: Da 800MB a sotto 20MB

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Parti da un Dockerfile naif che produce un'immagine da **~800MB** e risolvi
4 problemi distinti: peso eccessivo, processo che gira come root, build artifacts
rimasti nell'immagine finale, e una secret hardcodata nel layer history.

L'immagine finale deve stare **sotto 20MB**, girare come utente non-root,
e non avere secret visibili nella history.

**Cosa imparerai:**
- Multi-stage build per separare build e runtime
- Immagini distroless e scratch per ridurre la superficie d'attacco
- Come le secret nei layer Docker restano nella history anche dopo `RUN rm`

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u2-dockerfile-diet-f1ddd7e6)

---

## 2. Registry Privato: Setup e Integrazione Containerd

**Difficoltà:** easy | **Tempo stimato:** 20–30 min

Configura un **registry Docker privato** locale, fai push di un'immagine,
e configura containerd per usarlo come mirror. Confronta il comportamento
di `docker pull` vs `nerdctl pull` per capire le differenze tra i runtime.

**Cosa imparerai:**
- Come funziona il registry OCI (API v2) sotto il cofano
- Configurazione di containerd per registry mirror e insecure registries
- La differenza pratica tra Docker CLI e nerdctl/containerd

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u2-private-registry-c8dcfe79)
