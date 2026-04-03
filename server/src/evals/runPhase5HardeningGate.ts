import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInitialWorldState } from '../../../shared/domain/scenario'
import type { NationalAgendaWindow } from '../../../shared/contracts/commBus'

type GateResult = {
  name: string
  passed: boolean
  details: Record<string, unknown>
}

type GateReport = {
  runId: string
  generatedAt: string
  gates: GateResult[]
  passed: boolean
}

function createRunDir() {
  const runId = `phase5_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'phase5-hardening', runId)
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}

function buildDeadlockAgenda(tick: number, primaryFactionId: string): NationalAgendaWindow {
  return {
    id: `national_agenda_gate_${tick}`,
    tick,
    optionCountIn: 1,
    optionCountOut: 1,
    options: [
      {
        id: `national_agenda_option_gate_${tick}_1`,
        tick,
        intentKey: 'gate_deadlock_intent',
        title: 'Gate deadlock intent',
        summary: 'P1 diplomacy intent expected to stall quorum and trigger deferred timeout.',
        priority: 'P1',
        sourceDomainIds: [`domain:${primaryFactionId}`],
        sourceFactionIds: [primaryFactionId],
        supportingAiPlayerIds: ['ai_player_gate_1'],
        candidateIntents: ['gate_deadlock_candidate'],
        recommendedAction: 'diplomacy',
        confidence: 0.75,
      },
    ],
    summary: 'Phase5 gate agenda for deadlock prevention.',
    generatedAt: Date.now(),
  }
}

async function runDeadlockGate(): Promise<GateResult> {
  const world = createInitialWorldState()
  const primaryFactionId = resolvePrimaryFactionId(world)
  const agenda = buildDeadlockAgenda(world.tick, primaryFactionId)

  const courtStore = await import('../agents/court/CourtStore')
  const courtService = await import('../agents/court/CourtService')

  courtStore.resetCourtSessionStoreForTests()

  const sessions = [
    courtService.runCourtSession({ world, nationalAgenda: agenda, maxProposals: 1 }),
    courtService.runCourtSession({ world, nationalAgenda: agenda, maxProposals: 1 }),
    courtService.runCourtSession({ world, nationalAgenda: agenda, maxProposals: 1 }),
  ]

  const decisions = sessions.map((session) => session.resolutions[0]?.decision)
  const directives = sessions.map((session) => session.resolutions[0]?.executionDirective ?? null)

  const passed =
    decisions[0] === 'deferred' &&
    decisions[1] === 'deferred' &&
    decisions[2] === 'rejected' &&
    typeof directives[2] === 'string' &&
    directives[2].startsWith('expire:gate_deadlock_intent:deferred_timeout')

  return {
    name: 'deadlock_gate',
    passed,
    details: {
      expected: ['deferred', 'deferred', 'rejected'],
      actual: decisions,
      directives,
      historyCount: courtStore.getCourtSessions(8).length,
    },
  }
}

async function runVoteIdentityGate(): Promise<GateResult> {
  const world = createInitialWorldState()
  const primaryFactionId = resolvePrimaryFactionId(world)
  const agenda = buildDeadlockAgenda(world.tick, primaryFactionId)
  const courtService = await import('../agents/court/CourtService')

  const cleanSession = courtService.simulateCourtSession({
    world,
    nationalAgenda: agenda,
    maxProposals: 1,
  })
  const cleanAudit = courtService.auditCourtSessionIdentity(cleanSession)

  const tamperedSession = structuredClone(cleanSession)
  if (tamperedSession.votes.length > 0) {
    tamperedSession.votes[0] = {
      ...tamperedSession.votes[0],
      seatId: 'seat_human_spoof_identity_gate',
    }
  }
  const tamperedAudit = courtService.auditCourtSessionIdentity(tamperedSession)

  const passed = cleanAudit.ok && !tamperedAudit.ok

  return {
    name: 'vote_identity_gate',
    passed,
    details: {
      cleanAudit,
      tamperedAudit,
      seatCount: cleanSession.seats.length,
      voteCount: cleanSession.votes.length,
    },
  }
}

function createCivilEntry(tick: number, idx: number, factionId: string) {
  return {
    tick,
    type: 'execution_outcome' as const,
    title: `Gate memory entry ${idx}`,
    summary: `Phase5 anti-tamper gate entry ${idx}`,
    relatedIds: [`gate_rel_${idx}`],
    factionIds: [factionId],
    responsibilities: [
      {
        seatId: `seat_human_${factionId}`,
        role: 'executor' as const,
        weight: 1,
      },
    ],
    metadata: {
      gate: 'phase5',
      index: idx,
    },
  }
}

async function runTamperChainGate(memoryPath: string): Promise<GateResult> {
  const civilStore = await import('../agents/memory/CivilMemoryStore')

  civilStore.resetCivilMemoryStoreForTests()

  const world = createInitialWorldState()
  const tick = world.tick
  const primaryFactionId = resolvePrimaryFactionId(world)
  civilStore.appendCivilMemoryEntry(createCivilEntry(tick, 1, primaryFactionId))
  civilStore.appendCivilMemoryEntry(createCivilEntry(tick, 2, primaryFactionId))
  civilStore.appendCivilMemoryEntry(createCivilEntry(tick, 3, primaryFactionId))
  await civilStore.flushCivilMemoryPersist()

  const beforeTamper = civilStore.verifyCivilMemoryIntegrity()

  const ledger = JSON.parse(readFileSync(memoryPath, 'utf8')) as Array<Record<string, unknown>>
  if (ledger.length > 0) {
    ledger[0] = {
      ...ledger[0],
      summary: 'tampered_by_phase5_gate',
    }
  }
  writeFileSync(memoryPath, JSON.stringify(ledger, null, 2), 'utf8')

  civilStore.resetCivilMemoryStoreForTests()
  const afterTamper = civilStore.verifyCivilMemoryIntegrity()

  const passed = beforeTamper.ok && !afterTamper.ok

  return {
    name: 'anti_tamper_chain_gate',
    passed,
    details: {
      beforeTamper,
      afterTamper,
      inspectedEntries: ledger.length,
    },
  }
}

function buildExitCode(gates: GateResult[]) {
  return gates.every((gate) => gate.passed) ? 0 : 1
}

function resolvePrimaryFactionId(world: ReturnType<typeof createInitialWorldState>): string {
  const factionIds = Object.keys(world.factions).filter((factionId) => factionId !== 'neutral')
  if (factionIds.length === 0) {
    return 'neutral'
  }
  return factionIds[0]
}

async function main() {
  const { runId, runDir } = createRunDir()
  const courtPath = join(runDir, 'court_sessions.json')
  const memoryPath = join(runDir, 'civil_memory_ledger.json')

  process.env.COURT_STORE_PATH = courtPath
  process.env.CIVIL_MEMORY_PATH = memoryPath
  process.env.COURT_DEADLOCK_MAX_DEFERRED_STREAK = '3'

  const gates: GateResult[] = []
  gates.push(await runDeadlockGate())
  gates.push(await runVoteIdentityGate())
  gates.push(await runTamperChainGate(memoryPath))

  const report: GateReport = {
    runId,
    generatedAt: new Date().toISOString(),
    gates,
    passed: gates.every((gate) => gate.passed),
  }

  console.info(JSON.stringify(report, null, 2))

  const exitCode = buildExitCode(gates)
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'phase5 hardening gate failed'
  console.error(message)
  process.exit(1)
})
