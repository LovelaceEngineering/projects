# Challenge — Incontro 5: Networking

Queste challenge accompagnano l'**Incontro 5** (Networking: Services, DNS e Ingress).
Mettono alla prova la comprensione del networking Kubernetes in scenari realistici.

---

## 1. Il Microservizio Disperso: Debugging 3-Tier

**Difficoltà:** hard | **Tempo stimato:** 45–60 min

Un'architettura 3-tier (frontend → api → database) non funziona. Ci sono **errori multipli**
nascosti: un selector mismatch su un Service, un record DNS errato, e una NetworkPolicy
troppo restrittiva che blocca traffico legittimo.

Trova e correggi tutti i problemi per far funzionare l'intera catena.

**Cosa imparerai:**
- Come tracciare il traffico attraverso i layer Service → Endpoint → Pod
- Debugging DNS con `nslookup` e `dig` dall'interno dei Pod
- Come le NetworkPolicy possono bloccare traffico in modi non ovvi

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u5-microservice-detective-69713295)

---

## 2. NetworkPolicy Lockdown: Isolamento Database

**Difficoltà:** medium | **Tempo stimato:** 30–45 min

Implementa una strategia **default-deny** e allowlist per isolare un database PostgreSQL.
Solo i Pod con label `role: api` devono poter connettersi al database sulla porta 5432.
Tutti gli altri tentativi di connessione devono essere bloccati.

**Cosa imparerai:**
- Come funziona il default-deny con una NetworkPolicy vuota su `podSelector: {}`
- La differenza tra ingress e egress policy e quando servono entrambe
- Come testare l'isolamento di rete con `kubectl exec` e `nc`/`curl`

👉 [Apri la challenge](https://labs.iximiuz.com/challenges/u5-networkpolicy-lockdown-b43beea1)
