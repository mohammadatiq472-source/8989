using System;
using System.Collections.Generic;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 城池等级
    /// </summary>
    public enum CitySize : byte
    {
        Small  = 0,  // 小城池: 1 block (3×3 tile)
        Medium = 1,  // 中城池: 2×2 block (6×6 tile)
        Large  = 2,  // 大城池: 3×3 block (9×9 tile)
    }

    /// <summary>
    /// 城池数据 - 单个城池的位置、等级、名称
    /// </summary>
    [Serializable]
    public class CityData
    {
        public string id;
        public string displayName;
        public CitySize size;
        public int logicalX;
        public int logicalY;

        [Tooltip("所属郡名")]
        public string district;

        [Tooltip("是否为郡治/州治")]
        public bool isCapital;
    }

    /// <summary>
    /// 城池模板 - 定义小/中/大城池的视觉组成
    /// 在 Inspector 中配置：右键 Create → YouZhou → City Template
    /// </summary>
    [CreateAssetMenu(fileName = "CityTemplate", menuName = "YouZhou/City Template")]
    public class CityTemplate : ScriptableObject
    {
        public CitySize size;

        [Tooltip("城池核心建筑精灵（放置在中心）")]
        public Sprite[] coreBuildings;

        [Tooltip("辅助建筑精灵（放置在周围）")]
        public Sprite[] auxiliaryBuildings;

        [Tooltip("城墙精灵（中/大城池使用）")]
        public Sprite[] wallSprites;

        [Tooltip("塔楼精灵（大城池四角使用）")]
        public Sprite[] towerSprites;

        [Tooltip("道路精灵（城内道路）")]
        public Sprite[] roadSprites;

        /// <summary>获取模板占据的逻辑块大小</summary>
        public int BlockExtent => size switch
        {
            CitySize.Small  => 1,
            CitySize.Medium => 2,
            CitySize.Large  => 3,
            _ => 1
        };
    }

    /// <summary>
    /// 城池管理器 - 管理所有城池的放置、持久化
    /// </summary>
    [Serializable]
    public class CityRegistry
    {
        public List<CityData> cities = new();

        public void AddCity(CityData city)
        {
            // 检查重复
            cities.RemoveAll(c => c.id == city.id);
            cities.Add(city);
        }

        public void RemoveCity(string id)
        {
            cities.RemoveAll(c => c.id == id);
        }

        public CityData FindCity(string id)
        {
            return cities.Find(c => c.id == id);
        }

        public List<CityData> GetCitiesByDistrict(string district)
        {
            return cities.FindAll(c => c.district == district);
        }
    }
}
