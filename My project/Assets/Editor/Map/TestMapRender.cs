using UnityEditor;
using UnityEngine;
using YouZhou.Map;

/// <summary>
/// 在编辑器中不进入 PlayMode 直接测试地图构建
/// </summary>
public static class TestMapRender
{
    [MenuItem("YouZhou/Test Render Map (Editor)")]
    public static void RenderInEditor()
    {
        var builder = Object.FindAnyObjectByType<IsometricMapBuilder>();
        if (builder == null)
        {
            Debug.LogError("[YouZhou Test] 场景中没有 IsometricMapBuilder!");
            return;
        }

        if (builder.spriteDatabase == null)
        {
            Debug.LogError("[YouZhou Test] MapBuilder 缺少 SpriteDatabase 引用!");
            return;
        }

        var mapData = MapPersistence.Load();
        if (mapData == null)
        {
            Debug.LogError("[YouZhou Test] 无法加载地图数据!");
            return;
        }

        builder.Initialize(mapData);
        Debug.Log("[YouZhou Test] 地图渲染测试完成! 检查 Scene 视图查看结果。");

        // 移动 Scene 视图到地图中心
        var sceneView = SceneView.lastActiveSceneView;
        if (sceneView != null)
        {
            // 地图中心大约在 (159, 79) 视觉坐标 → 等距世界坐标
            sceneView.pivot = new Vector3(159, 79, 0);
            sceneView.size = 50f;
            sceneView.Repaint();
        }
    }

    [MenuItem("YouZhou/Enter Play Mode")]
    public static void PlayMode()
    {
        EditorApplication.isPlaying = true;
    }
}
