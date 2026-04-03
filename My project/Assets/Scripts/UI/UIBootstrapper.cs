using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.TextCore.LowLevel;
using UnityEngine.UI;

namespace SLGCommander
{
    /// <summary>
    /// Runtime UI bootstrapper — creates the entire HUD hierarchy from code
    /// so we never need manual drag-and-drop in the Editor.
    /// Execution order is set before GameHUD (-100 vs default 0).
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public class UIBootstrapper : MonoBehaviour
    {
        // ── Color Palette (Dark-Gold SLG) ─────────────────────────────────

        static readonly Color COL_TOPBAR_BG   = new(0.024f, 0.039f, 0.055f, 0.85f);
        static readonly Color COL_TEXT         = new(0.91f, 0.89f, 0.82f, 1f);
        static readonly Color COL_GOLD         = new(0.94f, 0.78f, 0.45f, 1f);
        static readonly Color COL_TEXT_DIM     = new(0.56f, 0.54f, 0.50f, 1f);
        static readonly Color COL_BTN_NORMAL   = new(0.086f, 0.110f, 0.141f, 0.9f);
        static readonly Color COL_BTN_HIGHLIGHT= new(0.745f, 0.596f, 0.306f, 0.3f);
        static readonly Color COL_BTN_PRESSED  = new(0.30f, 0.24f, 0.12f, 0.95f);
        static readonly Color COL_PANEL_BG     = new(0.039f, 0.055f, 0.078f, 0.92f);
        static readonly Color COL_PANEL_BORDER = new(0.745f, 0.596f, 0.306f, 0.18f);

        const float REF_W = 1920f;
        const float REF_H = 1080f;

        TMP_FontAsset _font;

        // ═══════════════════════════════════════════════════════════════════
        //  Awake — build everything
        // ═══════════════════════════════════════════════════════════════════

        void Awake()
        {
            // Try to create a dynamic CJK-capable font from OS system fonts.
            // This enables Chinese text rendering without bundling a CJK SDF asset.
            _font = CreateDynamicCJKFont();
            if (_font == null)
            {
                try { _font = TMP_Settings.defaultFontAsset; } catch { }
                if (_font == null)
                    _font = Resources.Load<TMP_FontAsset>("Fonts & Materials/LiberationSans SDF");
            }
            if (_font == null)
                Debug.LogWarning("[UIBootstrapper] No TMP font available");

            EnsureEventSystem();

            var canvas = CreateCanvas();
            var canvasRT = canvas.GetComponent<RectTransform>();

            // ── Top Bar ───────────────────────────────────────────────────
            var topBar = CreateTopBar(canvasRT,
                out var tickLabel,
                out var foodLabel,
                out var apLabel,
                out var loadingLabel);

            // ── AI Quota Notice (top-right callout) ──────────────────────
            CreateQuotaNoticePanel(canvasRT,
                out var quotaNoticeLabel);

            // ── Tile Info Panel ───────────────────────────────────────────
            var tilePanel = CreateTileInfoPanel(canvasRT,
                out var tileNameLabel,
                out var tileTerrainLabel,
                out var tileOwnerLabel,
                out var tileCoordLabel);

            // ── Unit Info Panel ───────────────────────────────────────────
            var unitPanel = CreateUnitInfoPanel(canvasRT,
                out var unitNameLabel,
                out var unitStatusLabel,
                out var unitStrengthLabel,
                out var heroQualityLabel);

            // ── Button Bar (right-bottom) ─────────────────────────────────
            CreateButtonBar(canvasRT,
                out var advanceTickBtn,
                out var refreshBtn);

            // ── Overview Button (top-right magnifying glass) ──────────────
            CreateOverviewButton(canvasRT);

            // ── Bottom Dock ───────────────────────────────────────────────
            CreateBottomDock(canvasRT);

            // ── Wire up GameHUD ───────────────────────────────────────────
            var hud = FindAnyObjectByType<GameHUD>();
            if (hud == null)
            {
                hud = canvas.AddComponent<GameHUD>();
            }

            hud.tickLabel       = tickLabel;
            hud.foodLabel       = foodLabel;
            hud.apLabel         = apLabel;
            hud.loadingLabel    = loadingLabel;
            hud.quotaNoticeLabel= quotaNoticeLabel;

            hud.tileInfoRoot    = tilePanel;
            hud.tileNameLabel   = tileNameLabel;
            hud.tileTerrainLabel= tileTerrainLabel;
            hud.tileOwnerLabel  = tileOwnerLabel;
            hud.tileCoordLabel  = tileCoordLabel;

            hud.unitInfoRoot    = unitPanel;
            hud.unitNameLabel   = unitNameLabel;
            hud.unitStatusLabel = unitStatusLabel;
            hud.unitStrengthLabel = unitStrengthLabel;
            hud.heroQualityLabel= heroQualityLabel;

            hud.advanceTickBtn  = advanceTickBtn;
            hud.refreshBtn      = refreshBtn;

            Debug.Log("[UIBootstrapper] HUD build complete");
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Dynamic CJK Font — creates TMP_FontAsset from OS font at runtime
        // ═══════════════════════════════════════════════════════════════════

        static TMP_FontAsset CreateDynamicCJKFont()
        {
            // Try common CJK system fonts (Windows / macOS / Linux)
            string[] candidates = {
                "Microsoft YaHei",   // Windows
                "SimHei",            // Windows fallback
                "PingFang SC",       // macOS
                "Noto Sans CJK SC",  // Linux
                "Source Han Sans SC" // Cross-platform
            };

            foreach (var fontName in candidates)
            {
                try
                {
                    var osFont = Font.CreateDynamicFontFromOSFont(fontName, 36);
                    if (osFont == null) continue;

                    var tmpFont = TMP_FontAsset.CreateFontAsset(
                        osFont, 36, 4,
                        GlyphRenderMode.SDFAA,
                        1024, 1024,
                        AtlasPopulationMode.Dynamic);

                    if (tmpFont != null)
                    {
                        tmpFont.name = $"Dynamic_{fontName}";
                        Debug.Log($"[UIBootstrapper] Created dynamic CJK font: {fontName}");
                        return tmpFont;
                    }
                }
                catch (System.Exception e)
                {
                    Debug.LogWarning($"[UIBootstrapper] Font '{fontName}' failed: {e.Message}");
                }
            }

            Debug.LogWarning("[UIBootstrapper] No CJK system font available, falling back to default");
            return null;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  EventSystem
        // ═══════════════════════════════════════════════════════════════════

        static void EnsureEventSystem()
        {
            if (FindAnyObjectByType<EventSystem>() != null)
            {
                // If an existing EventSystem has the legacy StandaloneInputModule,
                // swap it for InputSystemUIInputModule to avoid per-frame exceptions.
                var existing = FindAnyObjectByType<EventSystem>().gameObject;
                var legacy = existing.GetComponent<StandaloneInputModule>();
                if (legacy != null)
                {
                    Object.Destroy(legacy);
                    if (existing.GetComponent<InputSystemUIInputModule>() == null)
                        existing.AddComponent<InputSystemUIInputModule>();
                }
                return;
            }

            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
            go.AddComponent<InputSystemUIInputModule>();
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Canvas
        // ═══════════════════════════════════════════════════════════════════

        static GameObject CreateCanvas()
        {
            var go = new GameObject("UICanvas");

            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;

            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(REF_W, REF_H);
            scaler.matchWidthOrHeight = 0.5f;

            go.AddComponent<GraphicRaycaster>();

            return go;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Top Bar
        // ═══════════════════════════════════════════════════════════════════

        GameObject CreateTopBar(RectTransform parent,
            out TextMeshProUGUI tickLabel,
            out TextMeshProUGUI foodLabel,
            out TextMeshProUGUI apLabel,
            out TextMeshProUGUI loadingLabel)
        {
            var bar = CreatePanel("TopBar", parent);
            var rt = bar.GetComponent<RectTransform>();
            SetAnchors(rt, 0f, 1f, 1f, 1f);                // top stretch
            rt.pivot = new Vector2(0.5f, 1f);
            rt.offsetMin = new Vector2(0f, -40f);            // height = 40
            rt.offsetMax = Vector2.zero;

            bar.GetComponent<Image>().color = COL_TOPBAR_BG;

            var hlg = bar.AddComponent<HorizontalLayoutGroup>();
            hlg.childAlignment = TextAnchor.MiddleLeft;
            hlg.spacing = 24f;
            hlg.padding = new RectOffset(16, 16, 0, 0);
            hlg.childForceExpandWidth = false;
            hlg.childForceExpandHeight = true;
            hlg.childControlWidth = true;
            hlg.childControlHeight = true;

            tickLabel    = CreateTMPChild(bar, "TickLabel",    "Tick: 0",  16, COL_TEXT,  180f);
            foodLabel    = CreateTMPChild(bar, "FoodLabel",    "Food: 0",  16, COL_TEXT,  160f);
            apLabel      = CreateTMPChild(bar, "APLabel",      "AP: 0",    16, COL_GOLD,  120f);
            loadingLabel = CreateTMPChild(bar, "LoadingLabel", "加载中...", 14, COL_GOLD,  140f);
            loadingLabel.gameObject.SetActive(false);

            return bar;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  AI Quota Notice
        // ═══════════════════════════════════════════════════════════════════

        GameObject CreateQuotaNoticePanel(RectTransform parent,
            out TextMeshProUGUI quotaNoticeLabel)
        {
            var panel = CreatePanel("QuotaNoticePanel", parent);
            var rt = panel.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(1f, 1f);
            rt.anchorMax = new Vector2(1f, 1f);
            rt.pivot = new Vector2(1f, 1f);
            rt.anchoredPosition = new Vector2(-12f, -50f);
            rt.sizeDelta = new Vector2(560f, 44f);

            panel.GetComponent<Image>().color = new Color(0.040f, 0.058f, 0.082f, 0.94f);
            AddBorder(panel);

            quotaNoticeLabel = CreateTMPChild(panel, "QuotaNoticeLabel", "", 14, COL_GOLD);
            var labelRT = quotaNoticeLabel.rectTransform;
            labelRT.anchorMin = Vector2.zero;
            labelRT.anchorMax = Vector2.one;
            labelRT.offsetMin = new Vector2(12f, 6f);
            labelRT.offsetMax = new Vector2(-12f, -6f);
            quotaNoticeLabel.alignment = TextAlignmentOptions.MidlineLeft;
            quotaNoticeLabel.enableWordWrapping = false;
            quotaNoticeLabel.overflowMode = TextOverflowModes.Ellipsis;

            panel.SetActive(false);
            return panel;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Tile Info Panel
        // ═══════════════════════════════════════════════════════════════════

        GameObject CreateTileInfoPanel(RectTransform parent,
            out TextMeshProUGUI nameLabel,
            out TextMeshProUGUI terrainLabel,
            out TextMeshProUGUI ownerLabel,
            out TextMeshProUGUI coordLabel)
        {
            var panel = CreateInfoPanel("TileInfoPanel", parent, 280f, 140f,
                new Vector2(0f, 0f), new Vector2(0f, 0f), 160f);   // left-bottom, yOffset = 160

            nameLabel    = CreateTMPChild(panel, "TileNameLabel",    "---", 18, COL_GOLD);
            nameLabel.fontStyle = FontStyles.Bold;

            terrainLabel = CreateTMPChild(panel, "TileTerrainLabel", "",    14, COL_TEXT);
            ownerLabel   = CreateTMPChild(panel, "TileOwnerLabel",   "",    14, COL_TEXT);
            coordLabel   = CreateTMPChild(panel, "TileCoordLabel",   "",    12, COL_TEXT_DIM);

            panel.SetActive(false);
            return panel;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Unit Info Panel
        // ═══════════════════════════════════════════════════════════════════

        GameObject CreateUnitInfoPanel(RectTransform parent,
            out TextMeshProUGUI nameLabel,
            out TextMeshProUGUI statusLabel,
            out TextMeshProUGUI strengthLabel,
            out TextMeshProUGUI heroLabel)
        {
            var panel = CreateInfoPanel("UnitInfoPanel", parent, 280f, 130f,
                new Vector2(0f, 0f), new Vector2(0f, 0f), 10f);    // left-bottom, just above bottom

            nameLabel     = CreateTMPChild(panel, "UnitNameLabel",     "---", 16, COL_GOLD);
            nameLabel.fontStyle = FontStyles.Bold;

            statusLabel   = CreateTMPChild(panel, "UnitStatusLabel",   "",    14, COL_TEXT);
            strengthLabel = CreateTMPChild(panel, "UnitStrengthLabel", "",    14, COL_TEXT);
            heroLabel     = CreateTMPChild(panel, "UnitQualityLabel",  "",    14, COL_TEXT);

            panel.SetActive(false);
            return panel;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Overview Button (top-right, magnifying glass icon)
        // ═══════════════════════════════════════════════════════════════════

        void CreateOverviewButton(RectTransform parent)
        {
            var btnGO = new GameObject("OverviewBtn");
            btnGO.transform.SetParent(parent, false);

            var rt = btnGO.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(1f, 1f);
            rt.anchorMax = new Vector2(1f, 1f);
            rt.pivot     = new Vector2(1f, 1f);
            rt.anchoredPosition = new Vector2(-12f, -56f);   // below top bar
            rt.sizeDelta = new Vector2(44f, 44f);

            var bg = btnGO.AddComponent<Image>();
            bg.color = COL_BTN_NORMAL;

            var outline = btnGO.AddComponent<Outline>();
            outline.effectColor    = COL_PANEL_BORDER;
            outline.effectDistance = new Vector2(1f, -1f);

            var btn = btnGO.AddComponent<Button>();
            var colors = btn.colors;
            colors.normalColor      = COL_BTN_NORMAL;
            colors.highlightedColor = COL_BTN_HIGHLIGHT;
            colors.pressedColor     = COL_BTN_PRESSED;
            btn.colors = colors;

            // Magnifying glass "🔍" text
            var lbl = new GameObject("Label");
            lbl.transform.SetParent(btnGO.transform, false);
            var lblRT = lbl.AddComponent<RectTransform>();
            lblRT.anchorMin = Vector2.zero;
            lblRT.anchorMax = Vector2.one;
            lblRT.offsetMin = Vector2.zero;
            lblRT.offsetMax = Vector2.zero;
            var tmp = lbl.AddComponent<TMPro.TextMeshProUGUI>();
            tmp.text      = "\U0001f50d"; // 🔍
            tmp.fontSize  = 22;
            tmp.color     = COL_GOLD;
            tmp.alignment = TMPro.TextAlignmentOptions.Center;

            // Ensure OverviewPanel exists (parented under canvas)
            var overviewPanel = FindAnyObjectByType<OverviewPanel>();
            if (overviewPanel == null)
            {
                var panelHost = new GameObject("OverviewPanelHost");
                panelHost.transform.SetParent(parent, false);
                overviewPanel = panelHost.AddComponent<OverviewPanel>();
            }

            btn.onClick.AddListener(() => overviewPanel.Toggle());
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Button Bar (right-bottom)
        // ═══════════════════════════════════════════════════════════════════

        void CreateButtonBar(RectTransform parent,
            out Button advanceTickBtn,
            out Button refreshBtn)
        {
            var bar = CreatePanel("ButtonBar", parent);
            var rt = bar.GetComponent<RectTransform>();
            SetAnchors(rt, 1f, 1f, 0f, 0f);                // right-bottom
            rt.pivot = new Vector2(1f, 0f);
            rt.anchoredPosition = new Vector2(-10f, 80f);   // above bottom dock
            rt.sizeDelta = new Vector2(280f, 90f);

            bar.GetComponent<Image>().color = Color.clear;

            var vlg = bar.AddComponent<VerticalLayoutGroup>();
            vlg.childAlignment = TextAnchor.MiddleRight;
            vlg.spacing = 6f;
            vlg.childForceExpandWidth = true;
            vlg.childForceExpandHeight = false;
            vlg.childControlWidth = true;
            vlg.childControlHeight = false;

            advanceTickBtn = CreateButton(bar, "AdvanceTickBtn", "推进回合", 36f);
            refreshBtn     = CreateButton(bar, "RefreshBtn",     "刷新",     36f);
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Bottom Dock (center-bottom, 8 buttons)
        // ═══════════════════════════════════════════════════════════════════

        void CreateBottomDock(RectTransform parent)
        {
            var dock = CreatePanel("BottomDock", parent);
            var rt = dock.GetComponent<RectTransform>();
            SetAnchors(rt, 0.5f, 0.5f, 0f, 0f);            // center-bottom
            rt.pivot = new Vector2(0.5f, 0f);
            rt.anchoredPosition = new Vector2(0f, 8f);
            rt.sizeDelta = new Vector2(720f, 56f);

            dock.GetComponent<Image>().color = COL_PANEL_BG;
            AddBorder(dock);

            var hlg = dock.AddComponent<HorizontalLayoutGroup>();
            hlg.childAlignment = TextAnchor.MiddleCenter;
            hlg.spacing = 4f;
            hlg.padding = new RectOffset(6, 6, 4, 4);
            hlg.childForceExpandWidth = true;
            hlg.childForceExpandHeight = true;
            hlg.childControlWidth = true;
            hlg.childControlHeight = true;

            string[] labels = { "指挥", "同盟", "作战", "战史", "AI", "招募", "背包", "设置" };
            string[] names  = { "CommandBtn", "AllianceBtn", "OperationsBtn", "HistoryBtn",
                                "AIBtn", "RecruitBtn", "BagBtn", "SettingsBtn" };

            for (int i = 0; i < labels.Length; i++)
            {
                var label = labels[i];
                var btn = CreateButton(dock, names[i], label, 0f); // height managed by layout
                btn.onClick.AddListener(() => Debug.Log($"[BottomDock] {label}"));
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Helper: Info Panel (left-bottom, with VerticalLayoutGroup)
        // ═══════════════════════════════════════════════════════════════════

        GameObject CreateInfoPanel(string name, RectTransform parent,
            float width, float height, Vector2 anchorMin, Vector2 anchorMax, float yOffset)
        {
            var panel = CreatePanel(name, parent);
            var rt = panel.GetComponent<RectTransform>();
            SetAnchors(rt, 0f, 0f, 0f, 0f);                // left-bottom
            rt.pivot = new Vector2(0f, 0f);
            rt.anchoredPosition = new Vector2(10f, yOffset);
            rt.sizeDelta = new Vector2(width, height);

            panel.GetComponent<Image>().color = COL_PANEL_BG;
            AddBorder(panel);

            var vlg = panel.AddComponent<VerticalLayoutGroup>();
            vlg.childAlignment = TextAnchor.UpperLeft;
            vlg.spacing = 4f;
            vlg.padding = new RectOffset(12, 12, 10, 10);
            vlg.childForceExpandWidth = true;
            vlg.childForceExpandHeight = false;
            vlg.childControlWidth = true;
            vlg.childControlHeight = true;

            return panel;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Helper: Panel with Image
        // ═══════════════════════════════════════════════════════════════════

        static GameObject CreatePanel(string name, RectTransform parent)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            return go;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Helper: Border (child Outline image)
        // ═══════════════════════════════════════════════════════════════════

        static void AddBorder(GameObject panel)
        {
            var border = new GameObject("Border", typeof(RectTransform), typeof(Image));
            border.transform.SetParent(panel.transform, false);

            var brt = border.GetComponent<RectTransform>();
            brt.anchorMin = Vector2.zero;
            brt.anchorMax = Vector2.one;
            brt.offsetMin = Vector2.zero;
            brt.offsetMax = Vector2.zero;

            var img = border.GetComponent<Image>();
            img.color = COL_PANEL_BORDER;
            img.raycastTarget = false;

            // Make it a thin outline by adding Outline component
            var outline = border.AddComponent<Outline>();
            outline.effectColor = COL_PANEL_BORDER;
            outline.effectDistance = new Vector2(1f, 1f);

            // The border image itself is nearly transparent fill; the outline is the visible part
            img.color = new Color(0f, 0f, 0f, 0.02f);
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Helper: TMP Label (child of layout group)
        // ═══════════════════════════════════════════════════════════════════

        TextMeshProUGUI CreateTMPChild(GameObject parent, string name,
            string text, float fontSize, Color color, float preferredWidth = 0f)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent.transform, false);

            var tmp = go.AddComponent<TextMeshProUGUI>();
            tmp.text = text;
            tmp.fontSize = fontSize;
            tmp.color = color;
            if (_font != null) tmp.font = _font;
            tmp.raycastTarget = false;
            tmp.enableAutoSizing = false;
            tmp.overflowMode = TextOverflowModes.Ellipsis;

            if (preferredWidth > 0f)
            {
                var le = go.AddComponent<LayoutElement>();
                le.preferredWidth = preferredWidth;
            }

            return tmp;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Helper: Button
        // ═══════════════════════════════════════════════════════════════════

        Button CreateButton(GameObject parent, string name, string label, float height)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent.transform, false);

            var img = go.GetComponent<Image>();
            img.color = COL_BTN_NORMAL;

            var btn = go.GetComponent<Button>();
            var colors = btn.colors;
            colors.normalColor      = COL_BTN_NORMAL;
            colors.highlightedColor = COL_BTN_HIGHLIGHT;
            colors.pressedColor     = COL_BTN_PRESSED;
            colors.selectedColor    = COL_BTN_HIGHLIGHT;
            colors.disabledColor    = new Color(0.06f, 0.06f, 0.06f, 0.5f);
            colors.fadeDuration     = 0.08f;
            btn.colors = colors;

            if (height > 0f)
            {
                var le = go.AddComponent<LayoutElement>();
                le.preferredHeight = height;
            }

            // Label
            var labelGO = new GameObject("Label", typeof(RectTransform));
            labelGO.transform.SetParent(go.transform, false);

            var lrt = labelGO.GetComponent<RectTransform>();
            lrt.anchorMin = Vector2.zero;
            lrt.anchorMax = Vector2.one;
            lrt.offsetMin = new Vector2(8f, 0f);
            lrt.offsetMax = new Vector2(-8f, 0f);

            var tmp = labelGO.AddComponent<TextMeshProUGUI>();
            tmp.text = label;
            tmp.fontSize = 14;
            tmp.font = _font;
            tmp.color = COL_TEXT;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.raycastTarget = false;

            return btn;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  Helper: Anchor shortcut
        // ═══════════════════════════════════════════════════════════════════

        static void SetAnchors(RectTransform rt,
            float minX, float maxX, float minY, float maxY)
        {
            rt.anchorMin = new Vector2(minX, minY);
            rt.anchorMax = new Vector2(maxX, maxY);
        }
    }
}
