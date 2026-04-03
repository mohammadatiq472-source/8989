using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace YouZhou.Map
{
    /// <summary>
    /// 幽州地图编辑器 v2 — 完整中文界面
    ///
    /// 核心功能：
    ///   1. 【小地图画板】直接在窗口内点击/拖拽绘制地形（无需 LDtk，无需切换到 Scene 视图）
    ///   2. 【12 种地形】大彩色面板，一眼识别
    ///   3. 【笔刷 / 桶填充 / 取色】三种工具
    ///   4. 【撤销(Ctrl+Z)】支持 30 步
    ///   5. 【保存/加载/一键渲染】集成操作
    ///
    /// 菜单：YouZhou → Map Editor
    /// </summary>
    public class MapEditorWindow : EditorWindow
    {
        // ─── 编辑状态 ───
        private TerrainType _selectedTerrain = TerrainType.Snow;
        private int _brushSize = 1;
        private EditMode _editMode = EditMode.Brush;
        private IsometricMapBuilder _builder;
        private LogicalMapData _mapData;
        private CityRegistry _cityRegistry;
        private Vector2 _cityScrollPos;
        private bool _showCities = true;

        // ─── 小地图 Texture ───
        private Texture2D _mapTexture;
        private bool _mapTextureDirty = true;

        // ─── 缩放 / 平移 ───
        private float _zoom = 1f;
        private Vector2 _panCenter = new Vector2(0.5f, 0.5f);

        // ─── Undo 栈（LinkedList 支持 O(1) 头部裁剪，实施 MAX_UNDO 上限）───
        private readonly LinkedList<byte[]> _undoStack = new();
        private const int MAX_UNDO = 50;
        private double _lastUndoPushTime;

        // ─── 布局 ───
        private Vector2 _paletteScrollPos;
        private bool _scenePaintMode = false;
        private bool _sceneGUIRegistered;

        // ─── 性能模式 ───
        // 编辑期间只更新预览图，不触发 Unity Tilemap 重建（避免卡死）
        // 点击“刷新视觉”按钮才真正执行 Tilemap 更新
        private bool _lazyRenderMode = true;

        // ─── 逻辑覆盖层 ───
        private bool _showLogicalOverlay = false;
        private Texture2D _overlayTexture;

        private enum EditMode { Brush, Fill, Eyedropper }

        // ─── 地形定义（颜色 + 中文名）───
        // 颜色调校原则：确保12种地形在小预览图中可相互区分
        //   雪地(Snow) vs 雪山(SnowMtn)：亮度差 ≥0.30，Snow 偏白，SnowMtn 偏深蓝灰
        //   海洋(FrozenLake)：深蓝，与冰河(浅蓝)有明显饱和度差
        //   草地 vs 草地森林：深浅绿对比
        private static readonly (string name, Color color, string desc)[] TerrainDef =
        {
            ("雪地",     new Color(0.84f, 0.90f, 0.94f), "平原雪地，基础地形"),       // 较白，与雪山拉开差距
            ("雪地森林", new Color(0.28f, 0.52f, 0.33f), "有冬树的雪地"),
            ("冰湖/海",  new Color(0.18f, 0.38f, 0.72f), "渤海、湖泊"),               // 深蓝
            ("雪道",     new Color(0.72f, 0.62f, 0.48f), "驿道、官道"),
            ("城镇",     new Color(0.95f, 0.75f, 0.25f), "城市治所 — 房屋建筑群"),    // 金色加亮
            ("雪山",     new Color(0.36f, 0.40f, 0.55f), "燕山等山脉"),               // 深蓝灰，高对比
            ("草地",     new Color(0.45f, 0.78f, 0.38f), "辽东草原地带"),
            ("草地森林", new Color(0.18f, 0.45f, 0.22f), "草地加树林"),
            ("河流",     new Color(0.35f, 0.62f, 0.88f), "辽河、滦河"),               // 较亮蓝
            ("冰河",     new Color(0.60f, 0.80f, 0.95f), "冬季结冰河段"),             // 浅冰蓝
            ("城墙",     new Color(0.55f, 0.38f, 0.22f), "城门城防 — 城堡/要塞"),
            ("农田",     new Color(0.85f, 0.75f, 0.35f), "平原农田"),
        };

        // 地形名（兼容旧代码）
        private static readonly string[] TerrainNames = {
            "雪地", "雪地森林", "冰湖", "雪道",
            "雪地城镇", "雪山", "草地", "草地森林",
            "河流", "冰河", "城墙", "农田"
        };

        [MenuItem("YouZhou/Map Editor")]
        public static void ShowWindow()
        {
            var win = GetWindow<MapEditorWindow>("幽州地图编辑器");
            win.minSize = new Vector2(820, 560);
        }

        /// <summary>一键搭建地图场景</summary>
        [MenuItem("YouZhou/Setup Map Scene")]
        public static void SetupMapScene()
        {
            // 检查是否已存在
            var existing = FindAnyObjectByType<IsometricMapBuilder>();
            if (existing != null)
            {
                Debug.Log("[YouZhou] 地图场景已存在，跳过搭建");
                Selection.activeGameObject = existing.gameObject;
                return;
            }

            // 创建 Grid (等距)
            var gridGO = new GameObject("YouZhou Map");
            var grid = gridGO.AddComponent<Grid>();
            grid.cellLayout = GridLayout.CellLayout.Isometric;
            grid.cellSize = new Vector3(1f, 0.418f, 1f);

            // 地面 Tilemap
            var groundGO = new GameObject("Ground");
            groundGO.transform.SetParent(gridGO.transform);
            var groundTM = groundGO.AddComponent<Tilemap>();
            var groundRenderer = groundGO.AddComponent<TilemapRenderer>();
            groundRenderer.sortingOrder = 0;

            // 装饰 Tilemap
            var decoGO = new GameObject("Decorations");
            decoGO.transform.SetParent(gridGO.transform);
            var decoTM = decoGO.AddComponent<Tilemap>();
            var decoRenderer = decoGO.AddComponent<TilemapRenderer>();
            decoRenderer.sortingOrder = 1;

            // 高亮 Tilemap（选择反馈用）
            var hlGO = new GameObject("Highlight");
            hlGO.transform.SetParent(gridGO.transform);
            hlGO.AddComponent<Tilemap>();
            var hlRenderer = hlGO.AddComponent<TilemapRenderer>();
            hlRenderer.sortingOrder = 10;

            var terrainMaterial = IsometricTerrainMaterialUtility.EnsureTerrainMaterial();
            groundRenderer.sharedMaterial = terrainMaterial;
            decoRenderer.sharedMaterial = terrainMaterial;
            hlRenderer.sharedMaterial = terrainMaterial;

            // 挂载组件
            var builder = gridGO.AddComponent<IsometricMapBuilder>();
            builder.groundTilemap = groundTM;
            builder.decorationTilemap = decoTM;

            var initializer = gridGO.AddComponent<MapInitializer>();
            initializer.mapBuilder = builder;

            // 提示用户
            Selection.activeGameObject = gridGO;
            EditorUtility.SetDirty(gridGO);
            EditorUtility.SetDirty(groundRenderer);
            EditorUtility.SetDirty(decoRenderer);
            EditorUtility.SetDirty(hlRenderer);
            if (gridGO.scene.IsValid())
                EditorSceneManager.MarkSceneDirty(gridGO.scene);

            Debug.Log("[YouZhou] 地图场景搭建完成! 请在 Inspector 中为 MapBuilder 指定 MapSpriteDatabase 资产。");
            Debug.Log($"[YouZhou] 共享地形材质已挂载: {IsometricTerrainMaterialUtility.MaterialAssetPath}");
            Debug.Log("[YouZhou] 创建方法: 右键 Assets → Create → YouZhou → Map Sprite Database");
        }

// ── 延迟初始化标志 ──────────────────────────
        // OnEditorUpdate 只设标志，OnGUI 的 Layout 事件统一应用，
        // 保证 Layout/Repaint 看到相同的控件结构。
        private bool _pendingBuilderSearch;

        private void OnEnable()
        {
            SceneView.duringSceneGui += OnSceneGUI;
            _sceneGUIRegistered = true;
            EditorApplication.update += OnEditorUpdate;
            // 立即尝试一次（场景已加载时直接成功）
            _pendingBuilderSearch = true;
            Repaint();
        }

        private void OnDisable()
        {
            if (_sceneGUIRegistered)
                SceneView.duringSceneGui -= OnSceneGUI;
            EditorApplication.update -= OnEditorUpdate;
        }

        /// <summary>
        /// EditorApplication.update 仅轮询是否需要重新查找 Builder，
        /// 不直接改变 _mapData（避免在 Layout/Repaint 之间触发）。
        /// </summary>
        private void OnEditorUpdate()
        {
            if (_builder != null && _mapData != null) return;
            _pendingBuilderSearch = true;
            Repaint();
        }

        /// <summary>
        /// 实际查找 Builder 并加载地图数据。
        /// 必须只在 Layout 事件开始时调用，确保 Layout/Repaint 控件数一致。
        /// </summary>
        private void ApplyPendingBuilderSearch()
        {
            _pendingBuilderSearch = false;

            if (_builder == null)
                _builder = FindAnyObjectByType<IsometricMapBuilder>();

            if (_builder != null && _mapData == null)
            {
                _mapData = _builder.MapData;
                if (_mapData == null)
                {
                    _mapData = MapPersistence.Load();
                    _builder.Initialize(_mapData);
                }
                _mapTextureDirty = true;
            }

            // 若已就绪，停止轮询
            if (_builder != null && _mapData != null)
                EditorApplication.update -= OnEditorUpdate;
        }

        // ─────────────────────────────────────────
        // 主界面布局
        // ─────────────────────────────────────────
        private void OnGUI()
        {
            // 只在 Layout 事件开头应用状态变更，确保 Layout/Repaint 的控件数一致
            if (_pendingBuilderSearch && Event.current.type == EventType.Layout)
                ApplyPendingBuilderSearch();

            EditorGUILayout.BeginHorizontal();
            DrawLeftPanel();
            DrawMapViewport();
            EditorGUILayout.EndHorizontal();
        }

        // ─────────────────────────────────────────
        // 左侧面板：工具 + 地形选择 + 操作按钮
        // ─────────────────────────────────────────
        private void DrawLeftPanel()
        {
            EditorGUILayout.BeginVertical(GUILayout.Width(210));
            try
            {
            EditorGUILayout.Space(6);

            EnsureStyles();
            // _titleStyle 在 EnsureStyles 成功后才可用；若仍为 null 则用默认样式
            EditorGUILayout.LabelField("幽州地图编辑器", _titleStyle ?? EditorStyles.boldLabel);
            EditorGUILayout.Space(4);

            if (_builder == null)
            {
                EditorGUILayout.HelpBox("未找到地图构建器\n请先执行 YouZhou → Setup Map Scene", MessageType.Warning);
                if (GUILayout.Button("一键搭建场景", GUILayout.Height(30)))
                    SetupMapScene();
                // BUG#7 修复：不再 early-return，改为 if/else 保证 Layout/Repaint 控件数一致
            }
            else
            {

            // ── 工具栏 ──
            EditorGUILayout.LabelField("工具", EditorStyles.miniLabel);
            EditorGUILayout.BeginHorizontal();
            DrawToolBtn(EditMode.Brush,      "✏ 笔刷");
            DrawToolBtn(EditMode.Fill,       "🪣 填充");
            DrawToolBtn(EditMode.Eyedropper, "💉 取色");
            EditorGUILayout.EndHorizontal();

            if (_editMode == EditMode.Brush)
                _brushSize = EditorGUILayout.IntSlider("笔刷大小", _brushSize, 1, 8);

            EditorGUILayout.Space(4);
            Color orig = GUI.backgroundColor;
            GUI.backgroundColor = _scenePaintMode ? new Color(1f, 0.6f, 0.2f) : Color.white;
            _scenePaintMode = GUILayout.Toggle(_scenePaintMode,
                _scenePaintMode ? "▶ Scene 绘制: 开" : "Scene 绘制: 关", "Button", GUILayout.Height(24));
            GUI.backgroundColor = orig;

            EditorGUILayout.Space(8);

            // ── 地形选择 ──
            EditorGUILayout.LabelField("地形类型（点击选择）", EditorStyles.boldLabel);

            _paletteScrollPos = EditorGUILayout.BeginScrollView(_paletteScrollPos, GUILayout.ExpandHeight(true));
            // EnsureStyles 已在 DrawLeftPanel 顶部调用，此处无需重复

            for (int i = 0; i < TerrainDef.Length; i++)
            {
                var (tname, tcolor, tdesc) = TerrainDef[i];
                var terrain = (TerrainType)i;
                bool selected = _selectedTerrain == terrain;

                // 选中时金色边框，未选中时地形本色
                GUI.backgroundColor = selected
                    ? new Color(1f, 0.85f, 0.2f)
                    : new Color(tcolor.r * 0.7f + 0.2f, tcolor.g * 0.7f + 0.2f, tcolor.b * 0.7f + 0.2f, 1f);

                var style = selected ? _paletteButtonStyleBold : _paletteButtonStyle;
                bool clicked = GUILayout.Button(_terrainButtonLabels[i], style, GUILayout.Height(36));
                GUI.backgroundColor = Color.white;

                if (clicked)
                {
                    _selectedTerrain = terrain;
                    if (_editMode == EditMode.Eyedropper) _editMode = EditMode.Brush;
                }

                // 颜色色块叠加（仅 Repaint）
                if (Event.current.type == EventType.Repaint)
                {
                    Rect r = GUILayoutUtility.GetLastRect();
                    EditorGUI.DrawRect(new Rect(r.x + 3, r.y + 5, 24, 26), tcolor);
                }
            }
            EditorGUILayout.EndScrollView();

            EditorGUILayout.Space(4);

            // ── 操作按钮 ──
            EditorGUILayout.LabelField("操作", EditorStyles.boldLabel);
            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("💾 保存", GUILayout.Height(28)))
            {
                if (_mapData != null)
                {
                    MapPersistence.Save(_mapData);
                    EditorUtility.DisplayDialog("保存成功", "地图已保存", "OK");
                }
            }
            if (GUILayout.Button("📂 加载", GUILayout.Height(28)))
            {
                _mapData = MapPersistence.Load();
                if (_builder != null) _builder.Initialize(_mapData);
                _mapTextureDirty = true;
            }
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("↩ 撤销", GUILayout.Height(24)))
                TryUndo();
            Color prevBg = GUI.backgroundColor;
            GUI.backgroundColor = _lazyRenderMode ? new Color(0.4f, 0.85f, 0.4f) : new Color(1f, 0.6f, 0.3f);
            if (GUILayout.Button(_lazyRenderMode ? "仅预览模式" : "实时渲染中", GUILayout.Height(24)))
                _lazyRenderMode = !_lazyRenderMode;
            GUI.backgroundColor = prevBg;
            EditorGUILayout.EndHorizontal();

            // 刷新视觉（在懒渲染模式下，这是唯一触发 Tilemap 真正重建的按钮）
            if (GUILayout.Button("🔄 刷新视觉（提交到3D场景）", GUILayout.Height(26)))
            {
                _builder?.RebuildAll();
                _mapTextureDirty = true;
                Debug.Log("[MapEditor] 已手动触发全图视觉重建");
            }

            EditorGUILayout.BeginHorizontal();
            // 逻辑覆盖层（9格=1逻辑块 的边框可视化）
            GUI.backgroundColor = _showLogicalOverlay ? new Color(0.3f, 0.7f, 1f) : Color.white;
            if (GUILayout.Button(_showLogicalOverlay ? "🔲 隐藏逻辑格" : "🔲 显示逻辑格", GUILayout.Height(24)))
            {
                _showLogicalOverlay = !_showLogicalOverlay;
                Repaint();
            }
            GUI.backgroundColor = Color.white;
            if (GUILayout.Button("全图填充", GUILayout.Height(24)))
            {
                if (EditorUtility.DisplayDialog("确认",
                    $"把整张地图填充为「{TerrainDef[(int)_selectedTerrain].name}」？", "确认", "取消"))
                {
                    PushUndo();
                    for (int y = 0; y < LogicalMapData.HEIGHT; y++)
                        for (int x = 0; x < LogicalMapData.WIDTH; x++)
                            _mapData.SetTerrain(x, y, _selectedTerrain);
                    _mapTextureDirty = true;
                }
            }
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.Space(4);
            EditorGUILayout.LabelField($"地图: {LogicalMapData.WIDTH}×{LogicalMapData.HEIGHT} ({LogicalMapData.WIDTH * LogicalMapData.HEIGHT:N0} 格)", EditorStyles.miniLabel);
            EditorGUILayout.LabelField($"选中: {TerrainDef[(int)_selectedTerrain].name}", EditorStyles.miniLabel);
            EditorGUILayout.Space(6);
            } // close else
            } // close try
            finally
            {
                // 无论内部是否抛出，都确保 BeginVertical/EndVertical 配对
                EditorGUILayout.EndVertical();
            }
        }

        // ─── 缓存样式（避免每帧 new GUIStyle）───
        private GUIStyle _paletteButtonStyle;
        private GUIStyle _paletteButtonStyleBold;
        private GUIStyle _titleStyle;

        // 预计算地形按鈕标签，避免每帧 12 次字符串拼接分配
        private static readonly string[] _terrainButtonLabels = BuildTerrainLabels();
        private static string[] BuildTerrainLabels()
        {
            var labels = new string[TerrainDef.Length];
            for (int i = 0; i < TerrainDef.Length; i++)
                labels[i] = $"{TerrainDef[i].name}  —  {TerrainDef[i].desc}";
            return labels;
        }

        private void EnsureStyles()
        {
            // 哨兵使用最后初始化的 _titleStyle，避免中途抛异常Only部分字段被设置
            if (_titleStyle != null) return;
            _paletteButtonStyle = new GUIStyle(GUI.skin.button)
                { alignment = TextAnchor.MiddleLeft, fontSize = 12, padding = new RectOffset(36, 4, 2, 2) };
            _paletteButtonStyleBold = new GUIStyle(_paletteButtonStyle)
                { fontStyle = FontStyle.Bold };
            // 使用 GUI.skin.label 代替 EditorStyles.boldLabel（后者在某些初始化时序下为 null）
            _titleStyle = new GUIStyle(GUI.skin.label)
                { fontSize = 13, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
        }

        // ─── 工具按钮 ───
        private void DrawToolBtn(EditMode mode, string label)
        {
            bool active = _editMode == mode;
            Color orig = GUI.backgroundColor;
            GUI.backgroundColor = active ? new Color(0.5f, 0.85f, 1f) : Color.white;
            if (GUILayout.Toggle(active, label, "Button", GUILayout.Height(26)) != active)
                _editMode = mode;
            GUI.backgroundColor = orig;
        }
        // ─────────────────────────────────────────
        private void DrawMapViewport()
        {
            EditorGUILayout.BeginVertical();
            EditorGUILayout.Space(4);

            // ── 顶部工具条 ──
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField("【地图画板】", EditorStyles.boldLabel, GUILayout.Width(90));
            if (GUILayout.Button("−", GUILayout.Width(24))) _zoom = Mathf.Max(1f, _zoom / 1.5f);
            EditorGUILayout.LabelField($"{_zoom:F1}x", EditorStyles.miniLabel, GUILayout.Width(38));
            if (GUILayout.Button("+", GUILayout.Width(24))) _zoom = Mathf.Min(20f, _zoom * 1.5f);
            if (GUILayout.Button("适配", GUILayout.Width(38)))
            { _zoom = 1f; _panCenter = new Vector2(0.5f, 0.5f); }
            GUILayout.FlexibleSpace();
            EditorGUILayout.LabelField($"撤销: {_undoStack.Count}", EditorStyles.miniLabel, GUILayout.Width(58));
            EditorGUILayout.EndHorizontal();

            if (_mapData == null)
            {
                EditorGUILayout.HelpBox("请先加载地图或搭建场景", MessageType.Info);
                EditorGUILayout.EndVertical();
                return;
            }

            if (_mapTextureDirty || _mapTexture == null)
                RebuildMapTexture();

            Rect viewRect = GUILayoutUtility.GetRect(GUIContent.none, GUIStyle.none,
                GUILayout.ExpandWidth(true), GUILayout.ExpandHeight(true));

            // ── 保持地图宽高比 ──
            float mapAspect = (float)LogicalMapData.WIDTH / LogicalMapData.HEIGHT;
            float fitW = Mathf.Max(60f, viewRect.width - 4);
            float fitH = Mathf.Max(60f, viewRect.height - 4);
            if (fitW / fitH > mapAspect)
                fitW = fitH * mapAspect;
            else
                fitH = fitW / mapAspect;
            Rect mapRect = new Rect(
                viewRect.x + (viewRect.width - fitW) / 2f,
                viewRect.y + (viewRect.height - fitH) / 2f,
                fitW, fitH);

            // ── 计算可见区域（归一化纹理坐标）──
            float visW = 1f / _zoom;
            float visH = 1f / _zoom;
            float texLeft = Mathf.Clamp(_panCenter.x - visW / 2f, 0f, Mathf.Max(0f, 1f - visW));
            float texBottom = Mathf.Clamp(_panCenter.y - visH / 2f, 0f, Mathf.Max(0f, 1f - visH));
            _panCenter.x = texLeft + visW / 2f;
            _panCenter.y = texBottom + visH / 2f;

            GUI.DrawTextureWithTexCoords(mapRect, _mapTexture, new Rect(texLeft, texBottom, visW, visH));

            // ── 网格参考线 ──
            if (Event.current.type == EventType.Repaint)
            {
                Handles.BeginGUI();
                int W = LogicalMapData.WIDTH, H = LogicalMapData.HEIGHT;
                int gridStep = _zoom >= 6f ? 1 : (_zoom >= 3f ? 5 : 10);
                Handles.color = new Color(0f, 0f, 0f, gridStep == 1 ? 0.06f : 0.12f);

                int vx0 = Mathf.Max(0, Mathf.FloorToInt(texLeft * W));
                int vx1 = Mathf.Min(W,  Mathf.CeilToInt((texLeft + visW) * W));
                int vy0 = Mathf.Max(0, Mathf.FloorToInt(texBottom * H));
                int vy1 = Mathf.Min(H,  Mathf.CeilToInt((texBottom + visH) * H));

                for (int i = (vx0 / gridStep) * gridStep; i <= vx1; i += gridStep)
                {
                    float sx = mapRect.x + ((float)i / W - texLeft) / visW * mapRect.width;
                    Handles.DrawLine(new Vector3(sx, mapRect.y), new Vector3(sx, mapRect.yMax));
                }
                for (int i = (vy0 / gridStep) * gridStep; i <= vy1; i += gridStep)
                {
                    float sy = mapRect.yMax - ((float)i / H - texBottom) / visH * mapRect.height;
                    Handles.DrawLine(new Vector3(mapRect.x, sy), new Vector3(mapRect.xMax, sy));
                }

                Handles.color = new Color(0.8f, 0.7f, 0.3f);
                Handles.DrawSolidRectangleWithOutline(mapRect, Color.clear, Handles.color);

                // ── 逻辑覆盖层（每3格画一条青色线，显示9格=1逻辑块边界）──
                if (_showLogicalOverlay && _zoom >= 2f)
                {
                    // 只在缩放足够大时显示（避免密密麻麻的线）
                    int lW = LogicalMapData.WIDTH / LogicalMapData.VISUAL_SCALE;
                    int lH = LogicalMapData.HEIGHT / LogicalMapData.VISUAL_SCALE;
                    Handles.color = new Color(0f, 0.9f, 1f, 0.55f);

                    // X 方向（每 3 逻辑像素 = 1 逻辑块边界）
                    int lx0 = Mathf.Max(0, Mathf.FloorToInt(texLeft * lW));
                    int lx1 = Mathf.Min(lW, Mathf.CeilToInt((texLeft + visW) * lW));
                    for (int li = lx0; li <= lx1; li++)
                    {
                        // li 对应的纹理 U 坐标（以逻辑块为单位）
                        float sx = mapRect.x + (((float)li / lW) - texLeft) / visW * mapRect.width;
                        Handles.DrawLine(new Vector3(sx, mapRect.y), new Vector3(sx, mapRect.yMax));
                    }
                    // Y 方向
                    int ly0 = Mathf.Max(0, Mathf.FloorToInt(texBottom * lH));
                    int ly1 = Mathf.Min(lH, Mathf.CeilToInt((texBottom + visH) * lH));
                    for (int li = ly0; li <= ly1; li++)
                    {
                        float sy = mapRect.yMax - (((float)li / lH) - texBottom) / visH * mapRect.height;
                        Handles.DrawLine(new Vector3(mapRect.x, sy), new Vector3(mapRect.xMax, sy));
                    }
                }
                Handles.EndGUI();
            }

            HandleMapInput(mapRect, texLeft, texBottom, visW, visH);

            EditorGUILayout.LabelField("滚轮=缩放  中键拖拽=平移  左键=绘制  右键=取色  Ctrl+Z=撤销",
                EditorStyles.centeredGreyMiniLabel);
            EditorGUILayout.EndVertical();
        }

        private void HandleMapInput(Rect mapRect, float texLeft, float texBottom, float visW, float visH)
        {
            Event e = Event.current;
            if (!mapRect.Contains(e.mousePosition)) return;

            // ── 滚轮缩放（朝鼠标位置缩放）──
            if (e.type == EventType.ScrollWheel)
            {
                float oldZoom = _zoom;
                _zoom = Mathf.Clamp(_zoom * (1f - e.delta.y * 0.08f), 1f, 20f);
                if (!Mathf.Approximately(oldZoom, _zoom))
                {
                    float nx = (e.mousePosition.x - mapRect.x) / mapRect.width;
                    float ny = (e.mousePosition.y - mapRect.y) / mapRect.height;
                    float texU = texLeft + nx * visW;
                    float texV = (texBottom + visH) - ny * visH;
                    float t = 1f - oldZoom / _zoom;
                    _panCenter.x += (texU - _panCenter.x) * t;
                    _panCenter.y += (texV - _panCenter.y) * t;
                }
                e.Use(); Repaint(); return;
            }

            // ── 中键拖拽平移 ──
            if (e.type == EventType.MouseDrag && e.button == 2)
            {
                float dx = -e.delta.x / mapRect.width * visW;
                float dy = e.delta.y / mapRect.height * visH;
                _panCenter += new Vector2(dx, dy);
                e.Use(); Repaint(); return;
            }

            // ── 鼠标 → 逻辑坐标（经过缩放/平移变换）──
            float mnx = (e.mousePosition.x - mapRect.x) / mapRect.width;
            float mny = (e.mousePosition.y - mapRect.y) / mapRect.height;
            float mu = texLeft + mnx * visW;
            float mv = (texBottom + visH) - mny * visH;
            int lx = Mathf.Clamp((int)(mu * LogicalMapData.WIDTH),  0, LogicalMapData.WIDTH  - 1);
            int ly = Mathf.Clamp((int)(mv * LogicalMapData.HEIGHT), 0, LogicalMapData.HEIGHT - 1);

            bool isDown = e.type == EventType.MouseDown;
            bool isDrag = e.type == EventType.MouseDrag;

            // 右键取色
            if ((isDown || isDrag) && e.button == 1)
            {
                _selectedTerrain = _mapData.GetTerrain(lx, ly);
                e.Use(); Repaint(); return;
            }

            // 取色工具
            if (isDown && e.button == 0 && _editMode == EditMode.Eyedropper)
            {
                _selectedTerrain = _mapData.GetTerrain(lx, ly);
                _editMode = EditMode.Brush;
                e.Use(); Repaint(); return;
            }

            // 填充工具
            if (isDown && e.button == 0 && _editMode == EditMode.Fill)
            {
                PushUndo();
                FloodFill(lx, ly, _mapData.GetTerrain(lx, ly), _selectedTerrain);
                // FloodFill 内部已处理 _mapTexture 和懒渲染判断
                _mapTextureDirty = false;  // FloodFill 已内联更新像素并 Apply()
                e.Use(); Repaint(); return;
            }

            // 笔刷绘制（每 2 秒自动创建撤销检查点，避免长笔划一次全撤）
            if ((isDown || isDrag) && e.button == 0 && _editMode == EditMode.Brush)
            {
                double now = EditorApplication.timeSinceStartup;
                if (isDown)
                {
                    PushUndo();
                    _lastUndoPushTime = now;
                }
                else if (now - _lastUndoPushTime > 2.0)
                {
                    PushUndo();
                    _lastUndoPushTime = now;
                }
                PaintLogical(lx, ly);
                e.Use(); Repaint(); return;
            }

            // Ctrl+Z 撤销
            if (e.type == EventType.KeyDown && e.keyCode == KeyCode.Z && (e.control || e.command))
            {
                TryUndo(); e.Use();
            }

            if (e.type == EventType.MouseMove || isDrag) Repaint();
        }

        // ─────────────────────────────────────────
        // 绘制操作
        // ─────────────────────────────────────────
        private void PaintLogical(int centerLx, int centerLy)
        {
            bool changed = false;
            int r = _brushSize - 1;
            int bxMin = Mathf.Max(0, centerLx - r);
            int bxMax = Mathf.Min(LogicalMapData.WIDTH  - 1, centerLx + r);
            int byMin = Mathf.Max(0, centerLy - r);
            int byMax = Mathf.Min(LogicalMapData.HEIGHT - 1, centerLy + r);

            for (int bx = bxMin; bx <= bxMax; bx++)
            {
                for (int by = byMin; by <= byMax; by++)
                {
                    if (_mapData.GetTerrain(bx, by) == _selectedTerrain) continue;
                    _mapData.SetTerrain(bx, by, _selectedTerrain);
                    if (_mapTexture != null)
                        _mapTexture.SetPixel(bx, by, TerrainDef[(int)_selectedTerrain].color);
                    changed = true;
                }
            }

            if (changed)
            {
                _mapTexture?.Apply();
                // 懒加载模式：编辑期间只更新预览图，不触发呓婊 Unity Tilemap GPU 重建
                if (!_lazyRenderMode && _builder != null)
                    _builder.RebuildRegion(bxMin, byMin, bxMax, byMax);
            }
        }

        private void FloodFill(int sx, int sy, TerrainType fromT, TerrainType toT)
        {
            if (fromT == toT) return;
            // 棯洪填充，并跳踪边界盒子（用于决定局部还是全图重建）
            int fxMin = sx, fxMax = sx, fyMin = sy, fyMax = sy;
            var queue = new Queue<(int, int)>();
            // BUG#3 修复：visited 集合防止重复入队，提升大地图 BFS 性能
            var visited = new HashSet<(int, int)>();
            queue.Enqueue((sx, sy));
            visited.Add((sx, sy));
            while (queue.Count > 0)
            {
                var (x, y) = queue.Dequeue();
                if (x < 0 || x >= LogicalMapData.WIDTH  ||
                    y < 0 || y >= LogicalMapData.HEIGHT) continue;
                if (_mapData.GetTerrain(x, y) != fromT) continue;
                _mapData.SetTerrain(x, y, toT);
                if (x < fxMin) fxMin = x;  if (x > fxMax) fxMax = x;
                if (y < fyMin) fyMin = y;  if (y > fyMax) fyMax = y;
                if (_mapTexture != null)
                    _mapTexture.SetPixel(x, y, TerrainDef[(int)toT].color);
                if (visited.Add((x+1, y))) queue.Enqueue((x+1, y));
                if (visited.Add((x-1, y))) queue.Enqueue((x-1, y));
                if (visited.Add((x, y+1))) queue.Enqueue((x, y+1));
                if (visited.Add((x, y-1))) queue.Enqueue((x, y-1));
            }
            _mapTexture?.Apply();
            // 懒加载模式：填充同样只更新预览图
            if (!_lazyRenderMode && _builder != null)
            {
                int regionCells = (fxMax - fxMin + 1) * (fyMax - fyMin + 1);
                if (regionCells > LogicalMapData.WIDTH * LogicalMapData.HEIGHT / 3)
                    _builder.RebuildAll();
                else
                    _builder.RebuildRegion(fxMin, fyMin, fxMax, fyMax);
            }
        }

        // ─────────────────────────────────────────
        // 地图贴图
        // ─────────────────────────────────────────
        private void RebuildMapTexture()
        {
            if (_mapData == null) return;
            // 尺寸变更时必须销毁旧纹理重建，否则 SetPixels 长度不匹配导致横条纹
            if (_mapTexture == null
                || _mapTexture.width  != LogicalMapData.WIDTH
                || _mapTexture.height != LogicalMapData.HEIGHT)
            {
                if (_mapTexture != null) DestroyImmediate(_mapTexture);
                _mapTexture = new Texture2D(LogicalMapData.WIDTH, LogicalMapData.HEIGHT,
                    TextureFormat.RGBA32, false)
                { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            }
            var pixels = new Color[LogicalMapData.WIDTH * LogicalMapData.HEIGHT];
            for (int y = 0; y < LogicalMapData.HEIGHT; y++)
                for (int x = 0; x < LogicalMapData.WIDTH; x++)
                {
                    var t = _mapData.GetTerrain(x, y);
                    pixels[y * LogicalMapData.WIDTH + x] =
                        (int)t < TerrainDef.Length ? TerrainDef[(int)t].color : Color.magenta;
                }
            _mapTexture.SetPixels(pixels);
            _mapTexture.Apply();
            _mapTextureDirty = false;
        }

        // ─────────────────────────────────────────
        // Undo
        // ─────────────────────────────────────────
        private void PushUndo()
        {
            if (_mapData == null) return;
            var snap = new byte[LogicalMapData.WIDTH * LogicalMapData.HEIGHT];
            for (int y = 0; y < LogicalMapData.HEIGHT; y++)
                for (int x = 0; x < LogicalMapData.WIDTH; x++)
                    snap[y * LogicalMapData.WIDTH + x] = (byte)_mapData.GetTerrain(x, y);
            _undoStack.AddLast(snap);
            // 超过上限时裁剪最旧节点，避免内存无限增长（MAX_UNDO × ~100KB）
            while (_undoStack.Count > MAX_UNDO)
                _undoStack.RemoveFirst();
        }

        private void TryUndo()
        {
            if (_undoStack.Count == 0 || _mapData == null) return;
            // BUG#2 修复：使用 LinkedList，从尾部弹出（最新快照）
            var snap = _undoStack.Last.Value;
            _undoStack.RemoveLast();

            // 差异比较：只恢复有变化的格子，并跟踪变化区域
            int dxMin = int.MaxValue, dxMax = int.MinValue;
            int dyMin = int.MaxValue, dyMax = int.MinValue;
            bool anyChange = false;

            for (int y = 0; y < LogicalMapData.HEIGHT; y++)
            {
                for (int x = 0; x < LogicalMapData.WIDTH; x++)
                {
                    var old = (TerrainType)snap[y * LogicalMapData.WIDTH + x];
                    if (_mapData.GetTerrain(x, y) == old) continue;
                    _mapData.SetTerrain(x, y, old);
                    // BUG#1 修复：立即同步更新预览贴图像素，不等到下帧
                    if (_mapTexture != null)
                        _mapTexture.SetPixel(x, y, TerrainDef[(int)old].color);
                    if (x < dxMin) dxMin = x;  if (x > dxMax) dxMax = x;
                    if (y < dyMin) dyMin = y;  if (y > dyMax) dyMax = y;
                    anyChange = true;
                }
            }

            if (!anyChange) return;

            // 将所有像素变更一次性提交到 GPU（一次 Apply，不在 SetPixel 后逐帧 Apply）
            _mapTexture?.Apply();

            // 懒加载模式：撤销只更新预览图，不触发 Tilemap 重建
            if (!_lazyRenderMode && _builder != null)
            {
                int regionCells = (dxMax - dxMin + 1) * (dyMax - dyMin + 1);
                if (regionCells > LogicalMapData.WIDTH * LogicalMapData.HEIGHT / 3)
                    _builder.RebuildAll();
                else
                    _builder.RebuildRegion(dxMin, dyMin, dxMax, dyMax);
            }
            Repaint();
        }

        // ─────────────────────────────────────────
        // Scene 视图绘制（可选附加模式）
        // ─────────────────────────────────────────
        private void OnSceneGUI(SceneView sceneView)
        {
            if (!_scenePaintMode || _builder == null || _mapData == null) return;

            Event e = Event.current;
            if (e.type == EventType.MouseMove || e.type == EventType.MouseDrag)
                sceneView.Repaint();

            Vector2 mousePos = e.mousePosition;
            Ray ray = HandleUtility.GUIPointToWorldRay(mousePos);
            if (Mathf.Approximately(ray.direction.z, 0)) return;

            float t = -ray.origin.z / ray.direction.z;
            Vector3 worldPos = ray.origin + ray.direction * t;
            Vector3Int cellPos = _builder.groundTilemap.WorldToCell(worldPos);
            int lx = cellPos.x / LogicalMapData.VISUAL_SCALE;
            int ly = cellPos.y / LogicalMapData.VISUAL_SCALE;

            if (e.type == EventType.MouseDown && e.button == 0 && e.alt)
            {
                if (lx >= 0 && lx < LogicalMapData.WIDTH && ly >= 0 && ly < LogicalMapData.HEIGHT)
                    _selectedTerrain = _mapData.GetTerrain(lx, ly);
                e.Use(); Repaint(); return;
            }

            if ((e.type == EventType.MouseDown || e.type == EventType.MouseDrag)
                && e.button == 0 && !e.alt)
            {
                if (e.type == EventType.MouseDown) PushUndo();
                PaintLogical(lx, ly);
                e.Use();
            }

            if (e.type == EventType.Repaint)
            {
                Handles.color = new Color(1f, 0.84f, 0.3f, 0.8f);
                int r = _brushSize - 1;
                for (int bx = lx - r; bx <= lx + r; bx++)
                    for (int by = ly - r; by <= ly + r; by++)
                        DrawBlockOutline(bx, by);
            }

            if (e.type == EventType.Layout)
                HandleUtility.AddDefaultControl(GUIUtility.GetControlID(FocusType.Passive));
        }

        private void DrawBlockOutline(int lx, int ly)
        {
            if (lx < 0 || lx >= LogicalMapData.WIDTH ||
                ly < 0 || ly >= LogicalMapData.HEIGHT) return;
            var tilemap = _builder.groundTilemap;
            int s = LogicalMapData.VISUAL_SCALE;
            Vector3 bl = tilemap.CellToWorld(new Vector3Int(lx * s,     ly * s,     0));
            Vector3 br = tilemap.CellToWorld(new Vector3Int(lx * s + s, ly * s,     0));
            Vector3 tl = tilemap.CellToWorld(new Vector3Int(lx * s,     ly * s + s, 0));
            Vector3 tr = tilemap.CellToWorld(new Vector3Int(lx * s + s, ly * s + s, 0));
            Handles.DrawLine(bl, br);
            Handles.DrawLine(br, tr);
            Handles.DrawLine(tr, tl);
            Handles.DrawLine(tl, bl);
        }
    }
}

