---
kind: unit
title: "Challenge — Workload e Storage"
name: workloads-challenges-unit
---

# Challenge — Incontro 4: Workload, Configurazione e Storage

Queste challenge accompagnano l'**Incontro 4** (Workload, Configurazione e Storage).
Mettono alla prova la gestione di Deployment, StatefulSet e persistenza.

---

## 1. Il Database che Dimentica: Deployment → StatefulSet

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Un PostgreSQL gira come Deployment e **perde i dati ad ogni restart**. Il tuo compito è
convertirlo in un StatefulSet con PVC persistente, gestire le credenziali tramite Secret,
e aggiungere un initContainer per il setup iniziale.

Al termine, i dati devono sopravvivere al `kubectl delete pod`.

**Cosa imparerai:**
- Le differenze fondamentali tra Deployment e StatefulSet (identità stabile, PVC per Pod)
- Come i volumeClaimTemplates creano PVC automatici per ogni replica
- Pattern di inizializzazione con initContainers

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u4-database-memory-e4cf4c71)

---

## 2. Rolling Update Senza Downtime

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Esegui un rolling update di un Deployment con **zero downtime** mentre un client curl
gira in background e verifica la disponibilità. Configura correttamente `maxSurge`,
`maxUnavailable`, e la `readinessProbe`.

**Cosa imparerai:**
- Come `maxSurge` e `maxUnavailable` controllano la velocità del rollout
- Perché la readinessProbe è essenziale per evitare traffico verso Pod non pronti
- Come verificare un rollout zero-downtime con test di carico in background

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u4-rolling-no-downtime-9ea43829)
