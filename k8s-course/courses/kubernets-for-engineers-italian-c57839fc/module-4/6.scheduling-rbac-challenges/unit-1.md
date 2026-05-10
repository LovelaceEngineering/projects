---
kind: unit
title: "Challenge — Scheduling, RBAC e Sicurezza"
name: scheduling-rbac-challenges-unit
---

# Challenge — Incontro 6: Scheduling, RBAC e Sicurezza

Queste challenge accompagnano l'**Incontro 6** (Scheduling, RBAC e Sicurezza).
Mettono alla prova la capacità di progettare scheduling e sicurezza in scenari realistici.

---

## 1. RBAC Least Privilege: Token Compromesso

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Un ServiceAccount token è stato **compromesso**. Analizza i permessi eccessivi
con `kubectl auth can-i --list`, riduci i privilegi senza rompere l'applicazione,
e verifica che il principio del minimo privilegio sia rispettato.

**Cosa imparerai:**
- Come auditare i permessi di un ServiceAccount con `can-i` e RBAC lookup
- La differenza tra Role (namespace-scoped) e ClusterRole (cluster-wide)
- Come ridurre i permessi incrementalmente senza causare downtime

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u6-rbac-least-privilege-e1d78bb9)

---

## 2. MultiZone Spread: TopologySpreadConstraints

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Distribuisci **6 repliche** di un Deployment uniformemente in **3 zone di disponibilità**
usando `topologySpreadConstraints`. Verifica che nessuna zona abbia più del doppio
delle repliche di un'altra — la chiave per l'alta disponibilità.

**Cosa imparerai:**
- Come funziona `maxSkew` e la differenza tra `DoNotSchedule` e `ScheduleAnyway`
- La relazione tra node label `topology.kubernetes.io/zone` e lo scheduling
- Come verificare la distribuzione con `kubectl get pods -o wide` + filtri per nodo

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u6-multizone-spread-87594f0a)
