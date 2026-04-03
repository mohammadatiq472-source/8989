using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace YouZhou.Map
{
    /// <summary>
    /// 全国战略地图渲染器
    ///
    /// 将 map_tile_regions.json 的逐格郡归属数据渲染为彩色 Texture2D，
    /// 挂到含 RawImage 的 UI GameObject 上，可用于:
    ///   - 战略总览面板（M 键快捷打开）
    ///   - 将领调兵界面的区划背景
    ///   - 悬停显示郡/州名称
    ///
    /// 坐标映射:
    ///   地图 X 南↓ (1→1851)  对应  纹理 py 从上到下 (0→textureHeight-1)
    ///   地图 Y 东→ (1→1501)  对应  纹理 px 从左到右 (0→textureWidth-1)
    ///
    /// 用法:
    ///   1. 在场景 Canvas 下创建 RawImage GameObject
    ///   2. 挂载此脚本（会自动 RequireComponent(RawImage)）
    ///   3. 可选: 将 tooltipLabel 引用到 Text 组件以显示悬停信息
    /// </summary>
    [RequireComponent(typeof(RawImage))]
    public class RegionsMapRenderer : MonoBehaviour, IPointerMoveHandler, IPointerExitHandler
    {
        // ── Inspector 参数 ─────────────────────────────────────────────────

        [Header("纹理分辨率（宽×高，较小=省内存）")]
        [Range(200, 1200)]
        public int textureWidth  = 750;
        [Range(150, 900)]
        public int textureHeight = 600;

        [Header("游戏坐标范围（默认=全国网格）")]
        public int gameXMin = 1;
        public int gameXMax = 1851;   // X 南↓ 最大
        public int gameYMin = 1;
        public int gameYMax = 1501;   // Y 东→ 最大

        [Header("每帧批量行数（较大=更快建图，可能轻微卡帧）")]
        [Range(10, 200)]
        public int batchRowsPerFrame = 60;

        [Header("UI 引用（可选）")]
        public Text tooltipLabel;            // 悬停时显示郡州名，可留空

        // ── 13 州颜色表（与 generate_tile_regions.py 保持一致）─────────────
        private static readonly (int rid, string hex, string name)[] REGION_DEFS =
        {
            ( 1, "2ecc71", "司隶"),  ( 3, "f39c12", "兖州"),
            ( 4, "e67e22", "豫州"),  ( 5, "3498db", "冀州"),
            ( 6, "1abc9c", "青州"),  ( 7, "9b59b6", "徐州"),
            ( 8, "f1c40f", "扬州"),  ( 9, "e74c3c", "并州"),
            (10, "d4ac0d", "凉州"),  (11, "e91e63", "益州"),
            (12, "00bcd4", "幽州"),  (13, "8bc34a", "荆州"),
            (15, "ff5722", "交州"),
        };

        private static readonly Color COL_EMPTY = new(0.10f, 0.10f, 0.16f, 1f);

        // ── 运行时状态 ─────────────────────────────────────────────────────

        private Texture2D _tex;
        private RawImage  _rawImage;
        private bool      _ready;

        // 静态查找表（仅首次构建）
        private static Color[]  _ridToColor;
        private static string[] _ridToName;
        private static bool     _lookupBuilt;

        // ── Unity 生命周期 ─────────────────────────────────────────────────

        void Awake()
        {
            _rawImage = GetComponent<RawImage>();
            EnsureLookupTables();
        }

        IEnumerator Start()
        {
            // 等待 TileRegionsLoader 完成磁盘读取（同步在 Awake 触发，通常 <200ms）
            TileRegionsLoader.GetJunxianIdAt(1, 1);   // 触发 EnsureLoaded
            yield return null;                         // 让首帧渲染完再开始填纹理

            yield return BuildTextureAsync();
        }

        // ── 纹理异步构建（协程，分批避免明显卡帧）──────────────────────────

        private IEnumerator BuildTextureAsync()
        {
            _tex = new Texture2D(textureWidth, textureHeight, TextureFormat.RGB24, mipChain: false);
            _tex.filterMode = FilterMode.Bilinear;
            _tex.wrapMode   = TextureWrapMode.Clamp;

            Color[] pixels = new Color[textureWidth * textureHeight];

            float xSpan = gameXMax - gameXMin;
            float ySpan = gameYMax - gameYMin;

            int rowsDone = 0;

            for (int py = 0; py < textureHeight; py++)
            {
                // py=0 → 纹理顶部 → 北方 → gameX 最小
                int gx = gameXMin + Mathf.RoundToInt(py / (float)(textureHeight - 1) * xSpan);
                gx = Mathf.Clamp(gx, gameXMin, gameXMax);

                for (int px = 0; px < textureWidth; px++)
                {
                    // px=0 → 纹理左侧 → 西方 → gameY 最小
                    int gy = gameYMin + Mathf.RoundToInt(px / (float)(textureWidth - 1) * ySpan);
                    gy = Mathf.Clamp(gy, gameYMin, gameYMax);

                    int jid = TileRegionsLoader.GetJunxianIdAt(gx, gy);
                    int rid = TileRegionsLoader.GetRegionIdByJunxian(jid);

                    pixels[py * textureWidth + px] = GetRegionColor(rid);
                }

                rowsDone++;
                if (rowsDone >= batchRowsPerFrame)
                {
                    rowsDone = 0;
                    yield return null;
                }
            }

            _tex.SetPixels(pixels);
            _tex.Apply();
            _rawImage.texture = _tex;
            _ready = true;

            Debug.Log($"[RegionsMap] 战略地图纹理构建完成 ({textureWidth}×{textureHeight})");
        }

        // ── 强制同步（编辑器 / 截图用）────────────────────────────────────
        /// <summary>立即构建纹理（同步），适合截图或单元测试。</summary>
        public void BuildImmediately()
        {
            StopAllCoroutines();

            if (_tex != null) Destroy(_tex);
            _tex = new Texture2D(textureWidth, textureHeight, TextureFormat.RGB24, mipChain: false);
            _tex.filterMode = FilterMode.Bilinear;
            _tex.wrapMode   = TextureWrapMode.Clamp;

            Color[] pixels = new Color[textureWidth * textureHeight];
            float xSpan = gameXMax - gameXMin;
            float ySpan = gameYMax - gameYMin;

            for (int py = 0; py < textureHeight; py++)
            {
                int gx = gameXMin + Mathf.RoundToInt(py / (float)(textureHeight - 1) * xSpan);
                gx = Mathf.Clamp(gx, gameXMin, gameXMax);

                for (int px = 0; px < textureWidth; px++)
                {
                    int gy = gameYMin + Mathf.RoundToInt(px / (float)(textureWidth - 1) * ySpan);
                    gy = Mathf.Clamp(gy, gameYMin, gameYMax);

                    int jid = TileRegionsLoader.GetJunxianIdAt(gx, gy);
                    int rid = TileRegionsLoader.GetRegionIdByJunxian(jid);
                    pixels[py * textureWidth + px] = GetRegionColor(rid);
                }
            }

            _tex.SetPixels(pixels);
            _tex.Apply();
            if (_rawImage != null) _rawImage.texture = _tex;
            _ready = true;
        }

        // ── 鼠标悬停：显示郡/州名 ──────────────────────────────────────────

        public void OnPointerMove(PointerEventData evd)
        {
            if (!_ready || tooltipLabel == null) return;

            RectTransform rt = GetComponent<RectTransform>();
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    rt, evd.position, evd.pressEventCamera, out Vector2 local)) return;

            // 归一化 [0,1]: nx=0→左(西), ny=0→底部(南)
            Vector2 norm = Rect.PointToNormalized(rt.rect, local);
            float nx = Mathf.Clamp01(norm.x);
            float ny = Mathf.Clamp01(norm.y);

            // ny=1 → 顶部 → 北方(小gameX)   ny=0 → 底部 → 南方(大gameX)
            int gx = gameXMin + Mathf.RoundToInt((1f - ny) * (gameXMax - gameXMin));
            int gy = gameYMin + Mathf.RoundToInt(nx * (gameYMax - gameYMin));
            gx = Mathf.Clamp(gx, gameXMin, gameXMax);
            gy = Mathf.Clamp(gy, gameYMin, gameYMax);

            int    jid   = TileRegionsLoader.GetJunxianIdAt(gx, gy);
            if (jid == 0) { tooltipLabel.text = "—"; return; }

            string jname = TileRegionsLoader.GetJunxianName(jid);
            int    rid   = TileRegionsLoader.GetRegionIdByJunxian(jid);
            string rname = GetRegionName(rid);

            tooltipLabel.text = $"{rname} · {jname}";
        }

        public void OnPointerExit(PointerEventData evd)
        {
            if (tooltipLabel != null) tooltipLabel.text = string.Empty;
        }

        // ── 外部接口 ───────────────────────────────────────────────────────

        /// <summary>
        /// 按游戏坐标查询 (gameX, gameY) 对应的郡/州信息。
        /// 可用于：点击地图时跳转到对应幽州格子等。
        /// </summary>
        public (int junxianId, string junxianName, int regionId, string regionName)
            QueryAt(int gameX, int gameY)
        {
            EnsureLookupTables();
            int jid = TileRegionsLoader.GetJunxianIdAt(gameX, gameY);
            if (jid == 0) return (0, "", 0, "");
            string jname = TileRegionsLoader.GetJunxianName(jid);
            int    rid   = TileRegionsLoader.GetRegionIdByJunxian(jid);
            return (jid, jname, rid, GetRegionName(rid));
        }

        /// <summary>纹理是否已构建完毕。</summary>
        public bool IsReady => _ready;

        // ── 内部辅助 ───────────────────────────────────────────────────────

        private static Color GetRegionColor(int rid)
        {
            if (!_lookupBuilt) EnsureLookupTables();
            if (rid > 0 && rid < _ridToColor.Length) return _ridToColor[rid];
            return COL_EMPTY;
        }

        private static string GetRegionName(int rid)
        {
            if (!_lookupBuilt) EnsureLookupTables();
            if (rid > 0 && rid < _ridToName.Length) return _ridToName[rid];
            return $"州{rid}";
        }

        private static void EnsureLookupTables()
        {
            if (_lookupBuilt) return;

            int maxRid = 16;  // regionId 最大 = 15
            _ridToColor = new Color[maxRid];
            _ridToName  = new string[maxRid];

            for (int i = 0; i < maxRid; i++)
            {
                _ridToColor[i] = COL_EMPTY;
                _ridToName[i]  = string.Empty;
            }

            foreach (var (rid, hex, name) in REGION_DEFS)
            {
                if (ColorUtility.TryParseHtmlString("#" + hex, out Color c))
                    _ridToColor[rid] = c;
                _ridToName[rid] = name;
            }

            _lookupBuilt = true;
        }

        void OnDestroy()
        {
            if (_tex != null)
            {
                Destroy(_tex);
                _tex = null;
            }
        }
    }
}
