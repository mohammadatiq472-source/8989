using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using TMPro;

namespace SLGCommander
{
    /// <summary>
    /// Renders unit tokens (small coloured rectangles with troop counts) on the
    /// isometric map.  Uses object pooling to avoid per-frame allocation.
    /// Sorting order stays below the selection indicator; per-token renderQueue
    /// and local Z offsets provide stable isometric depth within that band.
    ///
    /// Friendly tokens: bg=#0B3B1E  border=#3DC46E  text=troop count
    /// Other tokens:    bg=#3B0B0B  border=#C43D3D  text="?"
    /// </summary>
    public class UnitTokenRenderer : MonoBehaviour
    {
        // ── Sizing (34×14 px / 46 ≈ 0.74 × 0.30 Unity units) ────────────

        private const float TOKEN_W             = 0.74f;
        private const float TOKEN_H             = 0.30f;
        private const float BORDER_THICK        = 0.02f;    // ~1 px border
        private const float Y_OFFSET            = 0.15f;    // above tile center
        private const float STACK_X_OFFSET      = 0.44f;    // 2nd unit horizontal shift
        private const float BASE_Z_DEPTH        = -1.0f;    // in front of terrain, behind selection
        private const float TILE_Z_STEP         = -0.0025f;  // deeper tiles render slightly earlier
        private const float STACK_Z_STEP        = -0.0005f;  // stacked units on same tile
        private const int   BASE_RENDER_QUEUE   = 3000;
        private const int   QUEUE_STEP_PER_TILE = 2;
        private const int   QUEUE_STEP_PER_STACK = 1;
        private const int   MAX_QUEUE_SPREAD    = 2000;

        // Colors
        private static readonly Color BG_PLAYER     = HexToColor(0x0B3B1E);
        private static readonly Color BORDER_PLAYER  = HexToColor(0x3DC46E);
        private static readonly Color BG_ENEMY       = HexToColor(0x3B0B0B);
        private static readonly Color BORDER_ENEMY   = HexToColor(0xC43D3D);
        private static readonly Color TEXT_COLOR      = new(1f, 1f, 1f, 0.92f);

        // ── Inspector ────────────────────────────────────────────────────

        [Tooltip("TMP Font asset used for troop labels.")]
        public TMP_FontAsset font;

        // ── Pool ─────────────────────────────────────────────────────────

        private readonly List<TokenVisual> _active = new();
        private readonly Stack<TokenVisual> _pool  = new();

        private Material _tokenMat;
        private string   _playerFactionId;

        // ── Internal visual wrapper ──────────────────────────────────────

        private class TokenVisual
        {
            public GameObject   root;
            public MeshFilter   bgFilter;
            public MeshRenderer bgRenderer;
            public MeshFilter   borderFilter;
            public MeshRenderer borderRenderer;
            public TextMeshPro  label;
            public Material     bodyMaterial;
            public Material     labelMaterial;
        }

        // ── Unity lifecycle ───────────────────────────────────────────────

        void Start()
        {
            EnsureMaterial();
            if (GameManager.Instance != null)
            {
                _playerFactionId = GameManager.Instance.playerFactionId;
                GameManager.Instance.OnWorldUpdated += Rebuild;
            }
        }

        void OnDestroy()
        {
            if (GameManager.Instance)
                GameManager.Instance.OnWorldUpdated -= Rebuild;

            DisposeVisuals(_active);
            DisposeVisuals(_pool);
        }

        // ── Rebuild all tokens ───────────────────────────────────────────

        private void Rebuild(WorldState world)
        {
            _playerFactionId = GameManager.Instance != null
                ? GameManager.Instance.playerFactionId
                : string.Empty;
            if (string.IsNullOrWhiteSpace(_playerFactionId))
            {
                _playerFactionId = ResolveHumanFactionId(world);
            }

            // Return all active tokens to pool
            foreach (var tv in _active)
            {
                tv.root.SetActive(false);
                _pool.Push(tv);
            }
            _active.Clear();

            if (world.units == null || world.units.Count == 0) return;

            // Group units by tileId so we can stack and sort deterministically.
            var byTile = new Dictionary<string, List<Unit>>();
            foreach (var u in world.units)
            {
                if (string.IsNullOrEmpty(u.tileId)) continue;
                if (!byTile.ContainsKey(u.tileId)) byTile[u.tileId] = new List<Unit>();
                byTile[u.tileId].Add(u);
            }

            var stackedTiles = new List<TileStack>(byTile.Count);
            foreach (var kv in byTile)
            {
                // Parse tile coords from id "x,y"
                if (!TryParseTileId(kv.Key, out int col, out int row)) continue;
                kv.Value.Sort(CompareUnitsForDisplay);
                stackedTiles.Add(new TileStack
                {
                    tileId = kv.Key,
                    col = col,
                    row = row,
                    units = kv.Value,
                });
            }

            stackedTiles.Sort(CompareTileStacks);

            foreach (var tileStack in stackedTiles)
            {
                Vector3 basePos = ChunkedMapRenderer.GridToWorld(tileStack.col, tileStack.row);
                basePos.y += Y_OFFSET;
                basePos.z  = BASE_Z_DEPTH + GetTileDepthOffset(tileStack.col, tileStack.row);

                var units = tileStack.units;
                // Render at most 2 tokens per tile (to keep visual clean)
                int count = Mathf.Min(units.Count, 2);
                for (int i = 0; i < count; i++)
                {
                    var unit = units[i];
                    bool isFriendlyFaction = !string.IsNullOrWhiteSpace(_playerFactionId) && unit.faction == _playerFactionId;

                    Vector3 pos = basePos;
                    if (i == 1) pos.x += STACK_X_OFFSET;
                    pos.z += GetStackDepthOffset(i);

                    var tv = GetOrCreate();
                    ConfigureRenderDepth(tv, tileStack.col, tileStack.row, i, pos);

                    // Set colors
                    Color bgCol = isFriendlyFaction ? BG_PLAYER : BG_ENEMY;
                    Color borderCol = isFriendlyFaction ? BORDER_PLAYER : BORDER_ENEMY;

                    SetQuadColors(tv.bgFilter.mesh, bgCol);
                    SetQuadColors(tv.borderFilter.mesh, borderCol);

                    // Label
                    tv.label.text = isFriendlyFaction ? FormatStrength(unit.strength) : "?";
                    tv.label.color = TEXT_COLOR;

                    _active.Add(tv);
                }
            }
        }

        // ── Pool management ──────────────────────────────────────────────

        private TokenVisual GetOrCreate()
        {
            if (_pool.Count > 0) return _pool.Pop();

            var tv = new TokenVisual();

            // Root
            tv.root = new GameObject("UnitToken");
            tv.root.transform.SetParent(transform, false);

            // Border quad (slightly larger)
            var borderGO = new GameObject("Border");
            borderGO.transform.SetParent(tv.root.transform, false);
            borderGO.transform.localPosition = Vector3.zero;
            tv.borderFilter   = borderGO.AddComponent<MeshFilter>();
            tv.borderRenderer = borderGO.AddComponent<MeshRenderer>();
            tv.borderFilter.mesh = BuildQuad(TOKEN_W + BORDER_THICK * 2f, TOKEN_H + BORDER_THICK * 2f, Color.white);
            tv.bodyMaterial = new Material(_tokenMat) { name = "TokenMat_Runtime_Instance" };
            tv.borderRenderer.sharedMaterial    = tv.bodyMaterial;
            tv.borderRenderer.shadowCastingMode = ShadowCastingMode.Off;
            tv.borderRenderer.receiveShadows    = false;
            tv.borderRenderer.sortingOrder      = 1;

            // BG quad
            var bgGO = new GameObject("BG");
            bgGO.transform.SetParent(tv.root.transform, false);
            bgGO.transform.localPosition = new Vector3(0f, 0f, -0.01f);
            tv.bgFilter   = bgGO.AddComponent<MeshFilter>();
            tv.bgRenderer = bgGO.AddComponent<MeshRenderer>();
            tv.bgFilter.mesh = BuildQuad(TOKEN_W, TOKEN_H, Color.white);
            tv.bgRenderer.sharedMaterial    = tv.bodyMaterial;
            tv.bgRenderer.shadowCastingMode = ShadowCastingMode.Off;
            tv.bgRenderer.receiveShadows    = false;
            tv.bgRenderer.sortingOrder      = 1;

            // TMP label
            var labelGO = new GameObject("Label");
            labelGO.transform.SetParent(tv.root.transform, false);
            labelGO.transform.localPosition = new Vector3(0f, 0f, -0.02f);
            tv.label = labelGO.AddComponent<TextMeshPro>();
            tv.label.font      = font;
            tv.label.fontSize   = 2.4f;
            tv.label.alignment  = TextAlignmentOptions.Center;
            tv.label.textWrappingMode = TextWrappingModes.NoWrap;
            tv.label.overflowMode = TextOverflowModes.Overflow;
            tv.label.sortingOrder = 1;

            var labelRenderer = tv.label.GetComponent<Renderer>();
            if (labelRenderer != null)
            {
                tv.labelMaterial = new Material(labelRenderer.sharedMaterial) { name = "TokenLabelMat_Runtime_Instance" };
                labelRenderer.sharedMaterial = tv.labelMaterial;
            }

            // Constrain rect to token size
            var rect = tv.label.rectTransform;
            rect.sizeDelta = new Vector2(TOKEN_W, TOKEN_H);

            return tv;
        }

        // ── Mesh helpers ─────────────────────────────────────────────────

        private static Mesh BuildQuad(float w, float h, Color color)
        {
            float hw = w * 0.5f;
            float hh = h * 0.5f;
            var verts = new Vector3[]
            {
                new(-hw, -hh, 0f),
                new( hw, -hh, 0f),
                new( hw,  hh, 0f),
                new(-hw,  hh, 0f),
            };
            var cols = new Color[] { color, color, color, color };
            var tris = new int[] { 0, 2, 1, 0, 3, 2 };

            var mesh = new Mesh { name = "TokenQuad" };
            mesh.vertices  = verts;
            mesh.colors    = cols;
            mesh.triangles = tris;
            mesh.RecalculateBounds();
            return mesh;
        }

        private static void SetQuadColors(Mesh mesh, Color color)
        {
            var cols = new Color[] { color, color, color, color };
            mesh.colors = cols;
        }

        private void ConfigureRenderDepth(TokenVisual tv, int col, int row, int stackIndex, Vector3 pos)
        {
            tv.root.SetActive(true);
            tv.root.transform.position = pos;

            int queue = BASE_RENDER_QUEUE
                      + Mathf.Clamp((col + row) * QUEUE_STEP_PER_TILE + stackIndex * QUEUE_STEP_PER_STACK, 0, MAX_QUEUE_SPREAD);
            tv.bodyMaterial.renderQueue = queue;
            if (tv.labelMaterial != null)
            {
                tv.labelMaterial.renderQueue = queue + 1;
            }
        }

        private static float GetTileDepthOffset(int col, int row)
        {
            return (col + row) * TILE_Z_STEP;
        }

        private static float GetStackDepthOffset(int stackIndex)
        {
            return stackIndex * STACK_Z_STEP;
        }

        // ── Format helpers ───────────────────────────────────────────────

        /// Formats strength: <10000 → integer, ≥10000 → "X万"
        private static string FormatStrength(float strength)
        {
            int s = Mathf.RoundToInt(strength);
            if (s < 10000) return s.ToString();
            float wan = s / 10000f;
            // Show one decimal if < 10万, otherwise integer
            return wan < 10f
                ? $"{wan:F1}\u4e07"   // X.X万
                : $"{Mathf.RoundToInt(wan)}\u4e07"; // X万
        }

        /// Parse tile id "x,y" → col, row
        private static bool TryParseTileId(string id, out int col, out int row)
        {
            col = row = 0;
            if (string.IsNullOrEmpty(id)) return false;
            int comma = id.IndexOf(',');
            if (comma < 0) return false;
            return int.TryParse(id.Substring(0, comma), out col)
                && int.TryParse(id.Substring(comma + 1), out row);
        }

        private static Color HexToColor(int hex) =>
            new(((hex >> 16) & 0xFF) / 255f,
                ((hex >> 8)  & 0xFF) / 255f,
                ( hex        & 0xFF) / 255f);

        private static int CompareTileStacks(TileStack left, TileStack right)
        {
            int depthLeft = left.col + left.row;
            int depthRight = right.col + right.row;
            int depthCompare = depthLeft.CompareTo(depthRight);
            if (depthCompare != 0) return depthCompare;

            int rowCompare = left.row.CompareTo(right.row);
            if (rowCompare != 0) return rowCompare;

            int colCompare = left.col.CompareTo(right.col);
            if (colCompare != 0) return colCompare;

            return string.CompareOrdinal(left.tileId, right.tileId);
        }

        private int CompareUnitsForDisplay(Unit left, Unit right)
        {
            bool leftFriendly = !string.IsNullOrWhiteSpace(_playerFactionId) && left.faction == _playerFactionId;
            bool rightFriendly = !string.IsNullOrWhiteSpace(_playerFactionId) && right.faction == _playerFactionId;

            if (leftFriendly != rightFriendly)
            {
                return leftFriendly ? -1 : 1;
            }

            int strengthCompare = right.strength.CompareTo(left.strength);
            if (strengthCompare != 0) return strengthCompare;

            return string.CompareOrdinal(left.id, right.id);
        }

        // ── Material ─────────────────────────────────────────────────────

        private void EnsureMaterial()
        {
            if (_tokenMat != null) return;
            var shader = Shader.Find("Custom/VertexColor")
                      ?? Shader.Find("Sprites/Default");
            _tokenMat = new Material(shader) { name = "TokenMat_Runtime" };
        }

        private static string ResolveHumanFactionId(WorldState world)
        {
            if (world?.factions == null || world.factions.Count == 0)
            {
                return string.Empty;
            }

            string bestFactionId = string.Empty;
            int bestScore = int.MinValue;
            foreach (var factionEntry in world.factions)
            {
                var factionId = factionEntry.Key;
                if (string.IsNullOrWhiteSpace(factionId) || factionId == "neutral")
                {
                    continue;
                }

                var unitScore = world.units?.FindAll(unit => unit.faction == factionId).Count ?? 0;
                var tileScore = CountControlledTiles(world, factionId);
                var score = unitScore * 1000 + tileScore;
                if (score > bestScore)
                {
                    bestScore = score;
                    bestFactionId = factionId;
                }
            }

            return bestFactionId;
        }

        private static int CountControlledTiles(WorldState world, string factionId)
        {
            if (world?.map == null || string.IsNullOrWhiteSpace(factionId))
            {
                return 0;
            }

            if (world.map.tileStates != null && world.map.tileStates.Count > 0)
            {
                return world.map.tileStates.FindAll(tile => tile != null && tile.owner == factionId).Count;
            }

            if (world.map.tiles != null && world.map.tiles.Count > 0)
            {
                return world.map.tiles.FindAll(tile => tile != null && tile.owner == factionId).Count;
            }

            return 0;
        }

        private static void DisposeVisuals(IEnumerable<TokenVisual> visuals)
        {
            foreach (var tv in visuals)
            {
                if (tv == null) continue;
                if (tv.bodyMaterial != null)
                {
                    Object.Destroy(tv.bodyMaterial);
                }

                if (tv.labelMaterial != null)
                {
                    Object.Destroy(tv.labelMaterial);
                }

                if (tv.root != null)
                {
                    Object.Destroy(tv.root);
                }
            }
        }

        private class TileStack
        {
            public string tileId;
            public int col;
            public int row;
            public List<Unit> units;
        }
    }
}
