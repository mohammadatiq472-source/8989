# 04 - Heartbeat and Failover

## 1. Scope

This document covers the session autonomy boundary between human control and AI control in the Unity-first phase.

Relevant runtime entrypoints:

- `POST /api/session/join`
- `POST /api/session/heartbeat`
- `POST /api/session/autonomy`
- `GET /api/session/status`
- `GET /api/session/runtime`
- `GET /api/session/metrics`
- `POST /api/session/leave`
- `npm run start:clock`
- `npm run test:session:manager`

## 2. Runtime Defaults and Recommended Values

Current server defaults in `SessionManager`:

- `heartbeatTimeoutMs = 30_000`
- `staleSessionTtlMs = 10 * 60_000`

Recommended operational values for the Unity-first client:

- Heartbeat interval: `10s`
- Client-side reconnect warning: after `20s` of silence
- Server-side failover threshold: `30s` without a heartbeat
- Stale prune threshold: keep the default `10m` unless there is a strong reason to shorten it

Tolerance rule of thumb:

- `1` missed heartbeat is normal
- `2` missed heartbeats means the connection is degraded but should still be recoverable
- `3` missed heartbeats trigger `L1_assigned -> L2_delegated`

Practical sizing rule:

- `heartbeatTimeoutMs >= 3 * heartbeatInterval + jitterBudget`
- `staleSessionTtlMs >= heartbeatTimeoutMs + 60_000`

For the current codebase, `10s / 30s / 10m` is the recommended default set.

## 3. Autonomy State Machine

The session autonomy flow is intentionally simple and deterministic:

```text
L1_assigned  --(heartbeat missing for >= timeout)-->  L2_delegated
L2_delegated  --(valid heartbeat)-------------------->  L1_assigned
L3_negotiated  --(manual set)----------------------->  L3_negotiated
L3_negotiated  --(valid heartbeat, current code)---->  L1_assigned
any state      --(stale TTL reached)---------------->  pruned
```

Notes:

- `joinSession()` creates the session in `L1_assigned`.
- `heartbeat()` updates `lastHeartbeat` and restores `L1_assigned` immediately if the session was not already in that state.
- `sweepAllTimeouts()` is the function that performs timeout-based failover.
- `getSessionStatus()`, `getSessionMetrics()`, `getSessionRuntime()`, `heartbeat()`, `joinSession()`, `leaveSession()`, and `setSessionAutonomyLevel()` all pass through the sweep path, so state converges even without a dedicated clock loop.

## 4. Failover Timeline

### 4.1 Normal L1 Operation

1. Player joins.
2. Session starts in `L1_assigned`.
3. Player sends a heartbeat every `10s`.
4. The session remains online and human-controlled.

Expected result:

- `GET /api/session/runtime` shows `autonomyLevel = L1_assigned`
- `controlMode = human_assigned`
- `GET /api/session/status` shows the faction is not in `aiControlledFactions`

### 4.2 Timeout Downgrade to L2

1. Player stops sending heartbeats.
2. `lastHeartbeat` ages past `heartbeatTimeoutMs`.
3. The next sweep flips the session from `L1_assigned` to `L2_delegated`.
4. The faction becomes AI-controlled for strategic execution.

Expected result:

- `GET /api/session/runtime` shows `autonomyLevel = L2_delegated`
- `controlMode = ai_delegated`
- `GET /api/session/status` marks the player entry as offline and the faction as AI-controlled
- `GET /api/session/metrics` increments `delegatedSessions`

### 4.3 Recovery Back to L1

1. Player reconnects.
2. Client sends a valid heartbeat token.
3. `heartbeat()` updates `lastHeartbeat`.
4. The session is restored to `L1_assigned` immediately.

Important detail:

- If the session has already exceeded `staleSessionTtlMs`, it is pruned instead of recovered.
- In that case the token becomes invalid and the player must rejoin with `POST /api/session/join`.

Expected result:

- `GET /api/session/runtime` shows `autonomyLevel = L1_assigned`
- `controlMode = human_assigned`
- `GET /api/session/status` removes the faction from `aiControlledFactions`

### 4.4 Manual Switch to L3

Manual L3 is an explicit operator action, not a timeout event.

1. Operator calls `POST /api/session/autonomy`.
2. Request body sets `level = L3_negotiated`.
3. The session enters negotiated mode immediately.
4. Runtime and status views report `ai_negotiated`.

Current implementation caveat:

- The next valid heartbeat will reset the session back to `L1_assigned`.
- That means L3 is best treated as a short negotiation window, not a sticky long-lived state.
- If product requirements change and L3 must persist across heartbeats, the session logic needs an explicit preservation rule.

Expected result:

- `GET /api/session/runtime` shows `autonomyLevel = L3_negotiated`
- `controlMode = ai_negotiated`
- A subsequent heartbeat returns the session to `L1_assigned` under current code

## 5. Recommended Fault Tolerance

### Client-side behavior

- Send heartbeat every `10s`.
- Add small jitter, for example `+-1s`, to avoid synchronized bursts when many players reconnect.
- Mark the session as "degraded" after `20s` without acknowledgment.
- Show reconnect UI after `25s` without acknowledgment.
- Do not locally flip gameplay control state until the server confirms `L2_delegated` or `L1_assigned`.

### Server-side behavior

- Keep `heartbeatTimeoutMs` at `30_000` for the current build.
- Keep `staleSessionTtlMs` at `10m` so temporary disconnects remain recoverable.
- Use the status/runtime endpoints as the source of truth, not client assumptions.
- Prefer deterministic sweeps over ad hoc per-client timers.

### Failure modes to tolerate

- One dropped packet: acceptable.
- Two dropped heartbeats: still recoverable.
- More than three missed heartbeats: degrade to L2 and let AI take over.
- Stale session beyond TTL: prune and require a fresh join.

## 6. Reproducible Experiment

### 6.1 Formal validation chain

Use the repository-native session manager test first:

```powershell
npm run test:session:manager
```

This covers:

- L1 to L2 timeout transition
- heartbeat recovery back to L1
- L3 manual switch
- stale session pruning
- token validation and metrics

### 6.2 Live runtime reproduction

1. Start the clock-enabled server:

```powershell
npm run start:clock
```

2. Join the player faction:

```powershell
$join = @{ factionId = 'player'; playerName = 'Alpha' } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/session/join' -ContentType 'application/json' -Body $join
$session
```

3. Send a heartbeat and confirm L1:

```powershell
$hb = @{ token = $session.token } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/session/heartbeat' -ContentType 'application/json' -Body $hb
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/session/runtime'
```

4. Stop heartbeats for `31s` and check failover:

```powershell
Start-Sleep -Seconds 31
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/session/status'
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/session/runtime'
```

Expected result:

- `player.autonomyLevel = L2_delegated`
- `controlMode = ai_delegated`

5. Send a heartbeat again and confirm recovery to L1:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/session/heartbeat' -ContentType 'application/json' -Body $hb
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/session/runtime'
```

6. Manually switch to L3 and observe negotiated mode:

```powershell
$l3 = @{ token = $session.token; level = 'L3_negotiated' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/session/autonomy' -ContentType 'application/json' -Body $l3
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/session/runtime'
```

7. Send one more heartbeat and observe the current implementation returning to L1:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/session/heartbeat' -ContentType 'application/json' -Body $hb
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/session/runtime'
```

## 7. Acceptance Criteria

- Heartbeat frequency is explicit and documented.
- L1 timeout failover to L2 is deterministic.
- A valid heartbeat restores L1.
- Manual L3 switching is documented, including the current heartbeat override caveat.
- The document includes a runnable validation chain.
