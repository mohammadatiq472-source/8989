import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

type RootContractSpec = {
  tsFile: string
  tsTypeName: string
  csFile: string
  csClassName: string
  tsWhitelist?: string[]
}

type NestedContractSpec = {
  tsFile: string
  tsRootTypeName: string
  tsPath: string
  csFile: string
  csClassName: string
  tsWhitelist?: string[]
}

type PathToken = {
  name: string
  mode: 'plain' | 'array' | 'record'
}

const PROJECT_ROOT = process.cwd()
const CS_MODELS_FILE = resolve(PROJECT_ROOT, 'My project', 'Assets', 'Scripts', 'Data', 'GameModels.cs')
const WORLD_TS = resolve(PROJECT_ROOT, 'shared', 'contracts', 'game', 'world.ts')
const WS_TS = resolve(PROJECT_ROOT, 'shared', 'contracts', 'game', 'ws.ts')

const rootSpecs: RootContractSpec[] = [
  {
    tsFile: WORLD_TS,
    tsTypeName: 'WorldState',
    csFile: CS_MODELS_FILE,
    csClassName: 'WorldState',
    // WorldState is a high-churn structure. Keep this as a key-field whitelist.
    tsWhitelist: ['tick', 'worldVersion', 'map', 'factions', 'units', 'intel', 'reports'],
  },
  { tsFile: WORLD_TS, tsTypeName: 'FactionState', csFile: CS_MODELS_FILE, csClassName: 'FactionState' },
  { tsFile: WORLD_TS, tsTypeName: 'FactionHeroCommand', csFile: CS_MODELS_FILE, csClassName: 'FactionHeroCommand' },
  { tsFile: WORLD_TS, tsTypeName: 'FactionAiQuota', csFile: CS_MODELS_FILE, csClassName: 'FactionAiQuota' },
  { tsFile: WORLD_TS, tsTypeName: 'Unit', csFile: CS_MODELS_FILE, csClassName: 'Unit' },
  { tsFile: WS_TS, tsTypeName: 'WsAiQuotaChange', csFile: CS_MODELS_FILE, csClassName: 'WsAiQuotaChange' },
  { tsFile: WS_TS, tsTypeName: 'WsTickDeltaMessage', csFile: CS_MODELS_FILE, csClassName: 'WsTickDeltaMessage' },
]

const nestedSpecs: NestedContractSpec[] = [
  {
    tsFile: WORLD_TS,
    tsRootTypeName: 'WorldState',
    tsPath: 'map',
    csFile: CS_MODELS_FILE,
    csClassName: 'MapData',
    tsWhitelist: ['width', 'height', 'tiles', 'regions'],
  },
  {
    tsFile: WORLD_TS,
    tsRootTypeName: 'WorldState',
    tsPath: 'map.tiles[]',
    csFile: CS_MODELS_FILE,
    csClassName: 'Tile',
    tsWhitelist: ['id', 'name', 'type', 'terrain', 'owner', 'x', 'y', 'moveCost', 'enemyPressure'],
  },
  {
    tsFile: WORLD_TS,
    tsRootTypeName: 'WorldState',
    tsPath: 'map.regions[]',
    csFile: CS_MODELS_FILE,
    csClassName: 'MapRegion',
    tsWhitelist: ['id', 'name', 'tileIds'],
  },
  {
    tsFile: WORLD_TS,
    tsRootTypeName: 'WorldState',
    tsPath: 'factions{}',
    csFile: CS_MODELS_FILE,
    csClassName: 'FactionState',
    tsWhitelist: ['id', 'food', 'actionPoints', 'heroCommand', 'aiQuota'],
  },
  {
    tsFile: WORLD_TS,
    tsRootTypeName: 'WorldState',
    tsPath: 'units[]',
    csFile: CS_MODELS_FILE,
    csClassName: 'Unit',
    tsWhitelist: ['id', 'name', 'faction', 'tileId', 'strength', 'mobility', 'supply', 'status', 'hero', 'corps', 'currentTask'],
  },
  { tsFile: WORLD_TS, tsRootTypeName: 'Unit', tsPath: 'hero', csFile: CS_MODELS_FILE, csClassName: 'Hero' },
  { tsFile: WORLD_TS, tsRootTypeName: 'Unit', tsPath: 'hero.signatureSkill', csFile: CS_MODELS_FILE, csClassName: 'HeroSignatureSkill' },
  { tsFile: WORLD_TS, tsRootTypeName: 'Unit', tsPath: 'corps', csFile: CS_MODELS_FILE, csClassName: 'Corps' },
  { tsFile: WORLD_TS, tsRootTypeName: 'Unit', tsPath: 'coHeroes[]', csFile: CS_MODELS_FILE, csClassName: 'CoHero' },
  { tsFile: WORLD_TS, tsRootTypeName: 'FactionState', tsPath: 'heroCommand', csFile: CS_MODELS_FILE, csClassName: 'FactionHeroCommand' },
  { tsFile: WORLD_TS, tsRootTypeName: 'FactionState', tsPath: 'aiQuota', csFile: CS_MODELS_FILE, csClassName: 'FactionAiQuota' },
  { tsFile: WORLD_TS, tsRootTypeName: 'FactionState', tsPath: 'aiPlayers[]', csFile: CS_MODELS_FILE, csClassName: 'AIPlayer' },
  { tsFile: WS_TS, tsRootTypeName: 'WsTickDeltaMessage', tsPath: 'factionStats{}', csFile: CS_MODELS_FILE, csClassName: 'WsDeltaFactionStat' },
  { tsFile: WS_TS, tsRootTypeName: 'WsTickDeltaMessage', tsPath: 'unitChanges[]', csFile: CS_MODELS_FILE, csClassName: 'WsDeltaUnitChange' },
  { tsFile: WS_TS, tsRootTypeName: 'WsTickDeltaMessage', tsPath: 'unitChanges[].data', csFile: CS_MODELS_FILE, csClassName: 'WsDeltaUnitData' },
  { tsFile: WS_TS, tsRootTypeName: 'WsTickDeltaMessage', tsPath: 'tileChanges[]', csFile: CS_MODELS_FILE, csClassName: 'WsDeltaTileChange' },
]

function fail(message: string): never {
  throw new Error(message)
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

function parsePath(path: string): PathToken[] {
  return path.split('.').map((part) => {
    if (part.endsWith('[]')) {
      return { name: part.slice(0, -2), mode: 'array' as const }
    }
    if (part.endsWith('{}')) {
      return { name: part.slice(0, -2), mode: 'record' as const }
    }
    return { name: part, mode: 'plain' as const }
  })
}

function extractClassBody(csharpSource: string, className: string): string {
  const classPattern = new RegExp(`\\bpublic\\s+class\\s+${className}\\b`)
  const match = classPattern.exec(csharpSource)
  if (!match) {
    fail(`C# class "${className}" not found.`)
  }

  const start = match.index
  const braceOpen = csharpSource.indexOf('{', start)
  if (braceOpen < 0) {
    fail(`C# class "${className}" missing opening brace.`)
  }

  let depth = 0
  for (let i = braceOpen; i < csharpSource.length; i += 1) {
    const char = csharpSource[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return csharpSource.slice(braceOpen + 1, i)
      }
    }
  }

  fail(`C# class "${className}" missing closing brace.`)
}

function extractCSharpJsonProps(filePath: string, className: string): string[] {
  const source = readUtf8(filePath)
  const classBody = extractClassBody(source, className)
  const props = new Set<string>()
  const propPattern = /\[JsonProperty\("([^"]+)"\)\]\s*public\s+[^;\n]+/g
  let match: RegExpExecArray | null
  while ((match = propPattern.exec(classBody)) !== null) {
    props.add(match[1])
  }
  return [...props].sort()
}

function buildProgram(): ts.Program {
  return ts.createProgram({
    rootNames: [WORLD_TS, WS_TS],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: false,
      skipLibCheck: true,
      noEmit: true,
    },
  })
}

function getExportedTypeNode(
  program: ts.Program,
  filePath: string,
  typeName: string,
): ts.TypeAliasDeclaration | ts.InterfaceDeclaration {
  const source = program.getSourceFile(filePath)
  if (!source) fail(`TypeScript source file not found: ${filePath}`)

  for (const statement of source.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === typeName) {
      return statement
    }
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === typeName) {
      return statement
    }
  }
  fail(`TS type "${typeName}" not found in ${filePath}`)
}

function getTypeFromDeclaration(program: ts.Program, declaration: ts.TypeAliasDeclaration | ts.InterfaceDeclaration): ts.Type {
  const checker = program.getTypeChecker()
  return checker.getTypeAtLocation(declaration.name)
}

function getPropertyType(checker: ts.TypeChecker, hostType: ts.Type, propName: string): ts.Type {
  const symbol = checker.getPropertyOfType(hostType, propName)
  if (!symbol) fail(`TS property "${propName}" not found.`)
  const decl = symbol.valueDeclaration ?? symbol.declarations?.[0]
  if (!decl) fail(`TS property declaration missing for "${propName}".`)
  return checker.getTypeOfSymbolAtLocation(symbol, decl)
}

function normalizeType(checker: ts.TypeChecker, t: ts.Type): ts.Type {
  if (t.isUnion()) {
    const filtered = t.types.filter((type) => (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) === 0)
    if (filtered.length === 1) return filtered[0]
  }
  return checker.getNonNullableType(t)
}

function getArrayElementType(checker: ts.TypeChecker, t: ts.Type): ts.Type {
  const element = checker.getIndexTypeOfType(t, ts.IndexKind.Number)
  if (!element) {
    fail('Expected array-like type while resolving [] segment.')
  }
  return element
}

function getRecordValueType(checker: ts.TypeChecker, t: ts.Type): ts.Type {
  const valueType = checker.getIndexTypeOfType(t, ts.IndexKind.String)
  if (!valueType) {
    fail('Expected record-like type while resolving {} segment.')
  }
  return valueType
}

function getTsTypePropsFromPath(filePath: string, rootTypeName: string, path?: string): string[] {
  const program = buildProgram()
  const checker = program.getTypeChecker()
  const rootDeclaration = getExportedTypeNode(program, filePath, rootTypeName)
  let currentType = getTypeFromDeclaration(program, rootDeclaration)

  if (path && path.trim().length > 0) {
    const tokens = parsePath(path)
    for (const token of tokens) {
      const rawPropertyType = getPropertyType(checker, currentType, token.name)
      let nextType = normalizeType(checker, rawPropertyType)
      if (token.mode === 'array') nextType = normalizeType(checker, getArrayElementType(checker, nextType))
      if (token.mode === 'record') nextType = normalizeType(checker, getRecordValueType(checker, nextType))
      currentType = nextType
    }
  }

  return checker.getPropertiesOfType(currentType).map((symbol) => symbol.getName()).sort()
}

function failFastCompare(key: string, tsProps: string[], csProps: string[], tsWhitelist?: string[]): void {
  const requiredProps = tsWhitelist ? tsWhitelist.filter((prop) => tsProps.includes(prop)).sort() : tsProps
  const tsSet = new Set(tsProps)
  const csSet = new Set(csProps)
  const missing = requiredProps.filter((prop) => !csSet.has(prop)).sort()
  const extra = csProps.filter((prop) => !tsSet.has(prop)).sort()

  if (missing.length > 0) {
      console.error(`[FAIL-FAST] ${key}`)
      console.error(`  Missing in C#: ${missing.join(', ')}`)
      if (tsWhitelist && tsWhitelist.length > 0) {
        console.error(`  Whitelist: ${tsWhitelist.join(', ')}`)
      }
      console.error(`  TS props: ${tsProps.join(', ')}`)
      console.error(`  C# props: ${csProps.join(', ')}`)
      process.exit(1)
  }

  console.log(`[PASS] ${key}`)
  if (extra.length > 0) {
    console.log(`  [INFO] C# extra fields (allowed): ${extra.join(', ')}`)
  }
}

function run(): number {
  for (const spec of rootSpecs) {
    const tsProps = getTsTypePropsFromPath(spec.tsFile, spec.tsTypeName)
    const csProps = extractCSharpJsonProps(spec.csFile, spec.csClassName)
    failFastCompare(`${spec.tsTypeName} -> ${spec.csClassName}`, tsProps, csProps, spec.tsWhitelist)
  }

  for (const spec of nestedSpecs) {
    const tsProps = getTsTypePropsFromPath(spec.tsFile, spec.tsRootTypeName, spec.tsPath)
    const csProps = extractCSharpJsonProps(spec.csFile, spec.csClassName)
    failFastCompare(`${spec.tsRootTypeName}.${spec.tsPath} -> ${spec.csClassName}`, tsProps, csProps, spec.tsWhitelist)
  }

  console.log('\nContract sync gate passed (nested + fail-fast).')
  return 0
}

process.exit(run())
