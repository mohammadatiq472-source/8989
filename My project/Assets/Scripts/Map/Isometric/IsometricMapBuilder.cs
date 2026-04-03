using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace YouZhou.Map
{
    /// <summary>
    /// 等距地图构建器 - 将 LogicalMapData(300×106) 渲染为 Unity Tilemap(900×318)
    /// Auto-tiling: 每个视觉 tile 独立检查 4 邻居，决定用内部平铺还是边缘 landscape 精灵
    /// </summary>
    public class IsometricMapBuilder : MonoBehaviour
    {
        [Serializable]
        public struct TerrainTrimRule
        {
            public TerrainType terrain;
            public bool trimGround;
            public bool trimEdge;
            [Range(0.1f, 1f)] public float topFraction;
        }

        [Header("Tilemap 引用")]
        public Tilemap groundTilemap;
        public Tilemap decorationTilemap;

        [Header("数据")]
        public MapSpriteDatabase spriteDatabase;

        [Header("地表裁切（去除泥土侧壁）")]
        [Tooltip("按地形控制裁切。留空时使用内置默认规则。")]
        public TerrainTrimRule[] terrainTrimRules;

        private LogicalMapData _mapData;
        private readonly Dictionary<Sprite, Tile> _tileCache = new();
        private readonly Dictionary<string, Sprite> _trimmedSpriteCache = new();
        private readonly Dictionary<TerrainType, MapSpriteDatabase.TerrainSpriteEntry> _entryCache = new();
        private readonly Dictionary<TerrainType, TerrainTrimRule> _trimRuleCache = new();
        private TerrainType[] _visualTerrainCache;
        private readonly List<Vector3Int> _decorPositionScratch = new();
        private readonly List<TileBase> _decorTileScratch = new();

        // 这些地形来自“立方体式”等距素材，原图会露出下半部泥土/侧壁。
        // 运行时裁掉底部 50%，保留顶部地表面；ground/edge 可按地形规则分别控制是否裁切。
        private static readonly HashSet<TerrainType> DefaultTrimTerrains = new()
        {
            TerrainType.Snow,
            TerrainType.SnowForest,
            TerrainType.SnowRoad,
            TerrainType.River,
            TerrainType.FrozenRiver,
            TerrainType.FrozenLake,
            TerrainType.Grass,
            TerrainType.GrassForest,
            TerrainType.SnowTown,
            TerrainType.SnowMountain,
            TerrainType.CastleWall,
            TerrainType.Farmland,
        };

        private const float DefaultTrimTopFraction = 0.5f;
        private const float AggressiveTrimTopFraction = 0.42f;

        // 预分配缓存，避免每次 RebuildAll 重新分配 ~18MB
        private Vector3Int[] _rebuildPositionsCache;
        private TileBase[]   _rebuildTilesCache;

        public LogicalMapData MapData => _mapData;

        public IReadOnlyList<string> GetTrimRuleReportLines()
        {
            var report = new List<string>(24)
            {
                $"rulesConfigured={terrainTrimRules?.Length ?? 0}"
            };

            foreach (TerrainType terrain in Enum.GetValues(typeof(TerrainType)))
            {
                if ((int)terrain == 255) continue;
                var rule = ResolveTrimRule(terrain);
                if (!rule.trimGround && !rule.trimEdge) continue;
                report.Add(
                    $"{terrain}: ground={rule.trimGround}, edge={rule.trimEdge}, top={rule.topFraction:0.###}");
            }

            if (report.Count == 1)
                report.Add("no-active-trim-terrain");

            return report;
        }

        public void Initialize(LogicalMapData data)
        {
            _mapData = data;
            RebuildAll();
        }

        /// <summary>
        /// 重建整张地图视觉层（批量操作，高性能）
        /// 核心逻辑：每个视觉 tile 独立计算 4 邻居 bitmask，选择正确的 landscape 或平铺精灵
        /// </summary>
        public void RebuildAll()
        {
            if (_mapData == null || spriteDatabase == null) return;

            groundTilemap.ClearAllTiles();
            if (decorationTilemap != null)
                decorationTilemap.ClearAllTiles();

            int totalVW = LogicalMapData.VISUAL_WIDTH;
            int totalVH = LogicalMapData.VISUAL_HEIGHT;
            int total = totalVW * totalVH;
            EnsureVisualTerrainCache(total);
            _entryCache.Clear();
            _decorPositionScratch.Clear();
            _decorTileScratch.Clear();

            // 复用已分配缓存，仅首次或尺寸变更时重新分配
            if (_rebuildPositionsCache == null || _rebuildPositionsCache.Length != total)
            {
                _rebuildPositionsCache = new Vector3Int[total];
                _rebuildTilesCache     = new TileBase[total];
                // positions 坐标固定不变，只需填一次
                int pi = 0;
                for (int vx = 0; vx < totalVW; vx++)
                    for (int vy = 0; vy < totalVH; vy++)
                        _rebuildPositionsCache[pi++] = new Vector3Int(vx, vy, 0);
            }

            int idx = 0;
            for (int vx = 0; vx < totalVW; vx++)
            {
                for (int vy = 0; vy < totalVH; vy++)
                {
                    var terrain = GetVisualTerrain(vx, vy);
                    _visualTerrainCache[idx] = terrain;
                    var entry   = ResolveEntry(terrain);

                    if (entry != null)
                    {
                        int mask = ComputeAutotileMaskFromCache(vx, vy, terrain, totalVW, totalVH);
                        _rebuildTilesCache[idx] = GetCachedTile(SelectGroundSprite(entry, terrain, mask, vx, vy));

                        if (decorationTilemap != null && mask == 15)
                        {
                            int lx = vx / 3, ly = vy / 3;
                            int cx = lx * 3 + 1, cy = ly * 3 + 1;
                            if (vx == cx && vy == cy)
                                CollectDecorations(vx, vy, entry, _decorPositionScratch, _decorTileScratch);
                        }
                    }
                    else
                    {
                        _rebuildTilesCache[idx] = null;
                    }
                    idx++;
                }
            }

            groundTilemap.SetTiles(_rebuildPositionsCache, _rebuildTilesCache);

            if (decorationTilemap != null)
            {
                decorationTilemap.ClearAllTiles();
                if (_decorPositionScratch.Count > 0)
                    decorationTilemap.SetTiles(_decorPositionScratch.ToArray(), _decorTileScratch.ToArray());
            }

            Debug.Log($"[IsometricMapBuilder] 全图重建: {total} 视觉 tiles, {_decorPositionScratch.Count} 装饰 tiles");
        }

        /// <summary>重建单个逻辑块的 3×3 视觉 tiles（编辑器绘制时用，同时重建相邻块边缘）</summary>
        public void RebuildBlock(int lx, int ly)
        {
            if (_mapData == null || spriteDatabase == null) return;

            _entryCache.Clear();

            // 重建此块和邻近1格的视觉范围，确保边缘 tile 正确更新
            int vxMin = Mathf.Max(0, lx * 3 - 1);
            int vxMax = Mathf.Min(LogicalMapData.VISUAL_WIDTH - 1, lx * 3 + 3);
            int vyMin = Mathf.Max(0, ly * 3 - 1);
            int vyMax = Mathf.Min(LogicalMapData.VISUAL_HEIGHT - 1, ly * 3 + 3);

            int count = (vxMax - vxMin + 1) * (vyMax - vyMin + 1); // ≤ 25
            var gPositions = new Vector3Int[count];
            var gTiles     = new TileBase[count];

            // 装饰层收集（≤ 4 个装饰 + 25 个清除）
            var dPositions = new List<Vector3Int>(count + 4);
            var dTiles     = new List<TileBase>(count + 4);

            int idx = 0;
            for (int vx = vxMin; vx <= vxMax; vx++)
            {
                for (int vy = vyMin; vy <= vyMax; vy++)
                {
                    var pos     = new Vector3Int(vx, vy, 0);
                    var terrain = GetVisualTerrain(vx, vy);
                    var entry   = ResolveEntry(terrain);

                    gPositions[idx] = pos;

                    if (entry != null)
                    {
                        int mask = ComputeAutotileMask(vx, vy, terrain);
                        gTiles[idx] = GetCachedTile(SelectGroundSprite(entry, terrain, mask, vx, vy));

                        if (decorationTilemap != null)
                        {
                            // 先把此视觉 tile 的装饰清除
                            dPositions.Add(pos);
                            dTiles.Add(null);

                            // 仅在此逻辑块中心 + mask==15 时放新装饰
                            if (mask == 15 && vx >= lx * 3 && vx < lx * 3 + 3
                                           && vy >= ly * 3 && vy < ly * 3 + 3)
                            {
                                int tlx = vx / 3, tly = vy / 3;
                                int cx = tlx * 3 + 1, cy = tly * 3 + 1;
                                if (vx == cx && vy == cy)
                                    CollectDecorations(cx, cy, entry, dPositions, dTiles);
                            }
                        }
                    }
                    else
                    {
                        gTiles[idx] = null;
                    }
                    idx++;
                }
            }

            // 2 次批量调用代替原来最多 54 次单个 SetTile
            groundTilemap.SetTiles(gPositions, gTiles);
            if (decorationTilemap != null && dPositions.Count > 0)
                decorationTilemap.SetTiles(dPositions.ToArray(), dTiles.ToArray());
        }

        /// <summary>
        /// 重建指定逻辑块矩形区域的所有视觉 tiles（含1格边缘缓冲）。
        /// 对大笔刷比逐块调用 RebuildBlock 快数倍，因为消除了 tile 重叠的多次写入。
        /// </summary>
        public void RebuildRegion(int lxMin, int lyMin, int lxMax, int lyMax)
        {
            if (_mapData == null || spriteDatabase == null) return;

            _entryCache.Clear();

            int vxMin = Mathf.Max(0, lxMin * 3 - 1);
            int vxMax = Mathf.Min(LogicalMapData.VISUAL_WIDTH  - 1, lxMax * 3 + 3);
            int vyMin = Mathf.Max(0, lyMin * 3 - 1);
            int vyMax = Mathf.Min(LogicalMapData.VISUAL_HEIGHT - 1, lyMax * 3 + 3);

            int count = (vxMax - vxMin + 1) * (vyMax - vyMin + 1);
            var gPositions = new Vector3Int[count];
            var gTiles     = new TileBase[count];
            var dPositions = new List<Vector3Int>(count);
            var dTiles     = new List<TileBase>(count);

            int idx = 0;
            for (int vx = vxMin; vx <= vxMax; vx++)
            {
                for (int vy = vyMin; vy <= vyMax; vy++)
                {
                    var pos     = new Vector3Int(vx, vy, 0);
                    var terrain = GetVisualTerrain(vx, vy);
                    var entry   = ResolveEntry(terrain);

                    gPositions[idx] = pos;
                    if (entry != null)
                    {
                        int mask = ComputeAutotileMask(vx, vy, terrain);
                        gTiles[idx] = GetCachedTile(SelectGroundSprite(entry, terrain, mask, vx, vy));

                        if (decorationTilemap != null)
                        {
                            dPositions.Add(pos);
                            dTiles.Add(null);
                            if (mask == 15)
                            {
                                int lx = vx / 3, ly = vy / 3;
                                int cx = lx * 3 + 1, cy = ly * 3 + 1;
                                if (vx == cx && vy == cy)
                                    CollectDecorations(cx, cy, entry, dPositions, dTiles);
                            }
                        }
                    }
                    else { gTiles[idx] = null; }
                    idx++;
                }
            }

            groundTilemap.SetTiles(gPositions, gTiles);
            if (decorationTilemap != null && dPositions.Count > 0)
                decorationTilemap.SetTiles(dPositions.ToArray(), dTiles.ToArray());
        }
        /// <summary>
        /// 子像素邻居采样：3×3 视觉块中，中列保留自身地形，
        /// 左列显示左邻居地形，右列显示右邻居地形。
        /// 效果：官道/山口等细线特征只占 1 列像素宽，不会显得过粗。
        /// </summary>
        private TerrainType GetVisualTerrain(int vx, int vy)
        {
            if (vx < 0 || vx >= LogicalMapData.VISUAL_WIDTH ||
                vy < 0 || vy >= LogicalMapData.VISUAL_HEIGHT)
                return (TerrainType)255; // 越界 = 不同地形

            int lx = vx / 3, ly = vy / 3;
            int dx = vx % 3;

            // 左列采样左邻居，右列采样右邻居，中列保持自身
            if (dx == 0 && lx > 0) lx--;
            else if (dx == 2 && lx < LogicalMapData.WIDTH - 1) lx++;

            return _mapData.GetTerrain(lx, ly);
        }

        // ── 核心：4邻居 bitmask，bit3=N bit2=E bit1=S bit0=W ──
        // N = (vx, vy+1), E = (vx+1, vy), S = (vx, vy-1), W = (vx-1, vy)
        private int ComputeAutotileMask(int vx, int vy, TerrainType self)
        {
            int mask = 0;
            if (GetVisualTerrain(vx,     vy + 1) == self) mask |= 8; // N
            if (GetVisualTerrain(vx + 1, vy)     == self) mask |= 4; // E
            if (GetVisualTerrain(vx,     vy - 1) == self) mask |= 2; // S
            if (GetVisualTerrain(vx - 1, vy)     == self) mask |= 1; // W
            return mask;
        }

        private int ComputeAutotileMaskFromCache(int vx, int vy, TerrainType self, int width, int height)
        {
            int mask = 0;
            if (GetVisualTerrainFromCache(vx,     vy + 1, width, height) == self) mask |= 8; // N
            if (GetVisualTerrainFromCache(vx + 1, vy,     width, height) == self) mask |= 4; // E
            if (GetVisualTerrainFromCache(vx,     vy - 1, width, height) == self) mask |= 2; // S
            if (GetVisualTerrainFromCache(vx - 1, vy,     width, height) == self) mask |= 1; // W
            return mask;
        }

        private TerrainType GetVisualTerrainFromCache(int vx, int vy, int width, int height)
        {
            if (_visualTerrainCache == null ||
                vx < 0 || vx >= width ||
                vy < 0 || vy >= height)
            {
                return (TerrainType)255;
            }

            return _visualTerrainCache[vx * height + vy];
        }

        // ── 核心：根据 mask 选择精灵 ──
        private Sprite SelectGroundSprite(MapSpriteDatabase.TerrainSpriteEntry entry, TerrainType terrain, int mask, int vx, int vy)
        {
            // mask==15: 全部邻居相同 → 内部平铺
            if (mask == 15)
            {
                if (entry.groundSprites != null && entry.groundSprites.Length > 0)
                    return GetRenderedGroundSprite(entry.groundSprites[SpatialHash(vx, vy, entry.groundSprites.Length)], terrain);
                return null;
            }

            // mask < 15: 有邻居不同 → 优先用 autoTileEdges
            if (entry.autoTileEdges != null && entry.autoTileEdges.Length == 16
                && entry.autoTileEdges[mask] != null)
                return GetRenderedEdgeSprite(entry.autoTileEdges[mask], terrain);

            // fallback: 无 autoTile 配置 → 用内部精灵
            if (entry.groundSprites != null && entry.groundSprites.Length > 0)
                return GetRenderedGroundSprite(entry.groundSprites[SpatialHash(vx, vy, entry.groundSprites.Length)], terrain);

            return null;
        }

        private Sprite GetRenderedGroundSprite(Sprite source, TerrainType terrain)
            => GetRenderedSprite(source, terrain, isEdge: false);

        private Sprite GetRenderedEdgeSprite(Sprite source, TerrainType terrain)
            => GetRenderedSprite(source, terrain, isEdge: true);

        private Sprite GetRenderedSprite(Sprite source, TerrainType terrain, bool isEdge)
        {
            if (source == null) return null;

            var rule = ResolveTrimRule(terrain);
            bool shouldTrim = isEdge ? rule.trimEdge : rule.trimGround;
            if (!shouldTrim)
                return source;

            float topFraction = Mathf.Clamp(rule.topFraction, 0.1f, 1f);
            string cacheKey = BuildTrimCacheKey(source, topFraction);
            if (_trimmedSpriteCache.TryGetValue(cacheKey, out var cached))
                return cached;

            var trimmed = CreateTopCropSprite(source, topFraction);
            _trimmedSpriteCache[cacheKey] = trimmed;
            return trimmed;
        }

        private static string BuildTrimCacheKey(Sprite source, float topFraction)
            => $"{source.GetInstanceID()}@{Mathf.RoundToInt(topFraction * 1000f)}";

        private TerrainTrimRule ResolveTrimRule(TerrainType terrain)
        {
            if (_trimRuleCache.TryGetValue(terrain, out var cached))
                return cached;

            if (terrainTrimRules != null)
            {
                for (int i = 0; i < terrainTrimRules.Length; i++)
                {
                    var rule = terrainTrimRules[i];
                    if (rule.terrain != terrain) continue;
                    if (rule.topFraction <= 0f)
                        rule.topFraction = DefaultTrimTopFraction;
                    _trimRuleCache[terrain] = rule;
                    return rule;
                }
            }

            bool isDefaultTrimTerrain = DefaultTrimTerrains.Contains(terrain);
            var fallback = new TerrainTrimRule
            {
                terrain = terrain,
                trimGround = isDefaultTrimTerrain,
                trimEdge = isDefaultTrimTerrain,
                topFraction = GetDefaultTrimTopFraction(terrain)
            };
            _trimRuleCache[terrain] = fallback;
            return fallback;
        }

        private static float GetDefaultTrimTopFraction(TerrainType terrain)
        {
            switch (terrain)
            {
                case TerrainType.SnowRoad:
                case TerrainType.River:
                case TerrainType.FrozenRiver:
                case TerrainType.FrozenLake:
                    return AggressiveTrimTopFraction;
                default:
                    return DefaultTrimTopFraction;
            }
        }

        private static Sprite CreateTopCropSprite(Sprite source, float topFraction)
        {
            var srcRect = source.rect;
            float clamped = Mathf.Clamp(topFraction, 0.1f, 1f);
            int cropHeight = Mathf.Clamp(Mathf.RoundToInt(srcRect.height * clamped), 1, Mathf.RoundToInt(srcRect.height));
            if (cropHeight >= Mathf.RoundToInt(srcRect.height))
                return source;

            float cropY = srcRect.y + srcRect.height - cropHeight;
            var cropRect = new Rect(srcRect.x, cropY, srcRect.width, cropHeight);

            // 保留原始 pivot 在裁切后的位置，避免 tile anchor 漂移。
            var pivot = new Vector2(
                source.pivot.x / srcRect.width,
                (source.pivot.y - (srcRect.height - cropHeight)) / cropHeight
            );
            pivot.x = Mathf.Clamp01(pivot.x);
            pivot.y = Mathf.Clamp01(pivot.y);

            var cropped = Sprite.Create(
                source.texture,
                cropRect,
                pivot,
                source.pixelsPerUnit,
                0,
                SpriteMeshType.FullRect,
                source.border
            );
            cropped.name = $"{source.name}__top{Mathf.RoundToInt(clamped * 100)}";
            cropped.hideFlags = HideFlags.HideAndDontSave;
            return cropped;
        }

        // 收集单个逻辑块中心的装饰 tile（供 RebuildAll 批量收集用）
        private void CollectDecorations(int cx, int cy, MapSpriteDatabase.TerrainSpriteEntry entry,
            List<Vector3Int> positions, List<TileBase> tiles)
        {
            if (entry?.decorationSprites == null || entry.decorationSprites.Length == 0
                || entry.decorationsPerBlock <= 0) return;

            int count = Mathf.Min(entry.decorationsPerBlock, 4);
            // 固定偏移，不再每次分配临时数组。
            for (int i = 0; i < count && i < DecorationOffsets.Length; i++)
            {
                int dvx = cx + DecorationOffsets[i].x;
                int dvy = cy + DecorationOffsets[i].y;
                if (dvx < 0 || dvy < 0 ||
                    dvx >= LogicalMapData.VISUAL_WIDTH ||
                    dvy >= LogicalMapData.VISUAL_HEIGHT) continue;
                int si = SpatialHash(dvx + i * 37, dvy + i * 53, entry.decorationSprites.Length);
                positions.Add(new Vector3Int(dvx, dvy, 0));
                tiles.Add(GetCachedTile(entry.decorationSprites[si]));
            }
        }

        private void PlaceDecorationAt(int vx, int vy, MapSpriteDatabase.TerrainSpriteEntry entry)
        {
            // 以逻辑块中心(dx=1,dy=1)作为装饰锚点，避免每个 tile 都放
            int lx = vx / 3, ly = vy / 3;
            int cx = lx * 3 + 1, cy = ly * 3 + 1;
            if (vx != cx || vy != cy) return; // 只在逻辑块中心放

            // 按 decorationsPerBlock 在此块内放置装饰
            int count = Mathf.Min(entry.decorationsPerBlock, 4);
            for (int i = 0; i < count && i < DecorationOffsets.Length; i++)
            {
                int dvx = cx + DecorationOffsets[i].x;
                int dvy = cy + DecorationOffsets[i].y;
                if (dvx < 0 || dvy < 0) continue;
                int si = SpatialHash(dvx + i * 37, dvy + i * 53, entry.decorationSprites.Length);
                decorationTilemap.SetTile(
                    new Vector3Int(dvx, dvy, 0),
                    GetCachedTile(entry.decorationSprites[si]));
            }
        }

        private static readonly Vector2Int[] DecorationOffsets =
        {
            new(0, 0),
            new(-1, 1),
            new(1, -1),
            new(-1, -1),
        };

        private Tile GetCachedTile(Sprite sprite)
        {
            if (sprite == null) return null;
            if (!_tileCache.TryGetValue(sprite, out var tile))
            {
                tile = ScriptableObject.CreateInstance<Tile>();
                tile.sprite = sprite;
                _tileCache[sprite] = tile;
            }
            return tile;
        }

        private MapSpriteDatabase.TerrainSpriteEntry ResolveEntry(TerrainType terrain)
        {
            if (_entryCache.TryGetValue(terrain, out var cached))
            {
                return cached;
            }

            var entry = spriteDatabase.GetEntry(terrain);
            _entryCache[terrain] = entry;
            return entry;
        }

        private void EnsureVisualTerrainCache(int total)
        {
            if (_visualTerrainCache == null || _visualTerrainCache.Length != total)
            {
                _visualTerrainCache = new TerrainType[total];
            }
        }

        private void OnValidate()
        {
            _trimRuleCache.Clear();
            _trimmedSpriteCache.Clear();
        }

        private static int SpatialHash(int x, int y, int mod)
        {
            if (mod <= 0) return 0;
            int h = (x * 73856093) ^ (y * 19349663);
            return ((h % mod) + mod) % mod;
        }
    }
}
