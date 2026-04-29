// Export local TSX world-cell SVG components to 384x384 transparent PNG files.
// This is a formal asset generation entrypoint for Godot world map cell visuals.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';

const REPO_ROOT = path.resolve('C:/Users/26739/Desktop/8989');
const WORLD_DIR = path.join(REPO_ROOT, 'godot-client/assets/themes/slgclient/current/world');
const MANIFEST_PATH = path.join(WORLD_DIR, 'world_cell_assets_manifest_v1.json');
const TMP_DIR = path.join(REPO_ROOT, 'tmp/world_cell_asset_export');
const CANVAS_SIZE = 384;
const DEFAULT_FIT_FOOTPRINT = [240, 120];
const DEFAULT_ANCHOR_X = 192;
const FOOTPRINT_BOTTOM_USER_Y = 60;

const COMPONENTS = [
  ['Academy.tsx', 'Academy', 'ACADEMY_BASE_SPEC', 'academy_base_v1'],
  ['Armory.tsx', 'Armory', 'ARMORY_BASE_SPEC', 'armory_base_v1'],
  ['Barracks.tsx', 'Barracks', 'BARRACKS_BASE_SPEC', 'barracks_base_v1'],
  ['CityGate.tsx', 'CityGate', 'CITY_GATE_BASE_SPEC', 'city_gate_base_v1'],
  ['CityLordMansion.tsx', 'CityLordMansion', 'CITY_HALL_BASE_SPEC', 'city_hall_base_v1'],
  ['CityWallSegment.tsx', 'CityWallSegment', 'CITY_WALL_SEGMENT_BASE_SPEC', 'city_wall_segment_base_v1'],
  ['ConstructionPlot.tsx', 'ConstructionPlot', 'CONSTRUCTION_PLOT_BASE_SPEC', 'construction_plot_base_v1'],
  ['CornerWatchtower.tsx', 'CornerWatchtower', 'CORNER_WATCHTOWER_BASE_SPEC', 'corner_watchtower_base_v1'],
  ['Dock.tsx', 'Dock', 'DOCK_BASE_SPEC', 'dock_base_v1', { role: 'dock', fitFootprint: [320, 160], visualFitScale: 1.0, sourceAnchor: [192, 288] }],
  ['DrillGround.tsx', 'DrillGround', 'DRILL_GROUND_BASE_SPEC', 'drill_ground_base_v1'],
  ['Fort.tsx', 'Fort', 'FORT_BASE_SPEC', 'fort_base_v1', { role: 'fort', fitFootprint: [320, 160], visualFitScale: 1.0, sourceAnchor: [192, 288] }],
  ['Granary.tsx', 'Granary', 'GRANARY_BASE_SPEC', 'granary_base_v1'],
  ['Infirmary.tsx', 'Infirmary', 'INFIRMARY_BASE_SPEC', 'infirmary_base_v1'],
  ['Market.tsx', 'Market', 'MARKET_BASE_SPEC', 'market_base_v1'],
  ['Pass.tsx', 'Pass', 'PASS_SW_BASE_SPEC', 'pass_sw_base_v1', { role: 'pass', props: { direction: 'SW' }, fitFootprint: [320, 160], visualFitScale: 1.0, sourceAnchor: [192, 288] }],
  ['Pass.tsx', 'Pass', 'PASS_SE_BASE_SPEC', 'pass_se_base_v1', { role: 'pass', props: { direction: 'SE' }, fitFootprint: [320, 160], visualFitScale: 1.0, sourceAnchor: [192, 288] }],
  ['RecruitHall.tsx', 'RecruitHall', 'RECRUIT_HALL_BASE_SPEC', 'recruit_hall_base_v1'],
  ['Residence.tsx', 'Residence', 'RESIDENCE_BASE_SPEC', 'residence_base_v1'],
  ['Stable.tsx', 'Stable', 'STABLE_BASE_SPEC', 'stable_base_v1'],
  ['Warehouse.tsx', 'Warehouse', 'WAREHOUSE_BASE_SPEC', 'warehouse_base_v1'],
  ['Workshop.tsx', 'Workshop', 'WORKSHOP_BASE_SPEC', 'workshop_base_v1'],
].map(([source, component, spec, basename, options = {}]) => ({
  source,
  component,
  spec,
  basename,
  role: options.role ?? 'building',
  props: options.props ?? {},
  fitFootprint: options.fitFootprint ?? null,
  visualFitScale: options.visualFitScale ?? null,
  sourceAnchor: options.sourceAnchor ?? null,
  svg: `${basename}.svg`,
  png: `${basename}.png`,
}));

const EXTRA_FRAMES = {
  'main_city_foundation_base_v1.png': {
    role: 'foundation',
    source: 'existing raster asset',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
  'city_wall_ring_profile_v1.png': {
    role: 'city_wall',
    source: 'existing raster asset',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
};

const GENERATED_FRAMES = {
  world_cell_city_ground_base_v1: {
    png: 'world_cell_city_ground_base_v1.png',
    svg: 'world_cell_city_ground_base_v1.svg',
    role: 'city_ground_cell',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
  world_cell_node_ground_base_v1: {
    png: 'world_cell_node_ground_base_v1.png',
    svg: 'world_cell_node_ground_base_v1.svg',
    role: 'node_ground_cell',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
  world_cell_city_wall_top_v1: {
    png: 'world_cell_city_wall_top_v1.png',
    svg: 'world_cell_city_wall_top_v1.svg',
    role: 'city_wall_edge',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
  world_cell_city_wall_bottom_v1: {
    png: 'world_cell_city_wall_bottom_v1.png',
    svg: 'world_cell_city_wall_bottom_v1.svg',
    role: 'city_wall_edge',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
  world_cell_city_wall_left_v1: {
    png: 'world_cell_city_wall_left_v1.png',
    svg: 'world_cell_city_wall_left_v1.svg',
    role: 'city_wall_edge',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
  world_cell_city_wall_right_v1: {
    png: 'world_cell_city_wall_right_v1.png',
    svg: 'world_cell_city_wall_right_v1.svg',
    role: 'city_wall_edge',
    fit_footprint: [320, 160],
    source_anchor: [192, 288],
  },
};

const STRATEGIC_NODE_PACKAGE_ID = 'world_strategic_node_asset_pack_v1';

const STRATEGIC_NODE_STATE_SEMANTICS = {
  ownership_states: {
    neutral: {
      meaning: 'No player or hostile faction ownership is asserted.',
      visual_contract: 'Use the base composite without ownership tint.',
      geometry_policy: 'Must not change anchor, footprint, fit_footprint, or source_anchor.',
    },
    own: {
      meaning: 'Owned by the local player or friendly side.',
      visual_contract: 'Friendly ownership is expressed by runtime tint/marker layers above the same asset.',
      geometry_policy: 'Must not change anchor, footprint, fit_footprint, or source_anchor.',
    },
    enemy: {
      meaning: 'Owned by an opposing side.',
      visual_contract: 'Enemy ownership is expressed by runtime tint/marker layers above the same asset.',
      geometry_policy: 'Must not change anchor, footprint, fit_footprint, or source_anchor.',
    },
  },
  interaction_states: {
    selectable: {
      meaning: 'The node can be targeted or inspected in the current interaction context.',
      visual_contract: 'Selection/hover overlays render above the node and never replace the composite.',
      geometry_policy: 'Must not change anchor, footprint, fit_footprint, or source_anchor.',
    },
    disabled: {
      meaning: 'The node exists but is not actionable in the current interaction context.',
      visual_contract: 'Disabled treatment is a runtime overlay or alpha modifier above the same asset.',
      geometry_policy: 'Must not change anchor, footprint, fit_footprint, or source_anchor.',
    },
  },
};

const STRATEGIC_NODE_CATEGORY_STATE_COVERAGE = {
  player_city: {
    default_ownership_state: 'own',
    supported_ownership_states: ['own'],
    supported_interaction_states: ['selectable', 'disabled'],
  },
  ai_city: {
    default_ownership_state: 'enemy',
    supported_ownership_states: ['enemy', 'neutral'],
    supported_interaction_states: ['selectable', 'disabled'],
  },
  system_city: {
    default_ownership_state: 'neutral',
    supported_ownership_states: ['neutral', 'own', 'enemy'],
    supported_interaction_states: ['selectable', 'disabled'],
  },
  pass: {
    default_ownership_state: 'neutral',
    supported_ownership_states: ['neutral', 'own', 'enemy'],
    supported_interaction_states: ['selectable', 'disabled'],
  },
  fort: {
    default_ownership_state: 'neutral',
    supported_ownership_states: ['neutral', 'own', 'enemy'],
    supported_interaction_states: ['selectable', 'disabled'],
  },
  dock: {
    default_ownership_state: 'neutral',
    supported_ownership_states: ['neutral', 'own', 'enemy'],
    supported_interaction_states: ['selectable', 'disabled'],
  },
  resource: {
    default_ownership_state: 'neutral',
    supported_ownership_states: ['neutral', 'own', 'enemy'],
    supported_interaction_states: ['selectable', 'disabled'],
  },
};

const STRATEGIC_NODE_NAMING_POLICY = {
  pass: {
    canonical_runtime_type: 'pass',
    canonical_footprint_id: 'pass_1x1',
    canonical_composite_ids: ['world_node_pass_sw_v1', 'world_node_pass_se_v1'],
    display_aliases: ['gate'],
    deprecated_ids: ['world_node_gate_v1', 'gate_1x1'],
    rule: 'Use pass in runtime ids, manifest ids, filenames, and tests. Gate is a display/product alias only.',
  },
};

const STRATEGIC_NODE_RESOURCE_POLICY = {
  mode: 'external_resource_manifest_referenced_by_pack',
  resource_manifest_path: 'resources/world_resource_assets_manifest_v1.json',
  footprint_contract_id: 'resource_1x1',
  resource_kinds: ['grain', 'wood', 'stone', 'iron'],
  resource_levels: ['base', 'l01', 'l02', 'l03', 'l04', 'l05', 'l06', 'l07', 'l08', 'l09'],
  rule: 'Resource land remains authored by the resource manifest and is included in this strategic package by reference, not duplicated as world_node_resource_* composites.',
};

const STRATEGIC_NODE_PACKAGE = {
  id: STRATEGIC_NODE_PACKAGE_ID,
  finalized_at: '2026-04-28',
  scope: ['player_city', 'ai_city', 'system_city', 'pass', 'fort', 'dock', 'resource'],
  state_semantics: STRATEGIC_NODE_STATE_SEMANTICS,
  naming_policy: STRATEGIC_NODE_NAMING_POLICY,
  resource_policy: STRATEGIC_NODE_RESOURCE_POLICY,
  geometry_invariants: {
    source_canvas: [CANVAS_SIZE, CANVAS_SIZE],
    projection: 'isometric_2_to_1',
    anchor_rule: 'bottom_center',
    runtime_tile_size: [200, 100],
    strategic_node_fit_footprint: [320, 160],
    default_building_fit_footprint: DEFAULT_FIT_FOOTPRINT,
  },
};

const CELL_SCREEN_OFFSET_X = 100;
const CELL_SCREEN_OFFSET_Y = 50;

function cellOffset(cellX, cellY, offsetX = 0, offsetY = 0) {
  return [
    (cellX - cellY) * CELL_SCREEN_OFFSET_X + offsetX,
    (cellX + cellY) * CELL_SCREEN_OFFSET_Y + offsetY,
  ];
}

function footprintCells(sideLength) {
  const half = Math.floor(sideLength / 2);
  const cells = [];
  for (let cell = -half; cell <= half; cell += 1) {
    cells.push(cell);
  }
  return cells;
}

function foundationFootprintLayers(sideLength, alpha = 0.72, scale = 0.92) {
  const layers = [];
  for (const cellY of footprintCells(sideLength)) {
    for (const cellX of footprintCells(sideLength)) {
      layers.push({
        frame: 'world_cell_city_ground_base_v1.png',
        alpha,
        scale,
        offset: cellOffset(cellX, cellY),
      });
    }
  }
  return layers;
}

function perimeterWallLayers(sideLength, alpha = 0.86, scale = 1.0) {
  const layers = [];
  const cells = footprintCells(sideLength);
  const minCell = cells[0];
  const maxCell = cells[cells.length - 1];
  for (const cellX of cells) {
    layers.push({ frame: 'world_cell_city_wall_top_v1.png', alpha, scale, offset: cellOffset(cellX, minCell) });
    layers.push({ frame: 'world_cell_city_wall_bottom_v1.png', alpha, scale, offset: cellOffset(cellX, maxCell) });
  }
  for (const cellY of cells) {
    layers.push({ frame: 'world_cell_city_wall_left_v1.png', alpha, scale, offset: cellOffset(minCell, cellY) });
    layers.push({ frame: 'world_cell_city_wall_right_v1.png', alpha, scale, offset: cellOffset(maxCell, cellY) });
  }
  return layers;
}

const CITY_PAYLOAD_FRAMES = [
  'academy_base_v1.png',
  'barracks_base_v1.png',
  'granary_base_v1.png',
  'warehouse_base_v1.png',
  'drill_ground_base_v1.png',
  'market_base_v1.png',
  'residence_base_v1.png',
  'stable_base_v1.png',
  'workshop_base_v1.png',
  'armory_base_v1.png',
  'infirmary_base_v1.png',
  'recruit_hall_base_v1.png',
  'construction_plot_base_v1.png',
];

function payloadStageMaxForSide(sideLength) {
  if (sideLength >= 9) return 4;
  if (sideLength >= 7) return 3;
  if (sideLength >= 5) return 2;
  return 1;
}

function payloadScaleForSide(sideLength, isHall = false) {
  if (isHall) {
    if (sideLength >= 9) return 0.82;
    if (sideLength >= 7) return 0.80;
    if (sideLength >= 5) return 0.78;
    return 0.76;
  }
  if (sideLength >= 9) return 0.29;
  if (sideLength >= 7) return 0.30;
  if (sideLength >= 5) return 0.32;
  return 0.34;
}

function cityPayloadActivationStage(cellX, cellY, sideLength) {
  const distance = Math.max(Math.abs(cellX), Math.abs(cellY));
  const maxDistance = Math.floor(sideLength / 2);
  const maxStage = payloadStageMaxForSide(sideLength);
  if (distance <= 0) return 0;
  if (maxDistance <= 1) return Math.min(maxStage, 1);
  return Math.min(maxStage, Math.max(1, distance));
}

function cityPayloadSlots(sideLength, hallScale, hallOffsetY) {
  const slots = [];
  const cells = footprintCells(sideLength);
  const maxCell = cells[cells.length - 1];
  const minCell = cells[0];
  let frameIndex = 0;
  for (const cellY of cells) {
    for (const cellX of cells) {
      const isHall = cellX === 0 && cellY === 0;
      const isCorner = (cellX === minCell || cellX === maxCell) && (cellY === minCell || cellY === maxCell);
      let frame = CITY_PAYLOAD_FRAMES[frameIndex % CITY_PAYLOAD_FRAMES.length];
      let slotRole = 'building';
      let alpha = sideLength >= 9 ? 0.81 : sideLength >= 7 ? 0.83 : 0.86;
      let scale = payloadScaleForSide(sideLength);
      let offset = [0, -8];
      if (isHall) {
        frame = 'city_hall_base_v1.png';
        slotRole = 'hall';
        alpha = 1;
        scale = hallScale || payloadScaleForSide(sideLength, true);
        offset = [0, hallOffsetY];
      } else if (isCorner) {
        frame = 'corner_watchtower_base_v1.png';
        slotRole = 'watchtower';
        alpha = 0.9;
        scale = payloadScaleForSide(sideLength) + 0.01;
      } else {
        frameIndex += 1;
      }
      slots.push({
        slot_id: `slot_${cellX}_${cellY}`,
        slot_role: slotRole,
        cell_offset: [cellX, cellY],
        activation_stage: cityPayloadActivationStage(cellX, cellY, sideLength),
        frame,
        alpha,
        scale,
        offset,
      });
    }
  }
  return slots;
}

function cityComposite({
  role,
  footprintContractId,
  sideLength,
  groundAlpha,
  wallAlpha,
  hallScale,
  hallOffsetY,
}) {
  return {
    role,
    footprint_contract_id: footprintContractId,
    footprint_tiles: [sideLength, sideLength],
    render_mode: 'layered_city',
    payload_stage_max: payloadStageMaxForSide(sideLength),
    layers: [
      ...foundationFootprintLayers(sideLength, groundAlpha, 1.0).map((layer) => ({ ...layer, layer_role: 'base' })),
      ...perimeterWallLayers(sideLength, wallAlpha, 1.0).map((layer) => ({ ...layer, layer_role: 'perimeter' })),
    ],
    payload_slots: cityPayloadSlots(sideLength, hallScale, hallOffsetY),
  };
}

function withStrategicNodeMetadata(composite, category) {
  const coverage = STRATEGIC_NODE_CATEGORY_STATE_COVERAGE[category];
  if (!coverage) {
    throw new Error(`Missing strategic node state coverage for ${category}`);
  }
  return {
    ...composite,
    package_id: STRATEGIC_NODE_PACKAGE_ID,
    strategic_category: category,
    state_semantics_ref: 'strategic_node_package.state_semantics',
    naming_policy_ref: category === 'pass' ? 'strategic_node_package.naming_policy.pass' : null,
    ...coverage,
  };
}

const COMPOSITES = {
  world_node_city_v1: withStrategicNodeMetadata(cityComposite({
    role: 'city',
    footprintContractId: 'player_city_3x3_initial',
    sideLength: 3,
    groundAlpha: 0.96,
    wallAlpha: 0.72,
    hallScale: 0.74,
    hallOffsetY: -4,
  }), 'player_city'),
  world_node_capital_v1: withStrategicNodeMetadata(cityComposite({
    role: 'capital',
    footprintContractId: 'ai_city_3x3_initial',
    sideLength: 3,
    groundAlpha: 0.98,
    wallAlpha: 0.78,
    hallScale: 0.78,
    hallOffsetY: -5,
  }), 'ai_city'),
  world_node_system_city_3x3_v1: withStrategicNodeMetadata(cityComposite({
    role: 'system_city',
    footprintContractId: 'system_city_l03_l04_3x3',
    sideLength: 3,
    groundAlpha: 0.97,
    wallAlpha: 0.74,
    hallScale: 0.76,
    hallOffsetY: -5,
  }), 'system_city'),
  world_node_system_city_5x5_v1: withStrategicNodeMetadata(cityComposite({
    role: 'system_city',
    footprintContractId: 'system_city_l05_l06_5x5',
    sideLength: 5,
    groundAlpha: 0.96,
    wallAlpha: 0.76,
    hallScale: 0.78,
    hallOffsetY: -5,
  }), 'system_city'),
  world_node_system_city_7x7_v1: withStrategicNodeMetadata(cityComposite({
    role: 'system_city',
    footprintContractId: 'system_city_l07_l08_7x7',
    sideLength: 7,
    groundAlpha: 0.96,
    wallAlpha: 0.78,
    hallScale: 0.80,
    hallOffsetY: -6,
  }), 'system_city'),
  world_node_system_city_9x9_v1: withStrategicNodeMetadata(cityComposite({
    role: 'system_city',
    footprintContractId: 'system_city_l09_9x9',
    sideLength: 9,
    groundAlpha: 0.95,
    wallAlpha: 0.80,
    hallScale: 0.82,
    hallOffsetY: -6,
  }), 'system_city'),
  world_node_pass_sw_v1: withStrategicNodeMetadata(payloadNodeComposite({
    role: 'pass',
    footprintContractId: 'pass_1x1',
    frame: 'pass_sw_base_v1.png',
    structureScale: 0.86,
  }), 'pass'),
  world_node_pass_se_v1: withStrategicNodeMetadata(payloadNodeComposite({
    role: 'pass',
    footprintContractId: 'pass_1x1',
    frame: 'pass_se_base_v1.png',
    structureScale: 0.86,
  }), 'pass'),
  world_node_fort_v1: withStrategicNodeMetadata(payloadNodeComposite({
    role: 'fort',
    footprintContractId: 'fort_1x1',
    frame: 'fort_base_v1.png',
    structureScale: 0.86,
  }), 'fort'),
  world_node_dock_v1: withStrategicNodeMetadata(payloadNodeComposite({
    role: 'dock',
    footprintContractId: 'dock_1x1',
    frame: 'dock_base_v1.png',
    structureScale: 0.86,
  }), 'dock'),
};

function payloadNodeComposite({
  role,
  footprintContractId,
  frame,
  sideLength = 1,
  groundAlpha = 0.76,
  wallAlpha = 0.52,
  structureScale = 1,
  structureOffset = [0, 0],
}) {
  return {
    role,
    footprint_contract_id: footprintContractId,
    footprint_tiles: [sideLength, sideLength],
    render_mode: sideLength > 1 ? 'layered_node' : 'payload_node',
    layers: sideLength > 1 ? [
      ...foundationFootprintLayers(sideLength, groundAlpha, 1.0).map((layer) => ({
        ...layer,
        frame: 'world_cell_node_ground_base_v1.png',
        layer_role: 'base',
      })),
      ...perimeterWallLayers(sideLength, wallAlpha, 0.78).map((layer) => ({
        ...layer,
        layer_role: 'perimeter',
      })),
    ] : [],
    payload_stage_max: 0,
    payload_slots: [
      {
        slot_id: `${role}_anchor`,
        slot_role: 'structure',
        cell_offset: [0, 0],
        activation_stage: 0,
        frame,
        alpha: 1,
        scale: structureScale,
        offset: structureOffset,
      },
    ],
  };
}

const ATTR_MAP = {
  className: 'class',
  strokeWidth: 'stroke-width',
  strokeLinejoin: 'stroke-linejoin',
  strokeLinecap: 'stroke-linecap',
  strokeOpacity: 'stroke-opacity',
  fillOpacity: 'fill-opacity',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  textAnchor: 'text-anchor',
  dominantBaseline: 'dominant-baseline',
  pointerEvents: 'pointer-events',
};

function flatten(items) {
  const out = [];
  for (const item of items) {
    if (Array.isArray(item)) out.push(...flatten(item));
    else if (item !== null && item !== undefined && item !== false && item !== true) out.push(item);
  }
  return out;
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

function createElement(type, props, ...children) {
  const normalizedProps = props ?? {};
  const flatChildren = flatten(children);
  if (typeof type === 'function') {
    return type({ ...normalizedProps, children: flatChildren });
  }
  return { type, props: normalizedProps, children: flatChildren };
}

function serialize(node) {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (Array.isArray(node)) return node.map(serialize).join('');
  if (typeof node === 'string' || typeof node === 'number') return escapeText(node);
  if (typeof node.type !== 'string') return '';

  const attrs = [];
  for (const [rawKey, rawValue] of Object.entries(node.props ?? {})) {
    if (rawKey === 'children' || rawKey === 'key' || rawKey === 'ref') continue;
    if (rawValue === null || rawValue === undefined || rawValue === false) continue;
    if (rawKey === 'style' && typeof rawValue === 'object') {
      const style = Object.entries(rawValue)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}:${value}`)
        .join(';');
      if (style !== '') attrs.push(`style="${escapeAttr(style)}"`);
      continue;
    }
    const attrName = ATTR_MAP[rawKey] ?? rawKey;
    attrs.push(`${attrName}="${escapeAttr(rawValue === true ? '' : rawValue)}"`);
  }
  const body = flatten(node.children ?? []).map(serialize).join('');
  const attrsText = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  return body === '' ? `<${node.type}${attrsText}/>` : `<${node.type}${attrsText}>${body}</${node.type}>`;
}

function parseViewBox(viewBox) {
  const parts = String(viewBox ?? '').trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return [-192, -240, 384, 384];
  }
  return parts;
}

function sourceAnchorForSpec(spec) {
  const [minX, minY] = parseViewBox(spec.viewBox);
  return [Math.round(DEFAULT_ANCHOR_X - minX - 192), Math.round(FOOTPRINT_BOTTOM_USER_Y - minY)];
}

function transpileTsx(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  }).outputText;
}

function requireShim(moduleName) {
  if (moduleName === 'react') {
    return {
      __esModule: true,
      default: ReactShim,
      ...ReactShim,
    };
  }
  throw new Error(`Unsupported module import: ${moduleName}`);
}

let idCounter = 0;
const ReactShim = {
  createElement,
  Fragment: Symbol('Fragment'),
  useId: () => `world_cell_${++idCounter}`,
};

function renderComponent(asset) {
  idCounter = 0;
  const sourcePath = path.join(REPO_ROOT, asset.source);
  const code = transpileTsx(sourcePath);
  const context = {
    exports: {},
    module: { exports: {} },
    require: requireShim,
    console,
  };
  context.exports = context.module.exports;
  vm.runInNewContext(code, context, { filename: asset.source });
  const exportsObject = context.module.exports;
  const component = exportsObject[asset.component];
  const spec = exportsObject[asset.spec];
  if (typeof component !== 'function' || !spec) {
    throw new Error(`Cannot resolve ${asset.component}/${asset.spec} from ${asset.source}`);
  }

  let svg = serialize(component({ showFootprintGuide: false, ...asset.props }));
  svg = svg.replace('<svg ', `<svg data-asset-anchor="${escapeAttr(spec.anchor)}" `);
  return { svg, spec };
}

function locateChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Cannot locate Chrome or Edge for transparent PNG export');
}

function locatePython() {
  const candidates = [
    process.env.PYTHON,
    'C:/Users/26739/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
    'python',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  throw new Error('Cannot locate Python for world cell asset calibration');
}

function writeScreenshotHtml(asset, svg) {
  const htmlPath = path.join(TMP_DIR, `${asset.basename}.html`);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; width: ${CANVAS_SIZE}px; height: ${CANVAS_SIZE}px; background: transparent; overflow: hidden; }
    svg { display: block; width: ${CANVAS_SIZE}px; height: ${CANVAS_SIZE}px; background: transparent; }
  </style>
</head>
<body>${svg}</body>
</html>
`;
  fs.writeFileSync(htmlPath, html, 'utf8');
  return htmlPath;
}

function rasterizeSvgWithChrome(chromePath, asset, svg) {
  const htmlPath = writeScreenshotHtml(asset, svg);
  const pngPath = path.join(WORLD_DIR, asset.png);
  const profileDir = path.join(TMP_DIR, `chrome-profile-${asset.basename}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });
  const result = spawnSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--default-background-color=00000000',
    `--user-data-dir=${profileDir}`,
    `--window-size=${CANVAS_SIZE},${CANVAS_SIZE}`,
    `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Chrome PNG export failed for ${asset.source}: ${result.stderr || result.stdout}`);
  }
  return pngPath;
}

function buildManifestFrame(asset, spec) {
  return {
    file: asset.png,
    svg: asset.svg,
    source: asset.source,
    asset_id: spec.assetId,
    role: asset.role ?? 'building',
    canvas: [CANVAS_SIZE, CANVAS_SIZE],
    fit_footprint: Array.isArray(asset.fitFootprint) ? asset.fitFootprint : DEFAULT_FIT_FOOTPRINT,
    visual_fit_scale: Number(asset.visualFitScale ?? 1),
    source_anchor: Array.isArray(asset.sourceAnchor) ? asset.sourceAnchor : sourceAnchorForSpec(spec),
    anchor_rule: 'bottom_center',
    view_box: String(spec.viewBox ?? ''),
  };
}

function renderCityGroundBaseSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">
  <defs>
    <linearGradient id="cityGroundTop" x1="52" y1="150" x2="332" y2="266" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#87948c"/>
      <stop offset="0.45" stop-color="#828f88"/>
      <stop offset="1" stop-color="#79867f"/>
    </linearGradient>
    <linearGradient id="cityGroundLight" x1="72" y1="162" x2="210" y2="266" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d6dfcf" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#d6dfcf" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="cityGroundShade" x1="188" y1="136" x2="320" y2="276" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#53615b" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#4b5852" stop-opacity="0.18"/>
    </linearGradient>
    <radialGradient id="cityGroundCenter" cx="192" cy="208" r="146" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#edf0df" stop-opacity="0.10"/>
      <stop offset="0.72" stop-color="#edf0df" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M32 208 L192 288 L352 208 L192 128 Z" fill="url(#cityGroundTop)" fill-opacity="0.96"/>
  <path d="M32 208 L192 128 L192 288 Z" fill="url(#cityGroundLight)"/>
  <path d="M192 128 L352 208 L192 288 Z" fill="url(#cityGroundShade)"/>
  <path d="M58 208 L192 141 L326 208 L192 275 Z" fill="url(#cityGroundCenter)"/>
  <path d="M58 208 L192 141 L326 208 L192 275 Z" fill="none" stroke="#eff3dc" stroke-width="1.0" stroke-opacity="0.07"/>
  <path d="M32 208 L192 128 L352 208" fill="none" stroke="#eef2da" stroke-width="1.2" stroke-opacity="0.10"/>
  <path d="M32 208 L192 288 L352 208" fill="none" stroke="#4f5d57" stroke-width="1.0" stroke-opacity="0.12"/>
  <path d="M32 208 L192 128 L352 208 L192 288 Z" fill="none" stroke="#79867f" stroke-width="0.9" stroke-opacity="0.10"/>
</svg>`;
}

function renderNodeGroundBaseSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">
  <defs>
    <linearGradient id="nodeGroundTop" x1="52" y1="150" x2="332" y2="266" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#87948c"/>
      <stop offset="0.45" stop-color="#828f88"/>
      <stop offset="1" stop-color="#79867f"/>
    </linearGradient>
    <linearGradient id="nodeGroundLight" x1="70" y1="164" x2="210" y2="266" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d6dfcf" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#d8dfcf" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="nodeGroundShade" x1="188" y1="136" x2="320" y2="276" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#53615b" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#4b5852" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <path d="M32 208 L192 288 L352 208 L192 128 Z" fill="url(#nodeGroundTop)" fill-opacity="0.96"/>
  <path d="M32 208 L192 128 L192 288 Z" fill="url(#nodeGroundLight)"/>
  <path d="M192 128 L352 208 L192 288 Z" fill="url(#nodeGroundShade)"/>
  <path d="M58 208 L192 141 L326 208 L192 275 Z" fill="none" stroke="#eff3dc" stroke-width="1.0" stroke-opacity="0.07"/>
  <path d="M32 208 L192 128 L352 208" fill="none" stroke="#eef2da" stroke-width="1.2" stroke-opacity="0.10"/>
  <path d="M32 208 L192 288 L352 208" fill="none" stroke="#4f5d57" stroke-width="1.0" stroke-opacity="0.12"/>
  <path d="M32 208 L192 128 L352 208 L192 288 Z" fill="none" stroke="#79867f" stroke-width="0.9" stroke-opacity="0.10"/>
</svg>`;
}

function renderCityWallEdgeSvg(kind) {
  const edgePaths = {
    top: {
      wall: 'M32 208 L192 128 L352 208',
      crenels: ['M84 182 L104 172', 'M148 150 L168 140', 'M216 140 L236 150', 'M280 172 L300 182'],
    },
    bottom: {
      wall: 'M32 208 L192 288 L352 208',
      crenels: ['M84 234 L104 244', 'M148 266 L168 276', 'M216 276 L236 266', 'M280 244 L300 234'],
    },
    left: {
      wall: 'M192 128 L32 208 L192 288',
      crenels: ['M148 150 L130 160', 'M96 182 L78 192', 'M78 224 L96 234', 'M130 256 L148 266'],
    },
    right: {
      wall: 'M192 128 L352 208 L192 288',
      crenels: ['M236 150 L254 160', 'M288 182 L306 192', 'M306 224 L288 234', 'M254 256 L236 266'],
    },
  };
  const edge = edgePaths[kind] ?? edgePaths.top;
  const wall = `
  <path d="${edge.wall}" fill="none" stroke="#211a11" stroke-width="10.5" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.24"/>
  <path d="${edge.wall}" fill="none" stroke="#5a5650" stroke-width="8.0" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.92"/>
  <path d="${edge.wall}" fill="none" stroke="#8a857c" stroke-width="5.0" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.90"/>
  <path d="${edge.wall}" fill="none" stroke="#d5ccb3" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.56"/>`;
  const crenels = edge.crenels.map((path) => `
  <path d="${path}" fill="none" stroke="#d4c39b" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.34"/>
  <path d="${path}" fill="none" stroke="#42382a" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.16"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">
${wall}
${crenels}
</svg>`;
}

function renderGeneratedFrameSvg(basename) {
  if (basename === 'world_cell_city_ground_base_v1') {
    return renderCityGroundBaseSvg();
  }
  if (basename === 'world_cell_node_ground_base_v1') {
    return renderNodeGroundBaseSvg();
  }
  if (basename === 'world_cell_city_wall_top_v1') {
    return renderCityWallEdgeSvg('top');
  }
  if (basename === 'world_cell_city_wall_bottom_v1') {
    return renderCityWallEdgeSvg('bottom');
  }
  if (basename === 'world_cell_city_wall_left_v1') {
    return renderCityWallEdgeSvg('left');
  }
  if (basename === 'world_cell_city_wall_right_v1') {
    return renderCityWallEdgeSvg('right');
  }
  throw new Error(`Unknown generated world cell frame: ${basename}`);
}

function main() {
  fs.mkdirSync(WORLD_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const chromePath = locateChrome();
  const existingManifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : null;
  const frames = {};
  const exported = [];

  for (const asset of COMPONENTS) {
    const { svg, spec } = renderComponent(asset);
    fs.writeFileSync(path.join(WORLD_DIR, asset.svg), `${svg}\n`, 'utf8');
    rasterizeSvgWithChrome(chromePath, asset, svg);
    frames[asset.png] = buildManifestFrame(asset, spec);
    exported.push(asset.png);
  }

  for (const [basename, meta] of Object.entries(GENERATED_FRAMES)) {
    const asset = {
      source: meta.source ?? 'generated world cell frame',
      component: basename,
      basename,
      svg: meta.svg,
      png: meta.png,
    };
    const svg = renderGeneratedFrameSvg(basename);
    fs.writeFileSync(path.join(WORLD_DIR, asset.svg), `${svg}\n`, 'utf8');
    rasterizeSvgWithChrome(chromePath, asset, svg);
    frames[asset.png] = {
      file: asset.png,
      svg: asset.svg,
      source: asset.source,
      asset_id: basename,
      role: meta.role,
      canvas: [CANVAS_SIZE, CANVAS_SIZE],
      fit_footprint: meta.fit_footprint,
      source_anchor: meta.source_anchor,
      anchor_rule: 'bottom_center',
    };
    exported.push(asset.png);
  }

  for (const [file, meta] of Object.entries(EXTRA_FRAMES)) {
    const filePath = path.join(WORLD_DIR, file);
    if (fs.existsSync(filePath)) {
      frames[file] = {
        file,
        role: meta.role,
        source: meta.source,
        canvas: [CANVAS_SIZE, CANVAS_SIZE],
        fit_footprint: meta.fit_footprint,
        source_anchor: meta.source_anchor,
        anchor_rule: 'bottom_center',
      };
    }
  }

  const manifest = {
    schema: 'world_cell_assets_manifest_v1',
    strategic_node_package: STRATEGIC_NODE_PACKAGE,
    source_canvas: [CANVAS_SIZE, CANVAS_SIZE],
    projection: {
      type: 'isometric_2_to_1',
      runtime_tile_width: 200,
      runtime_tile_height: 100,
      anchor_rule: 'bottom_center',
    },
    defaults: {
      fit_footprint: DEFAULT_FIT_FOOTPRINT,
      source_anchor: [192, 300],
      anchor_rule: 'bottom_center',
    },
    frames,
    composites: {
      ...(existingManifest?.composites ?? {}),
      ...COMPOSITES,
    },
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const pythonPath = locatePython();
  const calibration = spawnSync(pythonPath, ['godot-client/tools/calibrate_world_cell_assets.py'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (calibration.status !== 0) {
    throw new Error(`World cell PNG calibration failed: ${calibration.stderr || calibration.stdout}`);
  }
  console.log(JSON.stringify({
    chromePath,
    pythonPath,
    exportedCount: exported.length,
    exported,
    manifest: path.relative(REPO_ROOT, MANIFEST_PATH),
    calibration: JSON.parse(calibration.stdout),
  }, null, 2));
}

main();
