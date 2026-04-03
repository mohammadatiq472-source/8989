namespace YouZhou.Map
{
    /// <summary>
    /// 逻辑地形类型 - 每个 300×106 逻辑块的地形属性
    /// 视觉层(900×318)与此解耦，仅作装饰
    /// </summary>
    public enum TerrainType : byte
    {
        Snow          = 0,   // 雪地（默认）
        SnowForest    = 1,   // 雪地 + 冬树
        FrozenLake    = 2,   // 冰湖
        SnowRoad      = 3,   // 雪道
        SnowTown      = 4,   // 雪地城镇（建筑 + 道路）
        SnowMountain  = 5,   // 雪山/岩石
        Grass         = 6,   // 草地（对比区域）
        GrassForest   = 7,   // 草地 + 树林
        River         = 8,   // 河流
        FrozenRiver   = 9,   // 冰河
        CastleWall    = 10,  // 城墙/要塞
        Farmland      = 11,  // 农田（麦田/玉米）
    }
}
