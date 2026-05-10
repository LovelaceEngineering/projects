---
kind: unit
title: "Challenge — Architettura Kubernetes"
name: k8s-architecture-challenges-unit
---

# Challenge — Incontro 3: Architettura Kubernetes

Queste challenge accompagnano l'**Incontro 3** (L'Architettura di Kubernetes: Da Zero a Pod).
Approfondiscono la comprensione dell'API server e del ciclo di vita dei Pod.

---

## 1. API Explorer: Kubernetes via curl e kubectl -v=8

**Difficoltà:** easy | **Tempo stimato:** 20–30 min

Interagisci con l'API server Kubernetes **direttamente via curl** e usa
`kubectl --v=8` per rivelare le REST call sottostanti a ogni comando.
Scoprirai che kubectl non è altro che un client HTTP con un po' di sugar.

**Cosa imparerai:**
- La struttura delle URL dell'API Kubernetes (`/api/v1/namespaces/.../pods`)
- Come autenticarsi con bearer token e certificati client
- Come leggere il verbose output di kubectl per capire cosa succede davvero

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u3-api-explorer-90caf80a)

---

## 2. Il Quartetto dei Pod Rotti

**Difficoltà:** hard | **Tempo stimato:** 30–45 min

Quattro Pod in stati di errore diversi attendono di essere riparati:
**CrashLoopBackOff**, **Pending**, **ImagePullBackOff**, e **OOMKilled**.

Diagnostica e correggi ciascuno entro 30 minuti usando `kubectl describe`,
`kubectl logs`, e `kubectl debug`.

**Cosa imparerai:**
- Le differenze tra gli stati di errore dei Pod e come distinguerli
- Il workflow di debugging sistematico: Events → Logs → Exec/Debug
- I motivi più comuni per cui un Pod non parte e come risolverli rapidamente

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u3-pod-quartet-debug-4c480eab)
