using System.Collections;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 地图初始化器 - 运行时加载持久化地图数据并构建视觉层
    /// 挂载在带有 IsometricMapBuilder 的 GameObject 上
    /// </summary>
    public class MapInitializer : MonoBehaviour
    {
        [Tooltip("地图构建器引用")]
        public IsometricMapBuilder mapBuilder;

        private IEnumerator Start()
        {
            if (mapBuilder == null)
            {
                mapBuilder = GetComponent<IsometricMapBuilder>();
                if (mapBuilder == null)
                {
                    Debug.LogError("[MapInitializer] 未找到 IsometricMapBuilder");
                    yield break;
                }
            }

            // 把地图载入和批量重建挪到首帧之后，避免启动阶段把主线程卡死在一次性构建上。
            yield return null;

            var mapData = MapPersistence.Load();
            if (mapData == null)
            {
                Debug.LogError("[MapInitializer] MapPersistence.Load() 返回空数据");
                yield break;
            }

            mapBuilder.Initialize(mapData);
        }
    }
}
