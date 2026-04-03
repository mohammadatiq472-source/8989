using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;

namespace SLGCommander
{
    /// <summary>
    /// Loads terrain PNGs from StreamingAssets at runtime,
    /// packs them into a single texture atlas, and provides
    /// UV rect lookups per terrain key.
    /// </summary>
    public class TerrainAtlas : MonoBehaviour
    {
        public static TerrainAtlas Instance { get; private set; }

        private Texture2D _atlas;
        private readonly Dictionary<string, Rect> _uvRects = new();

        public Texture2D AtlasTexture => _atlas;

        void Awake()
        {
            Instance = this;
            BuildAtlas();
        }

        // ── Atlas keys ──────────────────────────────────────────────────

        private static readonly string[] PNG_KEYS =
        {
            "wasteland_lv1",
            "food_lv2", "food_lv3", "food_lv4", "food_lv5",
            "iron_lv2", "iron_lv3", "iron_lv4", "iron_lv5",
            "stone_lv2", "stone_lv3", "stone_lv4", "stone_lv5",
            "wood_lv2", "wood_lv3", "wood_lv4", "wood_lv5",
        };

        // ── Build ────────────────────────────────────────────────────────

        private void BuildAtlas()
        {
            var textures = new List<Texture2D>();
            var names    = new List<string>();

            // Load PNGs from StreamingAssets/terrain/
            string terrainDir = Path.Combine(Application.streamingAssetsPath, "terrain");
            foreach (var key in PNG_KEYS)
            {
                string path = Path.Combine(terrainDir, key + ".png");
                if (File.Exists(path))
                {
                    byte[] bytes = File.ReadAllBytes(path);
                    var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                    tex.LoadImage(bytes);
                    tex.filterMode = FilterMode.Bilinear;
                    textures.Add(tex);
                    names.Add(key);
                }
                else
                {
                    Debug.LogWarning($"[TerrainAtlas] Missing: {path}");
                }
            }

            // Generate solid-color placeholders for city/pass/fog
            textures.Add(CreateSolid(new Color(0.85f, 0.55f, 0.20f))); names.Add("city");
            textures.Add(CreateSolid(new Color(0.40f, 0.40f, 0.40f))); names.Add("pass");
            textures.Add(CreateSolid(new Color(0.18f, 0.20f, 0.22f))); names.Add("fog");
            textures.Add(CreateSolid(new Color(0.32f, 0.27f, 0.22f))); names.Add("plain");

            // Pack into atlas
            _atlas = new Texture2D(4096, 4096, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode   = TextureWrapMode.Clamp,
            };
            Rect[] rects = _atlas.PackTextures(textures.ToArray(), 0, 4096, false);

            for (int i = 0; i < names.Count; i++)
                _uvRects[names[i]] = rects[i];

            // Destroy temporary textures
            foreach (var tex in textures)
                Destroy(tex);

            Debug.Log($"[TerrainAtlas] Packed {names.Count} textures into atlas.");
        }

        // ── Lookup ──────────────────────────────────────────────────────

        /// Returns the UV rect for a tile based on its type, terrain, resourceKind, and resourceLevel.
        public Rect GetUVRect(Tile tile)
        {
            string key = ResolveAtlasKey(tile);
            return _uvRects.TryGetValue(key, out var rect) ? rect : _uvRects.GetValueOrDefault("plain", default);
        }

        public static string ResolveAtlasKey(Tile tile)
        {
            switch (tile.type)
            {
                case "city":     return "city";
                case "pass":     return "pass";
                case "fog":      return "fog";
                case "resource": return ResolveResourceKey(tile);
                default:         return "wasteland_lv1";  // plain / unknown → wasteland
            }
        }

        private static string ResolveResourceKey(Tile tile)
        {
            string kind = tile.resourceKind;
            if (string.IsNullOrEmpty(kind)) kind = "food";

            int level = tile.resourceLevel ?? 2;
            // Map levels 1-9 → PNG levels 2-5
            int pngLevel;
            if (level <= 2)      pngLevel = 2;
            else if (level <= 4) pngLevel = 3;
            else if (level <= 6) pngLevel = 4;
            else                 pngLevel = 5;

            return $"{kind}_lv{pngLevel}";
        }

        // ── Helpers ──────────────────────────────────────────────────────

        private static Texture2D CreateSolid(Color color, int size = 32)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var pixels = new Color[size * size];
            for (int i = 0; i < pixels.Length; i++) pixels[i] = color;
            tex.SetPixels(pixels);
            tex.Apply();
            return tex;
        }
    }
}
