using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SLGCommander
{
    /// <summary>
    /// Static full-map overview panel.
    /// When opened, renders a low-res pixel map colored by terrain + faction
    /// showing nation territories, cities, and war zones.
    /// </summary>
    public class OverviewPanel : MonoBehaviour
    {
        public static OverviewPanel Instance { get; private set; }

        private const int MAP_SIZE = 320;
        private const int TEX_SIZE = 320;   // 1 pixel per tile

        private GameObject _panel;
        private RawImage   _mapImage;
        private Texture2D  _mapTex;
        private bool       _isOpen;

        // Color presets
        private static readonly Color COL_WASTELAND = new(0.32f, 0.27f, 0.22f);
        private static readonly Color COL_RESOURCE  = new(0.45f, 0.36f, 0.18f);
        private static readonly Color COL_CITY      = new(0.85f, 0.55f, 0.20f);
        private static readonly Color COL_PASS      = new(0.40f, 0.40f, 0.40f);
        private static readonly Color COL_FOG       = new(0.18f, 0.20f, 0.22f);
        private static readonly Color COL_MOUNTAIN  = new(0.37f, 0.36f, 0.34f);
        private static readonly Color COL_FOREST    = new(0.20f, 0.37f, 0.23f);
        private static readonly Color COL_RIVER     = new(0.21f, 0.40f, 0.48f);
        private static readonly Color COL_PLAYER    = new(0.30f, 0.70f, 0.40f);
        private static readonly Color COL_ENEMY     = new(0.75f, 0.30f, 0.25f);

        void Awake()
        {
            Instance = this;
        }

        public void Toggle()
        {
            if (_panel == null) Build();
            _isOpen = !_isOpen;
            _panel.SetActive(_isOpen);
            if (_isOpen) Refresh();
        }

        public void Close()
        {
            _isOpen = false;
            if (_panel != null) _panel.SetActive(false);
        }

        // ── Build UI ─────────────────────────────────────────────────────

        private void Build()
        {
            // Find the UICanvas
            var canvas = GameObject.Find("UICanvas")?.GetComponent<Canvas>();
            if (canvas == null) return;

            // Semi-transparent backdrop
            _panel = new GameObject("OverviewPanel");
            _panel.transform.SetParent(canvas.transform, false);
            var panelRT = _panel.AddComponent<RectTransform>();
            panelRT.anchorMin = Vector2.zero;
            panelRT.anchorMax = Vector2.one;
            panelRT.offsetMin = Vector2.zero;
            panelRT.offsetMax = Vector2.zero;

            var bg = _panel.AddComponent<Image>();
            bg.color = new Color(0.02f, 0.03f, 0.05f, 0.88f);

            // Title label
            var titleGO = new GameObject("Title");
            titleGO.transform.SetParent(_panel.transform, false);
            var titleRT = titleGO.AddComponent<RectTransform>();
            titleRT.anchorMin = new Vector2(0.5f, 1f);
            titleRT.anchorMax = new Vector2(0.5f, 1f);
            titleRT.pivot     = new Vector2(0.5f, 1f);
            titleRT.anchoredPosition = new Vector2(0, -16);
            titleRT.sizeDelta = new Vector2(400, 40);
            var titleTMP = titleGO.AddComponent<TMPro.TextMeshProUGUI>();
            titleTMP.text      = "\u5168\u5c40\u6982\u89c8";  // 全局概览
            titleTMP.fontSize  = 22;
            titleTMP.color     = new Color(0.94f, 0.78f, 0.45f);
            titleTMP.alignment = TMPro.TextAlignmentOptions.Center;

            // Map texture image (centered, square, fill most of panel)
            var imgGO = new GameObject("MapImage");
            imgGO.transform.SetParent(_panel.transform, false);
            var imgRT = imgGO.AddComponent<RectTransform>();
            imgRT.anchorMin = new Vector2(0.1f, 0.08f);
            imgRT.anchorMax = new Vector2(0.9f, 0.88f);
            imgRT.offsetMin = Vector2.zero;
            imgRT.offsetMax = Vector2.zero;

            // Force square aspect via AspectRatioFitter
            var arf = imgGO.AddComponent<AspectRatioFitter>();
            arf.aspectMode  = AspectRatioFitter.AspectMode.FitInParent;
            arf.aspectRatio = 1f;

            _mapImage = imgGO.AddComponent<RawImage>();
            _mapTex = new Texture2D(TEX_SIZE, TEX_SIZE, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode   = TextureWrapMode.Clamp,
            };
            _mapImage.texture = _mapTex;

            // Close button
            var closeGO = new GameObject("CloseBtn");
            closeGO.transform.SetParent(_panel.transform, false);
            var closeRT = closeGO.AddComponent<RectTransform>();
            closeRT.anchorMin = new Vector2(1f, 1f);
            closeRT.anchorMax = new Vector2(1f, 1f);
            closeRT.pivot     = new Vector2(1f, 1f);
            closeRT.anchoredPosition = new Vector2(-12, -12);
            closeRT.sizeDelta = new Vector2(40, 40);
            var closeBg = closeGO.AddComponent<Image>();
            closeBg.color = new Color(0.6f, 0.2f, 0.2f, 0.8f);
            var closeBtn = closeGO.AddComponent<Button>();
            closeBtn.onClick.AddListener(Close);

            var closeLbl = new GameObject("X");
            closeLbl.transform.SetParent(closeGO.transform, false);
            var closeLblRT = closeLbl.AddComponent<RectTransform>();
            closeLblRT.anchorMin = Vector2.zero;
            closeLblRT.anchorMax = Vector2.one;
            closeLblRT.offsetMin = Vector2.zero;
            closeLblRT.offsetMax = Vector2.zero;
            var closeTMP = closeLbl.AddComponent<TMPro.TextMeshProUGUI>();
            closeTMP.text      = "\u2715";
            closeTMP.fontSize  = 20;
            closeTMP.color     = Color.white;
            closeTMP.alignment = TMPro.TextAlignmentOptions.Center;

            // Click on map to close & jump
            var clickHandler = imgGO.AddComponent<Button>();
            clickHandler.onClick.AddListener(() =>
            {
                // Get click position relative to image
                // ScreenSpaceOverlay uses null camera for ScreenPointToLocalPointInRectangle
                Camera eventCam = canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : (canvas.worldCamera ?? Camera.main);
                if (RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    imgRT, UnityEngine.InputSystem.Mouse.current.position.ReadValue(),
                    eventCam, out Vector2 localPos))
                {
                    float nx = (localPos.x - imgRT.rect.xMin) / imgRT.rect.width;
                    float ny = (localPos.y - imgRT.rect.yMin) / imgRT.rect.height;
                    int col = Mathf.Clamp(Mathf.RoundToInt(nx * MAP_SIZE), 0, MAP_SIZE - 1);
                    int row = Mathf.Clamp(Mathf.RoundToInt(ny * MAP_SIZE), 0, MAP_SIZE - 1);
                    // Invert Y because texture Y=0 is bottom
                    row = MAP_SIZE - 1 - row;

                    var cam = FindFirstObjectByType<MapCamera>();
                    if (cam != null)
                    {
                        var worldPos = ChunkedMapRenderer.GridToWorld(col, row);
                        cam.transform.position = new Vector3(worldPos.x, worldPos.y, cam.transform.position.z);
                    }
                    Close();
                }
            });

            _panel.SetActive(false);
        }

        // ── Render overview texture ──────────────────────────────────────

        private void Refresh()
        {
            if (GameManager.Instance?.World?.map?.tiles == null) return;

            var tiles = GameManager.Instance.World.map.tiles;
            string playerFaction = GameManager.Instance.playerFactionId;

            // Build lookup: (x,y) → tile
            var lookup = new Dictionary<(int, int), Tile>(tiles.Count);
            foreach (var t in tiles)
                lookup[(t.x, t.y)] = t;

            var pixels = new Color[TEX_SIZE * TEX_SIZE];
            Color bgColor = new Color(0.05f, 0.06f, 0.08f);

            for (int y = 0; y < TEX_SIZE; y++)
            {
                for (int x = 0; x < TEX_SIZE; x++)
                {
                    // Texture Y=0 is bottom, map Y=0 is top row
                    int mapY = TEX_SIZE - 1 - y;
                    Color col;

                    if (lookup.TryGetValue((x, mapY), out Tile tile))
                    {
                        col = GetOverviewColor(tile, playerFaction);
                    }
                    else
                    {
                        col = bgColor;
                    }

                    pixels[y * TEX_SIZE + x] = col;
                }
            }

            _mapTex.SetPixels(pixels);
            _mapTex.Apply();
        }

        private static Color GetOverviewColor(Tile tile, string playerFaction)
        {
            // Base terrain color
            Color baseCol = tile.type switch
            {
                "city"     => COL_CITY,
                "pass"     => COL_PASS,
                "fog"      => COL_FOG,
                "resource" => COL_RESOURCE,
                _ => tile.terrain switch
                {
                    "mountain"  => COL_MOUNTAIN,
                    "forest"    => COL_FOREST,
                    "riverland" => COL_RIVER,
                    _           => COL_WASTELAND,
                }
            };

            // Faction overlay (stronger than gameplay tint for clear territory view)
            if (!string.IsNullOrEmpty(tile.owner) && tile.owner != "neutral")
            {
                Color factionCol = tile.owner == playerFaction ? COL_PLAYER : COL_ENEMY;
                return Color.Lerp(baseCol, factionCol, 0.45f);
            }

            return baseCol;
        }
    }
}
