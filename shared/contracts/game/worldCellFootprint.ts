export type WorldCellFootprintRole =
  | 'resource'
  | 'player_city'
  | 'ai_city'
  | 'system_city'
  | 'pass'
  | 'fort'
  | 'dock'
  | 'mountain_barrier'
  | 'river_corridor'

export type WorldCellFootprintAnchorRule = 'center_cell' | 'path_cells'

export type WorldCellFootprintDrawLayer =
  | 'resource_cell'
  | 'world_node'
  | 'terrain_barrier'
  | 'terrain_corridor'

export type WorldCellFootprintPlacementPolicy = {
  reserveCells: boolean
  blockResourceGeneration: boolean
  blockResourceFill: boolean
  blockFreeCellBase: boolean
  blockMovement: boolean
  allowSelectionOverlayAbove: boolean
  allowHoverOverlayAbove: boolean
}

export type WorldCellFootprintDefinition = {
  id: string
  role: WorldCellFootprintRole
  footprintTiles: [number, number]
  anchorRule: WorldCellFootprintAnchorRule
  cellOffsets: Array<[number, number]>
  drawLayer: WorldCellFootprintDrawLayer
  defaultCompositeId?: string
  placementPolicy: WorldCellFootprintPlacementPolicy
}

export type WorldCellCityFootprintTiles = 9 | 25 | 49 | 81

export type WorldCellFootprintManifest = {
  schema: 'world_cell_footprint_manifest_v1'
  generationContractVersion: 'world_cell_placement_contract_v1'
  projection: {
    type: 'isometric_2_to_1'
    runtimeTileSize: [200, 100]
    sourceCanvas: [384, 384]
    sourceFootprint: [320, 160]
    anchorRule: 'bottom_center'
  }
  drawOrder: Array<
    | 'cell_base'
    | 'resource_cell'
    | 'world_node'
    | 'debug_overlay'
    | 'selection_overlay'
    | 'hover_overlay'
  >
  footprints: Record<string, WorldCellFootprintDefinition>
}

function buildCenteredCellOffsets(sideLength: 3 | 5 | 7 | 9): Array<[number, number]> {
  const half = Math.floor(sideLength / 2)
  const offsets: Array<[number, number]> = []
  for (let y = -half; y <= half; y += 1) {
    for (let x = -half; x <= half; x += 1) {
      offsets.push([x, y])
    }
  }
  return offsets
}

export const WORLD_CELL_FOOTPRINT_MANIFEST_V1: WorldCellFootprintManifest = {
  schema: 'world_cell_footprint_manifest_v1',
  generationContractVersion: 'world_cell_placement_contract_v1',
  projection: {
    type: 'isometric_2_to_1',
    runtimeTileSize: [200, 100],
    sourceCanvas: [384, 384],
    sourceFootprint: [320, 160],
    anchorRule: 'bottom_center',
  },
  drawOrder: ['cell_base', 'resource_cell', 'world_node', 'debug_overlay', 'selection_overlay', 'hover_overlay'],
  footprints: {
    resource_1x1: {
      id: 'resource_1x1',
      role: 'resource',
      footprintTiles: [1, 1],
      anchorRule: 'center_cell',
      cellOffsets: [[0, 0]],
      drawLayer: 'resource_cell',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: false,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    player_city_3x3_initial: {
      id: 'player_city_3x3_initial',
      role: 'player_city',
      footprintTiles: [3, 3],
      anchorRule: 'center_cell',
      cellOffsets: [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [0, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ],
      drawLayer: 'world_node',
      defaultCompositeId: 'world_node_system_city_3x3_v1',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    ai_city_3x3_initial: {
      id: 'ai_city_3x3_initial',
      role: 'ai_city',
      footprintTiles: [3, 3],
      anchorRule: 'center_cell',
      cellOffsets: [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [0, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ],
      drawLayer: 'world_node',
      defaultCompositeId: 'world_node_capital_v1',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    system_city_l03_l04_3x3: {
      id: 'system_city_l03_l04_3x3',
      role: 'system_city',
      footprintTiles: [3, 3],
      anchorRule: 'center_cell',
      cellOffsets: buildCenteredCellOffsets(3),
      drawLayer: 'world_node',
      defaultCompositeId: 'world_node_system_city_5x5_v1',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    system_city_l05_l06_5x5: {
      id: 'system_city_l05_l06_5x5',
      role: 'system_city',
      footprintTiles: [5, 5],
      anchorRule: 'center_cell',
      cellOffsets: buildCenteredCellOffsets(5),
      drawLayer: 'world_node',
      defaultCompositeId: 'world_node_city_v1',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    system_city_l07_l08_7x7: {
      id: 'system_city_l07_l08_7x7',
      role: 'system_city',
      footprintTiles: [7, 7],
      anchorRule: 'center_cell',
      cellOffsets: buildCenteredCellOffsets(7),
      drawLayer: 'world_node',
      defaultCompositeId: 'world_node_system_city_7x7_v1',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    system_city_l09_9x9: {
      id: 'system_city_l09_9x9',
      role: 'system_city',
      footprintTiles: [9, 9],
      anchorRule: 'center_cell',
      cellOffsets: buildCenteredCellOffsets(9),
      drawLayer: 'world_node',
      defaultCompositeId: 'world_node_system_city_9x9_v1',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    pass_1x1: {
      id: 'pass_1x1',
      role: 'pass',
      footprintTiles: [1, 1],
      anchorRule: 'center_cell',
      cellOffsets: [[0, 0]],
      drawLayer: 'world_node',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    fort_1x1: {
      id: 'fort_1x1',
      role: 'fort',
      footprintTiles: [1, 1],
      anchorRule: 'center_cell',
      cellOffsets: [[0, 0]],
      drawLayer: 'world_node',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    dock_1x1: {
      id: 'dock_1x1',
      role: 'dock',
      footprintTiles: [1, 1],
      anchorRule: 'center_cell',
      cellOffsets: [[0, 0]],
      drawLayer: 'world_node',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    mountain_barrier_1x1: {
      id: 'mountain_barrier_1x1',
      role: 'mountain_barrier',
      footprintTiles: [1, 1],
      anchorRule: 'path_cells',
      cellOffsets: [[0, 0]],
      drawLayer: 'terrain_barrier',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: true,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
    river_corridor_1x1: {
      id: 'river_corridor_1x1',
      role: 'river_corridor',
      footprintTiles: [1, 1],
      anchorRule: 'path_cells',
      cellOffsets: [[0, 0]],
      drawLayer: 'terrain_corridor',
      placementPolicy: {
        reserveCells: true,
        blockResourceGeneration: true,
        blockResourceFill: true,
        blockFreeCellBase: true,
        blockMovement: false,
        allowSelectionOverlayAbove: true,
        allowHoverOverlayAbove: true,
      },
    },
  },
}

export function resolveWorldCellFootprintDefinition(
  manifest: WorldCellFootprintManifest,
  footprintId: string,
): WorldCellFootprintDefinition | undefined {
  return manifest.footprints[footprintId]
}

export function listWorldCellFootprintOffsets(definition: WorldCellFootprintDefinition): Array<[number, number]> {
  return definition.cellOffsets.length > 0 ? definition.cellOffsets : [[0, 0]]
}
