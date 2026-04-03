using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using TMPro;
using YouZhou.Map;

namespace SLGCommander
{
    internal struct CityDotInfo
    {
        public float normX;
        public float normY;
        public int   rid;
        public bool  isJunzhi;
    }

    /// <summary>
    /// P5 战略地图面板 — 全国十三州州域可视化
    ///
    /// 功能：
    ///   - M 键Toggle打开/关闭（或通过 GameHUD 按钮）
    ///   - 使用 RegionsMapRenderer 异步构建 TileRegions 纹理（13州彩色）
    ///   - 叠加 94 郡治红点 + 315 县城白点（来自逆向 map_regions.json 坐标）
    ///   - 鼠标悬停显示郡/州名称（tooltip）
    ///   - 左键点击跳转幽州地图对应位置（若目标在幽州范围内）
    ///
    /// 坐标体系说明（重要）：
    ///   全局游戏坐标: pos = gx*10000 + gy, gx ∈ [1,1501] 南↓, gy ∈ [1,1501] 东→
    ///   幽州本地坐标: 300×106 逻辑格（IsometricMapBuilder 使用）
    ///   两者关系: 幽州郡归属 BBox 约 gx∈[1,270] gy∈[860,1501]（北方东部区域）
    ///   正确映射: TileRegionsLoader.GetJunxianIdAt(gx, gy) 需要全局坐标
    ///   ❌ 错误: 用幽州本地 (lx, ly) 直接传入 GetJunxianIdAt → 只查到幽州范围一角
    ///   ✅ 正确: 先将 lx/ly 映射到全局 gx/gy 再查询（见 YouZhouCoordBridge）
    /// </summary>
    public class StrategicMapPanel : MonoBehaviour
    {
        public static StrategicMapPanel Instance { get; private set; }

        // ── 游戏坐标范围（全国） ───────────────────────────────────────────
        private const int GX_MIN = 1,    GX_MAX = 1851;
        private const int GY_MIN = 1,    GY_MAX = 1501;

        // ── 纹理分辨率 ─────────────────────────────────────────────────────
        private const int TEX_W = 1001;   // 宽 (Y方向)
        private const int TEX_H = 1234;   // 高 (X方向), ≈ (GX_MAX/GY_MAX)*TEX_W

        // ── 13州颜色表 ─────────────────────────────────────────────────────
        private static readonly (int rid, string hex, string name)[] REGION_DEFS =
        {
            ( 1,"2ecc71","司隶"), ( 3,"f39c12","兖州"), ( 4,"e67e22","豫州"),
            ( 5,"3498db","冀州"), ( 6,"1abc9c","青州"), ( 7,"9b59b6","徐州"),
            ( 8,"f1c40f","扬州"), ( 9,"e74c3c","并州"), (10,"d4ac0d","凉州"),
            (11,"e91e63","益州"),(12,"00bcd4","幽州"),(13,"8bc34a","荆州"),
            (15,"ff5722","交州"),
        };

        private Color[] _ridToColor;
        private string[] _ridToName;

        // ── UI 元素 ────────────────────────────────────────────────────────
        private GameObject  _panel;
        private RawImage    _mapRawImage;
        private TextMeshProUGUI _tooltipTMP;
        private TextMeshProUGUI _statusTMP;
        private bool        _isOpen;

        // ── 纹理 ──────────────────────────────────────────────────────────
        private Texture2D   _mapTex;
        private bool        _texReady;

        // ── 城市点叠加 ────────────────────────────────────────────────────
        // 由 MapRegionsData 加载的郡/县中心点（全局坐标）
        private List<CityDotInfo> _cityDots;

        // ── Unity 生命周期 ─────────────────────────────────────────────────
        void Awake()
        {
            Instance = this;
            BuildColorTable();
        }

        void Start()
        {
            // 提前触发 TileRegionsLoader 加载（不阻塞 Start 返回）
            StartCoroutine(PreloadData());
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.M)) Toggle();
        }

        // ── 公开接口 ──────────────────────────────────────────────────────
        public void Toggle()
        {
            if (_panel == null) Build();
            _isOpen = !_isOpen;
            _panel.SetActive(_isOpen);
            if (_isOpen && !_texReady) StartCoroutine(BuildMapTexture());
        }

        public void Close()
        {
            _isOpen = false;
            if (_panel != null) _panel.SetActive(false);
        }

        // ── 数据预加载 ────────────────────────────────────────────────────
        private IEnumerator PreloadData()
        {
            // 触发 TileRegionsLoader 同步加载
            TileRegionsLoader.GetJunxianIdAt(1, 1);
            yield return null;

            // 加载城市点
            LoadCityDots();
        }

        private void LoadCityDots()
        {
            _cityDots = new List<CityDotInfo>();
            var regions = MapRegionsLoader.Load();
            if (regions == null) return;

            float xSpan = GX_MAX - GX_MIN;
            float ySpan = GY_MAX - GY_MIN;

            // 郡治（大红点）
            foreach (var j in regions.junxian)
            {
                if (j.center.x <= 0 || j.center.y <= 0) continue;
                int rid = j.effectiveRegionId > 0 ? j.effectiveRegionId : j.originalRegionId;
                float nx = (j.center.y - GY_MIN) / ySpan;   // Y→ 对应纹理横轴
                float ny = 1f - (j.center.x - GX_MIN) / xSpan; // X↓ 对应纹理纵轴，翻转
                _cityDots.Add(new CityDotInfo { normX = nx, normY = ny, rid = rid, isJunzhi = true });
            }

            // 县城（小白点）
            foreach (var x in regions.xian)
            {
                if (x.center.x <= 0 || x.center.y <= 0) continue;
                int rid = x.effectiveRegionId > 0 ? x.effectiveRegionId : x.originalRegionId;
                float nx = (x.center.y - GY_MIN) / ySpan;
                float ny = 1f - (x.center.x - GX_MIN) / xSpan;
                _cityDots.Add(new CityDotInfo { normX = nx, normY = ny, rid = rid, isJunzhi = false });
            }

            Debug.Log($"[StrategicMap] 已加载 {_cityDots.Count} 个城市点（郡治+县城）");
        }

        // ── 地图纹理异步构建 ──────────────────────────────────────────────
        private IEnumerator BuildMapTexture()
        {
            if (_statusTMP != null) _statusTMP.text = "加载地图数据...";

            _mapTex = new Texture2D(TEX_W, TEX_H, TextureFormat.RGBA32, mipChain: false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode   = TextureWrapMode.Clamp,
            };

            Color[] pixels = new Color[TEX_W * TEX_H];
            Color bgColor  = new Color(0.05f, 0.06f, 0.12f, 1f);

            float xSpan = GX_MAX - GX_MIN;
            float ySpan = GY_MAX - GY_MIN;

            int batchSize  = 80;  // 每帧处理行数
            int rowsDone   = 0;

            for (int py = 0; py < TEX_H; py++)
            {
                // py=0 → 纹理顶部 → 北方 → 小 gx
                int gx = GX_MIN + Mathf.RoundToInt(py / (float)(TEX_H - 1) * xSpan);
                gx = Mathf.Clamp(gx, GX_MIN, GX_MAX);

                for (int px = 0; px < TEX_W; px++)
                {
                    int gy = GY_MIN + Mathf.RoundToInt(px / (float)(TEX_W - 1) * ySpan);
                    gy = Mathf.Clamp(gy, GY_MIN, GY_MAX);

                    int jid = TileRegionsLoader.GetJunxianIdAt(gx, gy);
                    int rid = TileRegionsLoader.GetRegionIdByJunxian(jid);
                    pixels[py * TEX_W + px] = rid > 0 ? GetRidColor(rid) : bgColor;
                }

                rowsDone++;
                if (rowsDone >= batchSize)
                {
                    rowsDone = 0;
                    if (_statusTMP != null)
                        _statusTMP.text = $"加载地图... {py * 100 / TEX_H}%";
                    yield return null;
                }
            }

            // ── 绘制城市点 ────────────────────────────────────────────────
            if (_cityDots != null)
            {
                foreach (var dot in _cityDots)
                {
                    int px = Mathf.Clamp(Mathf.RoundToInt(dot.normX * (TEX_W - 1)), 0, TEX_W - 1);
                    int py = Mathf.Clamp(Mathf.RoundToInt(dot.normY * (TEX_H - 1)), 0, TEX_H - 1);
                    int radius = dot.isJunzhi ? 3 : 1;
                    Color dotColor = dot.isJunzhi
                        ? new Color(1f, 0.2f, 0.2f, 1f)          // 郡治：红
                        : new Color(0.95f, 0.95f, 0.95f, 0.85f); // 县城：白

                    for (int dy = -radius; dy <= radius; dy++)
                    {
                        for (int dx = -radius; dx <= radius; dx++)
                        {
                            if (dx * dx + dy * dy > radius * radius + 1) continue;
                            int bx = Mathf.Clamp(px + dx, 0, TEX_W - 1);
                            int by = Mathf.Clamp(py + dy, 0, TEX_H - 1);
                            pixels[by * TEX_W + bx] = Color.Lerp(pixels[by * TEX_W + bx], dotColor, dotColor.a);
                        }
                    }
                }
            }

            _mapTex.SetPixels(pixels);
            _mapTex.Apply();
            _mapRawImage.texture = _mapTex;
            _texReady = true;

            if (_statusTMP != null) _statusTMP.text = string.Empty;
            Debug.Log($"[StrategicMap] 纹理构建完成 {TEX_W}×{TEX_H}");
        }

        // ── UI 构建 ────────────────────────────────────────────────────────
        private void Build()
        {
            var canvas = FindFirstObjectByType<Canvas>();
            if (canvas == null) return;

            _panel = new GameObject("StrategicMapPanel");
            _panel.transform.SetParent(canvas.transform, false);

            // ── 背景 ──────────────────────────────────────────────────────
            var panelRT = _panel.AddComponent<RectTransform>();
            panelRT.anchorMin = new Vector2(0.05f, 0.03f);
            panelRT.anchorMax = new Vector2(0.95f, 0.97f);
            panelRT.offsetMin = Vector2.zero;
            panelRT.offsetMax = Vector2.zero;

            var bg = _panel.AddComponent<Image>();
            bg.color = new Color(0.04f, 0.04f, 0.10f, 0.95f);

            // ── 标题 ──────────────────────────────────────────────────────
            var titleGO = new GameObject("Title");
            titleGO.transform.SetParent(_panel.transform, false);
            var titleRT = titleGO.AddComponent<RectTransform>();
            titleRT.anchorMin = new Vector2(0f, 1f);
            titleRT.anchorMax = new Vector2(1f, 1f);
            titleRT.pivot     = new Vector2(0.5f, 1f);
            titleRT.anchoredPosition = new Vector2(0, -8);
            titleRT.sizeDelta = new Vector2(0, 36);
            var titleTMP = titleGO.AddComponent<TextMeshProUGUI>();
            titleTMP.text      = "十三州战略地图  [M键关闭]";
            titleTMP.fontSize  = 18;
            titleTMP.color     = new Color(0.99f, 0.82f, 0.35f, 1f);
            titleTMP.alignment = TextAlignmentOptions.Center;

            // ── 地图图像 + RegionsMapRenderer ─────────────────────────────
            var imgGO = new GameObject("StrategicMapImage");
            imgGO.transform.SetParent(_panel.transform, false);
            var imgRT = imgGO.AddComponent<RectTransform>();
            imgRT.anchorMin = new Vector2(0.01f, 0.07f);
            imgRT.anchorMax = new Vector2(0.99f, 0.90f);
            imgRT.offsetMin = Vector2.zero;
            imgRT.offsetMax = Vector2.zero;

            _mapRawImage = imgGO.AddComponent<RawImage>();
            _mapRawImage.color = Color.white;

            // AspectRatioFitter 保证比例（宽:高 ≈ Y_MAX:X_MAX = 1501:1851 ≈ 0.81）
            var arf = imgGO.AddComponent<AspectRatioFitter>();
            arf.aspectMode  = AspectRatioFitter.AspectMode.FitInParent;
            arf.aspectRatio = (float)GY_MAX / GX_MAX;

            // ── Tooltip 文字 ──────────────────────────────────────────────
            var ttGO = new GameObject("Tooltip");
            ttGO.transform.SetParent(_panel.transform, false);
            var ttRT = ttGO.AddComponent<RectTransform>();
            ttRT.anchorMin = new Vector2(0f, 0f);
            ttRT.anchorMax = new Vector2(0.5f, 0.07f);
            ttRT.offsetMin = new Vector2(10, 4);
            ttRT.offsetMax = new Vector2(-10, -4);
            _tooltipTMP = ttGO.AddComponent<TextMeshProUGUI>();
            _tooltipTMP.text     = string.Empty;
            _tooltipTMP.fontSize = 14;
            _tooltipTMP.color    = new Color(1f, 0.95f, 0.7f, 1f);

            // ── 状态文字（加载进度）────────────────────────────────────────
            var stGO = new GameObject("Status");
            stGO.transform.SetParent(_panel.transform, false);
            var stRT = stGO.AddComponent<RectTransform>();
            stRT.anchorMin = new Vector2(0.5f, 0f);
            stRT.anchorMax = new Vector2(1f, 0.07f);
            stRT.offsetMin = new Vector2(10, 4);
            stRT.offsetMax = new Vector2(-10, -4);
            _statusTMP = stGO.AddComponent<TextMeshProUGUI>();
            _statusTMP.text      = string.Empty;
            _statusTMP.fontSize  = 12;
            _statusTMP.color     = new Color(0.6f, 0.6f, 0.6f, 1f);
            _statusTMP.alignment = TextAlignmentOptions.Right;

            // ── 关闭按钮 ──────────────────────────────────────────────────
            var closeGO = new GameObject("CloseBtn");
            closeGO.transform.SetParent(_panel.transform, false);
            var closeRT = closeGO.AddComponent<RectTransform>();
            closeRT.anchorMin = new Vector2(1f, 1f);
            closeRT.anchorMax = new Vector2(1f, 1f);
            closeRT.pivot     = new Vector2(1f, 1f);
            closeRT.anchoredPosition = new Vector2(-6, -6);
            closeRT.sizeDelta = new Vector2(36, 36);
            var closeBg = closeGO.AddComponent<Image>();
            closeBg.color = new Color(0.55f, 0.17f, 0.17f, 0.9f);
            var closeBtn = closeGO.AddComponent<Button>();
            closeBtn.onClick.AddListener(Close);
            var closeLbl = new GameObject("X");
            closeLbl.transform.SetParent(closeGO.transform, false);
            var closeLblRT = closeLbl.AddComponent<RectTransform>();
            closeLblRT.anchorMin = Vector2.zero;
            closeLblRT.anchorMax = Vector2.one;
            closeLblRT.offsetMin = Vector2.zero;
            closeLblRT.offsetMax = Vector2.zero;
            var closeTMP = closeLbl.AddComponent<TextMeshProUGUI>();
            closeTMP.text      = "✕";
            closeTMP.fontSize  = 18;
            closeTMP.color     = Color.white;
            closeTMP.alignment = TextAlignmentOptions.Center;

            // ── 鼠标悬停 Tooltip ─────────────────────────────────────────
            var hoverHandler = imgGO.AddComponent<MapHoverHandler>();
            hoverHandler.Init(imgRT, _tooltipTMP, GX_MIN, GX_MAX, GY_MIN, GY_MAX);

            _panel.SetActive(false);
        }

        // ── 颜色辅助 ──────────────────────────────────────────────────────
        private void BuildColorTable()
        {
            int maxRid = 16;
            _ridToColor = new Color[maxRid];
            _ridToName  = new string[maxRid];
            for (int i = 0; i < maxRid; i++)
            {
                _ridToColor[i] = new Color(0.05f, 0.06f, 0.12f);
                _ridToName[i]  = string.Empty;
            }
            foreach (var (rid, hex, name) in REGION_DEFS)
            {
                if (ColorUtility.TryParseHtmlString("#" + hex, out Color c))
                    _ridToColor[rid] = c * 0.85f + Color.black * 0.15f;
                _ridToName[rid] = name;
            }
        }

        private Color GetRidColor(int rid)
        {
            if (rid > 0 && rid < _ridToColor.Length) return _ridToColor[rid];
            return new Color(0.1f, 0.1f, 0.16f);
        }

        void OnDestroy()
        {
            if (_mapTex != null) Destroy(_mapTex);
        }
    }

    // ── 悬停事件处理（独立 Component 方便复用）────────────────────────────────
    [RequireComponent(typeof(RectTransform))]
    internal class MapHoverHandler : MonoBehaviour, IPointerMoveHandler, IPointerExitHandler
    {
        private RectTransform    _rt;
        private TextMeshProUGUI  _tooltip;
        private int _gxMin, _gxMax, _gyMin, _gyMax;

        public void Init(RectTransform rt, TextMeshProUGUI tooltip,
                         int gxMin, int gxMax, int gyMin, int gyMax)
        {
            _rt = rt; _tooltip = tooltip;
            _gxMin = gxMin; _gxMax = gxMax;
            _gyMin = gyMin; _gyMax = gyMax;
        }

        public void OnPointerMove(PointerEventData evd)
        {
            if (_rt == null || _tooltip == null) return;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    _rt, evd.position, evd.pressEventCamera, out Vector2 local)) return;

            Vector2 norm = Rect.PointToNormalized(_rt.rect, local);
            float nx = Mathf.Clamp01(norm.x);
            float ny = Mathf.Clamp01(norm.y);

            int gx = _gxMin + Mathf.RoundToInt((1f - ny) * (_gxMax - _gxMin));
            int gy = _gyMin + Mathf.RoundToInt(nx * (_gyMax - _gyMin));
            gx = Mathf.Clamp(gx, _gxMin, _gxMax);
            gy = Mathf.Clamp(gy, _gyMin, _gyMax);

            int    jid   = TileRegionsLoader.GetJunxianIdAt(gx, gy);
            if (jid == 0) { _tooltip.text = "—"; return; }

            string jname = TileRegionsLoader.GetJunxianName(jid);
            int    rid   = TileRegionsLoader.GetRegionIdByJunxian(jid);
            _tooltip.text = $"坐标 ({gx},{gy}) │ {GetRidName(rid)} · {jname}";
        }

        public void OnPointerExit(PointerEventData evd)
        {
            if (_tooltip != null) _tooltip.text = string.Empty;
        }

        private static string GetRidName(int rid)
        {
            return rid switch
            {
                 1 => "司隶",  3 => "兖州",  4 => "豫州",  5 => "冀州",
                 6 => "青州",  7 => "徐州",  8 => "扬州",  9 => "并州",
                10 => "凉州", 11 => "益州", 12 => "幽州", 13 => "荆州",
                15 => "交州", _  => $"州{rid}",
            };
        }
    }
}
