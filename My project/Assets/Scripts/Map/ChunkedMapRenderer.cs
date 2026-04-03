using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace SLGCommander
{
    /// <summary>
    /// Renders the 320×320 isometric tile map using chunk meshes with a texture atlas.
    /// Each 32×32 chunk is one MeshRenderer / draw call.
    /// Diamond half-extents: HALF_W=1.0 unit, HALF_H=0.5 unit.
    ///
    /// Visual mapping:
    ///   plain  → wasteland PNG
    ///   resource → food/iron/stone/wood PNG (by kind + level)
    ///   city   → orange solid
    ///   pass   → gray solid
    ///   fog    → dark solid
    /// Faction tint via vertex color multiplication.
    /// </summary>
    public class ChunkedMapRenderer : MonoBehaviour
    {
        // ── Isometric constants ──────────────────────────────────────────

        public const float HALF_W     = 1.0f;
        public const float HALF_H     = 0.5f;
        public const int   CHUNK_SIZE = 32;
        public const float TILE_SCALE = 1.0f;

        // ── Inspector ────────────────────────────────────────────────────

        [Tooltip("Material for tile fill (will be auto-configured with atlas).")]
        public Material tileMaterial;

        [Tooltip("Material for wireframe borders.")]
        public Material borderMaterial;

        [Header("Player Faction")]
        public string playerFactionId = string.Empty;

        // ── State ────────────────────────────────────────────────────────

        private readonly Dictionary<string, Tile> _tileById = new();
        private readonly List<ChunkData>          _chunks   = new();
        private Camera _mainCam;
        private Plane[] _frustumPlanes = new Plane[6];
        private TerrainAtlas _atlas;

        private class ChunkData
        {
            public GameObject fillGO;
            public GameObject borderGO;
            public Bounds     bounds;
        }

        // ── Coordinate helpers (static) ──────────────────────────────────

        public static Vector3 GridToWorld(int col, int row) =>
            new((col - row) * HALF_W, -(col + row) * HALF_H, 0f);

        public static Vector2Int WorldToGrid(Vector2 worldXY)
        {
            float col = (worldXY.x - 2f * worldXY.y) / 2f;
            float row = (-2f * worldXY.y - worldXY.x) / 2f;
            return new Vector2Int(Mathf.RoundToInt(col), Mathf.RoundToInt(row));
        }

        public Tile GetTileAt(Vector3 worldPos)
        {
            var g = WorldToGrid(new Vector2(worldPos.x, worldPos.y));
            if (_tileById.TryGetValue($"grid_{g.x}_{g.y}", out var t)) return t;
            if (_tileById.TryGetValue($"{g.x},{g.y}", out t)) return t;
            return null;
        }

        // ── Unity lifecycle ──────────────────────────────────────────────

        void Start()
        {
            _mainCam = Camera.main;

            // Auto-create TerrainAtlas if not present
            _atlas = FindFirstObjectByType<TerrainAtlas>();
            if (_atlas == null)
            {
                var atlasGO = new GameObject("TerrainAtlas");
                _atlas = atlasGO.AddComponent<TerrainAtlas>();
            }

            EnsureMaterials();
            if (GameManager.Instance != null)
            {
                playerFactionId = GameManager.Instance.playerFactionId;
                GameManager.Instance.OnWorldUpdated += BuildMap;
            }
        }

        void OnDestroy()
        {
            if (GameManager.Instance)
                GameManager.Instance.OnWorldUpdated -= BuildMap;
        }

        void Update()
        {
            CullChunks();
        }

        // ── Frustum culling ──────────────────────────────────────────────

        private void CullChunks()
        {
            if (_mainCam == null || _chunks.Count == 0) return;

            GeometryUtility.CalculateFrustumPlanes(_mainCam, _frustumPlanes);

            float defaultSize = 40f;
            float camSize = _mainCam.orthographicSize;
            float overscan = Mathf.Max(140f / 46f,
                Mathf.Min(420f / 46f, (220f / 46f) / camSize * defaultSize));

            foreach (var cd in _chunks)
            {
                if (cd.fillGO == null) continue;

                var expanded = cd.bounds;
                expanded.Expand(overscan * 2f);

                bool visible = GeometryUtility.TestPlanesAABB(_frustumPlanes, expanded);
                if (cd.fillGO.activeSelf != visible)
                {
                    cd.fillGO.SetActive(visible);
                    if (cd.borderGO != null) cd.borderGO.SetActive(visible);
                }
            }
        }

        // ── Map building ─────────────────────────────────────────────────

        public void BuildMap(WorldState world)
        {
            if (world == null || world.map == null || world.map.tiles == null)
            {
                Debug.LogWarning("[Map] BuildMap skipped: world/map/tiles is null.");
                return;
            }

            if (GameManager.Instance != null)
                playerFactionId = GameManager.Instance.playerFactionId;

            int tileCount = world.map.tiles.Count;
            _tileById.Clear();
            foreach (var t in world.map.tiles)
                _tileById[t.id] = t;

            foreach (var cd in _chunks)
            {
                if (cd.fillGO != null) Destroy(cd.fillGO);
                if (cd.borderGO != null) Destroy(cd.borderGO);
            }
            _chunks.Clear();

            var groups = new Dictionary<(int cx, int cy), List<Tile>>(
                Mathf.Max(4, tileCount / (CHUNK_SIZE * CHUNK_SIZE) + 1));
            foreach (var tile in world.map.tiles)
            {
                int cx = tile.x >= 0 ? tile.x / CHUNK_SIZE : (tile.x - CHUNK_SIZE + 1) / CHUNK_SIZE;
                int cy = tile.y >= 0 ? tile.y / CHUNK_SIZE : (tile.y - CHUNK_SIZE + 1) / CHUNK_SIZE;
                var key = (cx, cy);
                if (!groups.TryGetValue(key, out var bucket))
                {
                    bucket = new List<Tile>(Mathf.Min(CHUNK_SIZE * CHUNK_SIZE, tileCount));
                    groups[key] = bucket;
                }
                bucket.Add(tile);
            }

            foreach (var kv in groups)
            {
                var cd = BuildChunkPair(kv.Key.cx, kv.Key.cy, kv.Value);
                _chunks.Add(cd);
            }

            Debug.Log($"[Map] Built {_chunks.Count} chunks for {world.map.tiles.Count} tiles.");
        }

        // ── Chunk mesh construction ──────────────────────────────────────

        private ChunkData BuildChunkPair(int cx, int cy, List<Tile> tiles)
        {
            int n = tiles.Count;
            bool hasAtlas = _atlas != null && _atlas.AtlasTexture != null;

            // ── Fill mesh ───────────────────────────────────────────────
            var verts  = new Vector3[n * 4];
            var colors = new Color32[n * 4];
            var uvs    = new Vector2[n * 4];
            var tris   = new int[n * 6];

            // ── Border mesh ─────────────────────────────────────────────
            var bVerts  = new Vector3[n * 16];
            var bColors = new Color32[n * 16];
            var bTris   = new int[n * 24];

            float borderHalfThickness = 0.012f;

            Bounds chunkBounds = default;
            bool boundsInit = false;

            for (int i = 0; i < n; i++)
            {
                var tile   = tiles[i];
                var center = GridToWorld(tile.x, tile.y);

                // ── Faction tint as vertex color (multiplied with texture) ──
                Color32 c32 = GetFactionTint(tile);

                // ── UV rect from atlas ──────────────────────────────────
                Rect uvRect;
                if (hasAtlas)
                {
                    uvRect = _atlas.GetUVRect(tile);
                }
                else
                {
                    uvRect = new Rect(0, 0, 1, 1);
                    // Fallback: encode terrain color into vertex color directly
                    c32 = ToColor32(GetTerrainColorFallback(tile));
                }

                // ── Diamond vertices: Top, Right, Bottom, Left ──────────
                float sw = HALF_W * TILE_SCALE;
                float sh = HALF_H * TILE_SCALE;
                Vector3 top   = center + new Vector3(0f,   sh,  0f);
                Vector3 right = center + new Vector3(sw,   0f,  0f);
                Vector3 bot   = center + new Vector3(0f,  -sh,  0f);
                Vector3 left  = center + new Vector3(-sw,  0f,  0f);

                int v = i * 4;
                verts[v]     = top;
                verts[v + 1] = right;
                verts[v + 2] = bot;
                verts[v + 3] = left;
                colors[v] = colors[v + 1] = colors[v + 2] = colors[v + 3] = c32;

                // ── UVs: map diamond corners to texture rect ────────────
                // Diamond inscribed in square texture:
                //   top=(0.5,1), right=(1,0.5), bottom=(0.5,0), left=(0,0.5)
                uvs[v]     = new Vector2(uvRect.x + uvRect.width * 0.5f, uvRect.y + uvRect.height);
                uvs[v + 1] = new Vector2(uvRect.x + uvRect.width,        uvRect.y + uvRect.height * 0.5f);
                uvs[v + 2] = new Vector2(uvRect.x + uvRect.width * 0.5f, uvRect.y);
                uvs[v + 3] = new Vector2(uvRect.x,                       uvRect.y + uvRect.height * 0.5f);

                int t = i * 6;
                tris[t]     = v;     tris[t + 1] = v + 1; tris[t + 2] = v + 2;
                tris[t + 3] = v;     tris[t + 4] = v + 2; tris[t + 5] = v + 3;

                // ── Border wireframe ────────────────────────────────────
                Color borderColor = new Color(1f, 1f, 1f, 0.26f);
                var bc32 = ToColor32(borderColor);
                int bv = i * 16;
                int bt = i * 24;
                for (int e = 0; e < 4; e++)
                {
                    Vector3 a;
                    Vector3 b2;
                    switch (e)
                    {
                        case 0:
                            a = top;
                            b2 = right;
                            break;
                        case 1:
                            a = right;
                            b2 = bot;
                            break;
                        case 2:
                            a = bot;
                            b2 = left;
                            break;
                        default:
                            a = left;
                            b2 = top;
                            break;
                    }
                    Vector3 dir = (b2 - a).normalized;
                    Vector3 normal = new Vector3(-dir.y, dir.x, 0f) * borderHalfThickness;

                    int bvi = bv + e * 4;
                    bVerts[bvi]     = a - normal;
                    bVerts[bvi + 1] = a + normal;
                    bVerts[bvi + 2] = b2 + normal;
                    bVerts[bvi + 3] = b2 - normal;

                    bColors[bvi] = bColors[bvi + 1] = bColors[bvi + 2] = bColors[bvi + 3] = bc32;

                    int bti = bt + e * 6;
                    bTris[bti]     = bvi;     bTris[bti + 1] = bvi + 1; bTris[bti + 2] = bvi + 2;
                    bTris[bti + 3] = bvi;     bTris[bti + 4] = bvi + 2; bTris[bti + 5] = bvi + 3;
                }

                // ── Bounds ──────────────────────────────────────────────
                if (!boundsInit) { chunkBounds = new Bounds(center, Vector3.zero); boundsInit = true; }
                chunkBounds.Encapsulate(top);
                chunkBounds.Encapsulate(right);
                chunkBounds.Encapsulate(bot);
                chunkBounds.Encapsulate(left);
            }

            // ── Fill game object ────────────────────────────────────────
            var fillMesh = new Mesh { indexFormat = IndexFormat.UInt32, name = $"Chunk_{cx}_{cy}" };
            fillMesh.SetVertices(verts);
            fillMesh.SetColors(colors);
            fillMesh.SetUVs(0, uvs);
            fillMesh.SetTriangles(tris, 0);
            fillMesh.RecalculateBounds();

            var fillGO = new GameObject($"Chunk_{cx}_{cy}");
            fillGO.AddComponent<MeshFilter>().mesh = fillMesh;
            var mr = fillGO.AddComponent<MeshRenderer>();
            mr.sharedMaterial    = tileMaterial;
            mr.shadowCastingMode = ShadowCastingMode.Off;
            mr.receiveShadows    = false;
            mr.sortingOrder      = 0;
            fillGO.transform.SetParent(transform, false);

            // ── Border game object ──────────────────────────────────────
            var borderMesh = new Mesh { indexFormat = IndexFormat.UInt32, name = $"Border_{cx}_{cy}" };
            borderMesh.SetVertices(bVerts);
            borderMesh.SetColors(bColors);
            borderMesh.SetTriangles(bTris, 0);
            borderMesh.RecalculateBounds();

            var borderGO = new GameObject($"Border_{cx}_{cy}");
            borderGO.AddComponent<MeshFilter>().mesh = borderMesh;
            var bmr = borderGO.AddComponent<MeshRenderer>();
            bmr.sharedMaterial    = borderMaterial ?? tileMaterial;
            bmr.shadowCastingMode = ShadowCastingMode.Off;
            bmr.receiveShadows    = false;
            bmr.sortingOrder      = 0;
            borderGO.transform.SetParent(transform, false);

            chunkBounds.Expand(new Vector3(0, 0, 10f));

            return new ChunkData
            {
                fillGO   = fillGO,
                borderGO = borderGO,
                bounds   = chunkBounds,
            };
        }

        // ── Faction tint (vertex color that multiplies texture) ──────────

        private Color32 GetFactionTint(Tile tile)
        {
            if (string.IsNullOrEmpty(tile.owner) || tile.owner == "neutral")
                return new Color32(255, 255, 255, 255); // white = no tint

            if (IsHumanOwner(tile.owner))
            {
                // Subtle green tint: (0.82, 1.0, 0.85)
                return new Color32(209, 255, 217, 255);
            }

            // Enemy tint: (1.0, 0.85, 0.82)
            return new Color32(255, 217, 209, 255);
        }

        // ── Fallback color when atlas is not ready ───────────────────────

        private Color GetTerrainColorFallback(Tile tile)
        {
            Color baseColor = GetSpecialColorFallback(tile, out bool isSpecial);
            if (!isSpecial) baseColor = GetTerrainColor(tile.terrain);

            if (!string.IsNullOrEmpty(tile.owner) && tile.owner != "neutral")
            {
                if (IsHumanOwner(tile.owner))
                    baseColor = Blend(baseColor, new Color(0.561f, 0.898f, 0.647f), 0.24f);
                else
                    baseColor = Blend(baseColor, new Color(1.0f, 0.647f, 0.561f), 0.24f);
            }
            return baseColor;
        }

        private bool IsHumanOwner(string owner)
        {
            if (string.IsNullOrWhiteSpace(owner) || owner == "neutral")
            {
                return false;
            }

            var humanFactionId = playerFactionId?.Trim();
            if (string.IsNullOrWhiteSpace(humanFactionId))
            {
                return false;
            }

            return owner == humanFactionId;
        }

        private static Color GetSpecialColorFallback(Tile tile, out bool isSpecial)
        {
            isSpecial = true;
            if (tile.type == "fog")      return HexToColor(0x2D3338);
            if (tile.type == "pass")     return HexToColor(0x646563);
            if (tile.type == "city")     return new Color(0.85f, 0.55f, 0.20f);
            if (tile.type == "resource") return HexToColor(0x72592F);
            isSpecial = false;
            return Color.black;
        }

        private static Color GetTerrainColor(string terrain)
        {
            return terrain switch
            {
                "grassland" => HexToColor(0x416D3E),
                "forest"    => HexToColor(0x325E3B),
                "highland"  => HexToColor(0x6A5F3A),
                "mountain"  => HexToColor(0x5F5C56),
                "riverland" => HexToColor(0x36657A),
                "urban"     => HexToColor(0x6D5F4B),
                "wasteland" => HexToColor(0x524539),
                _           => new Color(0.17f, 0.17f, 0.17f),
            };
        }

        // ── Helpers ──────────────────────────────────────────────────────

        private static Color Blend(Color baseC, Color overlay, float t) =>
            baseC * (1f - t) + overlay * t;

        private static Color HexToColor(int hex) =>
            new(((hex >> 16) & 0xFF) / 255f,
                ((hex >> 8)  & 0xFF) / 255f,
                ( hex        & 0xFF) / 255f);

        private static Color32 ToColor32(Color c) =>
            new((byte)(c.r * 255), (byte)(c.g * 255), (byte)(c.b * 255), (byte)(c.a * 255));

        // ── Material creation ────────────────────────────────────────────

        private void EnsureMaterials()
        {
            // Use Sprites/Default for atlas: it multiplies texture × vertex color
            var shader = Shader.Find("Sprites/Default");

            if (tileMaterial == null)
            {
                tileMaterial = new Material(shader) { name = "TileMat_Atlas" };
                // Ensure proper alpha blending for PNG textures with transparency
                tileMaterial.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                tileMaterial.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
            }

            // Assign atlas texture if available
            if (_atlas != null && _atlas.AtlasTexture != null)
            {
                tileMaterial.mainTexture = _atlas.AtlasTexture;
            }

            if (borderMaterial == null)
            {
                var borderShader = Shader.Find("Sprites/Default");
                borderMaterial = new Material(borderShader) { name = "BorderMat_Runtime" };
                borderMaterial.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                borderMaterial.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                borderMaterial.SetInt("_ZWrite", 0);
                borderMaterial.renderQueue = 3000;
            }
        }
    }
}
