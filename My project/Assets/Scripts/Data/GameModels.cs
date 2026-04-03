using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace SLGCommander
{
    // ─── Map ────────────────────────────────────────────────────────────────

    [Serializable]
    public class WorldState
    {
        [JsonProperty("tick")]          public int tick;
        [JsonProperty("worldVersion")]  public int worldVersion;
        [JsonProperty("map")]           public MapData map;
        [JsonProperty("units")]         public List<Unit> units = new();
        [JsonProperty("factions")]      public Dictionary<string, FactionState> factions = new();
        [JsonProperty("alliance")]      public AllianceState alliance;
        [JsonProperty("intel")]         public Dictionary<string, TileIntel> intel = new();
        [JsonProperty("reports")]       public List<object> reports = new();
    }

    [Serializable]
    public class MapData
    {
        [JsonProperty("width")]      public int width;
        [JsonProperty("height")]     public int height;
        [JsonProperty("tiles")]      public List<Tile> tiles = new();
        [JsonProperty("tileStates")] public List<TileState> tileStates = new();
        [JsonProperty("regions")]    public List<MapRegion> regions = new();
    }

    /// <summary>
    /// Lightweight tile ownership snapshot returned by GET /api/world.
    /// Full tile geometry comes from GET /api/world/map-layout.
    /// </summary>
    [Serializable]
    public class TileState
    {
        [JsonProperty("id")]            public string id;
        [JsonProperty("owner")]         public string owner = "";
        [JsonProperty("enemyPressure")] public float enemyPressure;
    }

    [Serializable]
    public class Tile
    {
        [JsonProperty("id")]           public string id;
        [JsonProperty("name")]         public string name = "";
        [JsonProperty("x")]            public int x;
        [JsonProperty("y")]            public int y;
        [JsonProperty("type")]         public string type = "plain";
        [JsonProperty("terrain")]      public string terrain = "wasteland";
        [JsonProperty("owner")]        public string owner = "";
        [JsonProperty("moveCost")]     public float moveCost = 1f;
        [JsonProperty("enemyPressure")]   public float enemyPressure;
        [JsonProperty("district")]     public string district;
        [JsonProperty("landmarkName")] public string landmarkName;
        [JsonProperty("resourceLevel")]   public int? resourceLevel;
        [JsonProperty("resourceKind")]    public string resourceKind;
        [JsonProperty("cityLevel")]    public int? cityLevel;
    }

    [Serializable]
    public class MapRegion
    {
        [JsonProperty("id")]      public string id;
        [JsonProperty("name")]    public string name;
        [JsonProperty("tileIds")] public List<string> tileIds = new();
    }

    // ─── Unit ───────────────────────────────────────────────────────────────

    [Serializable]
    public class Unit
    {
        [JsonProperty("id")]       public string id;
        [JsonProperty("name")]     public string name;
        [JsonProperty("faction")]  public string faction;
        [JsonProperty("tileId")]   public string tileId;
        [JsonProperty("strength")] public float strength;
        [JsonProperty("mobility")] public float mobility;
        [JsonProperty("supply")]   public float supply;
        [JsonProperty("status")]   public string status;
        [JsonProperty("hero")]     public Hero hero;
        [JsonProperty("corps")]    public Corps corps;
        [JsonProperty("currentTask")] public string currentTask;
        [JsonProperty("coHeroes")] public List<CoHero> coHeroes = new();
        [JsonProperty("aiPlayerId")] public string aiPlayerId;
    }

    [Serializable]
    public class CoHero
    {
        [JsonProperty("id")]           public string id;
        [JsonProperty("name")]         public string name;
        [JsonProperty("archetype")]    public string archetype;
        [JsonProperty("level")]        public int level;
        [JsonProperty("troopType")]    public string troopType;
        [JsonProperty("force")]        public int force;
        [JsonProperty("command")]      public int command;
        [JsonProperty("intelligence")] public int intelligence;
        [JsonProperty("charisma")]     public int charisma;
        [JsonProperty("speed")]        public int speed;
    }

    [Serializable]
    public class Hero
    {
        [JsonProperty("id")]        public string id;
        [JsonProperty("name")]      public string name;
        [JsonProperty("title")]     public string title;
        [JsonProperty("faction")]   public string faction;
        [JsonProperty("quality")]   public string quality;
        [JsonProperty("archetype")] public string archetype;
        [JsonProperty("level")]     public int level;
        [JsonProperty("troopType")] public string troopType;
        [JsonProperty("cardType")]  public string cardType;
        [JsonProperty("portraitKey")] public string portraitKey;
        [JsonProperty("force")]     public int force;
        [JsonProperty("command")]   public int command;
        [JsonProperty("intelligence")] public int intelligence;
        [JsonProperty("charisma")]  public int charisma;
        [JsonProperty("speed")]     public int speed;
        [JsonProperty("agility")]   public int agility;
        [JsonProperty("tactics")]   public int tactics;
        [JsonProperty("avatarKey")] public string avatarKey;
        [JsonProperty("signatureSkill")] public HeroSignatureSkill signatureSkill;
        [JsonProperty("growthFocus")] public string growthFocus;
        [JsonProperty("traits")]    public List<string> traits = new();
    }

    [Serializable]
    public class HeroSignatureSkill
    {
        [JsonProperty("name")] public string name;
        [JsonProperty("detail")] public string detail;
    }

    [Serializable]
    public class Corps
    {
        [JsonProperty("name")]      public string name;
        [JsonProperty("doctrine")]  public string doctrine;
        [JsonProperty("specialty")] public string specialty;
        [JsonProperty("readiness")] public float readiness;
        [JsonProperty("roster")]    public List<string> roster = new();
    }

    // ─── Faction ────────────────────────────────────────────────────────────

    [Serializable]
    public class FactionState
    {
        [JsonProperty("id")]           public string id;
        [JsonProperty("food")]         public float food;
        [JsonProperty("actionPoints")] public float actionPoints;
        [JsonProperty("wood")]         public float? wood;
        [JsonProperty("stone")]        public float? stone;
        [JsonProperty("iron")]         public float? iron;
        [JsonProperty("heroCommand")]  public FactionHeroCommand heroCommand;
        [JsonProperty("luoyangHoldTicks")] public int? luoyangHoldTicks;
        [JsonProperty("capturedCities")] public List<string> capturedCities = new();
        [JsonProperty("recruitCooldown")] public int? recruitCooldown;
        [JsonProperty("recruitedTotal")] public int? recruitedTotal;
        [JsonProperty("aiPlayers")]    public List<AIPlayer> aiPlayers = new();
        [JsonProperty("aiQuota")]      public FactionAiQuota aiQuota;
    }

    [Serializable]
    public class AIPlayer
    {
        [JsonProperty("id")] public string id;
        [JsonProperty("name")] public string name;
        [JsonProperty("factionId")] public string factionId;
        [JsonProperty("unitIds")] public List<string> unitIds = new();
        [JsonProperty("specialty")] public string specialty;
        [JsonProperty("lore")] public string lore;
    }

    [Serializable]
    public class FactionAiQuota
    {
        [JsonProperty("initialQuota")]  public int initialQuota;
        [JsonProperty("currentQuota")]  public int currentQuota;
        [JsonProperty("maxQuota")]      public int maxQuota;
        [JsonProperty("growthScore")]   public int growthScore;
        [JsonProperty("tugIntensity")]  public int tugIntensity;
        [JsonProperty("nextUnlockScore")] public int? nextUnlockScore;
        [JsonProperty("lastGrowthTick")] public int? lastGrowthTick;
    }

    [Serializable]
    public class FactionHeroCommand
    {
        [JsonProperty("doctrine")]            public string doctrine;
        [JsonProperty("homeTileId")]          public string homeTileId;
        [JsonProperty("commandLimit")]        public int commandLimit;
        [JsonProperty("developmentPoints")]   public int developmentPoints;
        [JsonProperty("heroLuck")]            public float heroLuck;
        [JsonProperty("acquisitionThreshold")] public int acquisitionThreshold;
        [JsonProperty("rosterHeroIds")]       public List<string> rosterHeroIds = new();
        [JsonProperty("reserveHeroIds")]      public List<string> reserveHeroIds = new();
        [JsonProperty("prospectHeroIds")]     public List<string> prospectHeroIds = new();
        [JsonProperty("recentHeroId")]        public string recentHeroId;
    }

    // ─── Alliance / Generals ────────────────────────────────────────────────

    [Serializable]
    public class AllianceState
    {
        [JsonProperty("generals")] public List<GeneralProfile> generals = new();
    }

    [Serializable]
    public class GeneralProfile
    {
        [JsonProperty("id")]          public string id;
        [JsonProperty("name")]        public string name;
        [JsonProperty("tileId")]      public string tileId;
        [JsonProperty("personality")] public GeneralPersonality personality;
        [JsonProperty("history")]     public GeneralHistory history;
        [JsonProperty("relationship")] public GeneralRelationship relationship;
    }

    [Serializable]
    public class GeneralPersonality
    {
        [JsonProperty("aggression")]    public float aggression;
        [JsonProperty("loyalty")]       public float loyalty;
        [JsonProperty("riskTolerance")] public float riskTolerance;
        [JsonProperty("speciality")]    public string speciality;
    }

    [Serializable]
    public class GeneralHistory
    {
        [JsonProperty("battlesWon")]   public int battlesWon;
        [JsonProperty("battlesLost")]  public int battlesLost;
        [JsonProperty("keyDecisions")] public List<string> keyDecisions = new();
    }

    [Serializable]
    public class GeneralRelationship
    {
        [JsonProperty("lordTrust")]      public float lordTrust;
        [JsonProperty("recentIgnored")]  public int recentIgnored;
    }

    // ─── Intel ──────────────────────────────────────────────────────────────

    [Serializable]
    public class TileIntel
    {
        [JsonProperty("tileId")]          public string tileId;
        [JsonProperty("lastScoutedTick")] public int lastScoutedTick;
        [JsonProperty("unitIds")]         public List<string> unitIds = new();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  API Response / Request Models (mirrors shared/contracts/game.ts)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── Health (/api/health) ───────────────────────────────────────────────

    [Serializable]
    public class HealthResponse
    {
        [JsonProperty("ok")] public bool ok;
    }

    // ─── WorldSummaryResponse (/api/world) ──────────────────────────────────

    [Serializable]
    public class WorldSummaryResponse
    {
        [JsonProperty("world")] public WorldState world;
    }

    // ─── MapLayoutResponse (/api/world/map-layout) ──────────────────────────

    [Serializable]
    public class MapLayoutResponse
    {
        [JsonProperty("mapLayoutVersion")] public int mapLayoutVersion;
        [JsonProperty("map")]              public MapLayoutData map;
        [JsonProperty("chunk")]            public MapLayoutChunk chunk;
    }

    [Serializable]
    public class MapLayoutData
    {
        [JsonProperty("width")]       public int width;
        [JsonProperty("height")]      public int height;
        [JsonProperty("tiles")]       public List<Tile> tiles = new();
        [JsonProperty("connections")] public Dictionary<string, List<string>> connections = new();
        [JsonProperty("regions")]     public List<MapRegion> regions = new();
        [JsonProperty("overlays")]    public MapOverlays overlays;
    }

    [Serializable]
    public class MapOverlays
    {
        [JsonProperty("mountainRidges")] public List<MapContinuousPath> mountainRidges = new();
        [JsonProperty("rivers")]         public List<MapContinuousPath> rivers = new();
        [JsonProperty("cityClusters")]   public List<MapCityCluster> cityClusters = new();
    }

    [Serializable]
    public class MapContinuousPath
    {
        [JsonProperty("id")]      public string id = "";
        [JsonProperty("nodes")]   public List<PathNode> nodes = new();
        [JsonProperty("tileIds")] public List<string> tileIds = new();
    }

    [Serializable]
    public class PathNode
    {
        [JsonProperty("x")] public int x;
        [JsonProperty("y")] public int y;
    }

    [Serializable]
    public class MapCityCluster
    {
        [JsonProperty("id")]             public string id = "";
        [JsonProperty("camp")]           public string camp = "neutral";
        [JsonProperty("cityHallTileId")] public string cityHallTileId = "";
        [JsonProperty("tileIds")]        public List<string> tileIds = new();
        [JsonProperty("footprintTiles")] public int footprintTiles;
    }

    [Serializable]
    public class MapLayoutChunk
    {
        [JsonProperty("scope")]              public string scope = "";
        [JsonProperty("id")]                 public string id = "";
        [JsonProperty("loadedProvinceIds")]  public List<string> loadedProvinceIds = new();
        [JsonProperty("pendingProvinceIds")] public List<string> pendingProvinceIds = new();
    }

    // ─── WorldAction (/api/world/action) ────────────────────────────────────

    [Serializable]
    public class WorldActionRequest
    {
        [JsonProperty("action")]  public string action = "";
        [JsonProperty("payload")] public object payload;
    }

    [Serializable]
    public class WorldActionResponse
    {
        [JsonProperty("ok")]           public bool ok;
        [JsonProperty("worldVersion")] public int worldVersion;
        [JsonProperty("tick")]         public int tick;
        [JsonProperty("world")]        public WorldState world;
        [JsonProperty("message")]      public string message = "";
        [JsonProperty("unitId")]       public string unitId = "";
    }

    // ─── StrategicPlan + StructuredOrder ────────────────────────────────────

    [Serializable]
    public class StrategicPlan
    {
        [JsonProperty("intent")]          public string intent = "";
        [JsonProperty("priority")]        public string priority = "medium";
        [JsonProperty("orders")]          public List<StructuredOrder> orders = new();
        [JsonProperty("constraints")]     public List<string> constraints = new();
        [JsonProperty("reviewAfterTicks")]public int reviewAfterTicks;
    }

    [Serializable]
    public class StructuredOrder
    {
        [JsonProperty("unitId")] public string unitId = "";
        [JsonProperty("action")] public string action = "";
        [JsonProperty("target")] public string target = "";
    }

    // ─── PlanExecution ──────────────────────────────────────────────────────

    [Serializable]
    public class PlanExecution
    {
        [JsonProperty("requestId")] public string requestId = "";
        [JsonProperty("plan")]      public StrategicPlan plan;
        [JsonProperty("status")]    public string status = "active";
        [JsonProperty("startTick")] public int startTick;
        [JsonProperty("orders")]    public List<ExecutableOrder> orders = new();
    }

    [Serializable]
    public class ExecutableOrder
    {
        [JsonProperty("unitId")]       public string unitId = "";
        [JsonProperty("action")]       public string action = "";
        [JsonProperty("targetTileId")] public string targetTileId = "";
        [JsonProperty("status")]       public string status = "queued";
        [JsonProperty("path")]         public List<string> path = new();
        [JsonProperty("stepIndex")]    public int stepIndex;
    }

    // ─── PlanningCreate (/api/planning/create) ──────────────────────────────

    [Serializable]
    public class PlannerConfig
    {
        [JsonProperty("mode")]  public string mode = "mock";
        [JsonProperty("model")] public string model = "";
    }

    [Serializable]
    public class PlanningCreateRequest
    {
        [JsonProperty("strategicCommand")] public string strategicCommand = "";
        [JsonProperty("config")]           public PlannerConfig config;
    }

    [Serializable]
    public class PlanningCreateResponse
    {
        [JsonProperty("source")]            public string source = "";
        [JsonProperty("plan")]              public StrategicPlan plan;
        [JsonProperty("note")]              public string note = "";
        [JsonProperty("explanation")]       public string explanation = "";
        [JsonProperty("planningRationale")] public List<string> planningRationale = new();
        [JsonProperty("rawText")]           public string rawText;
        [JsonProperty("metrics")]           public PlannerMetrics metrics;
    }

    [Serializable]
    public class PlannerMetrics
    {
        [JsonProperty("requestId")]        public string requestId;
        [JsonProperty("gatewayProvider")]   public string gatewayProvider;
        [JsonProperty("model")]            public string model;
        [JsonProperty("latencyMs")]        public int latencyMs;
        [JsonProperty("promptTokens")]     public int? promptTokens;
        [JsonProperty("completionTokens")] public int? completionTokens;
        [JsonProperty("totalTokens")]      public int? totalTokens;
        [JsonProperty("estimatedCostUsd")] public float? estimatedCostUsd;
    }

    // ─── NarrativeEvent ─────────────────────────────────────────────────────

    [Serializable]
    public class NarrativeEvent
    {
        [JsonProperty("id")]           public string id;
        [JsonProperty("tick")]         public int tick;
        [JsonProperty("type")]         public string type = "";
        [JsonProperty("actors")]       public List<string> actors = new();
        [JsonProperty("summary")]      public string summary = "";
        [JsonProperty("causalChain")]  public List<string> causalChain = new();
        [JsonProperty("consequences")] public List<string> consequences = new();
        [JsonProperty("significance")] public string significance = "minor";
    }

    [Serializable]
    public class NarrativeEventsResponse
    {
        [JsonProperty("items")] public List<NarrativeEvent> items = new();
    }

    // ─── GeneralDirective (/api/world/action previewGeneralDirectives) ──────

    [Serializable]
    public class GeneralDirective
    {
        [JsonProperty("generalId")]    public string generalId = "";
        [JsonProperty("instruction")]  public string instruction = "";
        [JsonProperty("targetTileId")] public string targetTileId = "";
        [JsonProperty("action")]       public string action = "";
    }

    [Serializable]
    public class GeneralDirectivePreviewResponse
    {
        [JsonProperty("ok")]           public bool ok;
        [JsonProperty("tick")]         public int tick;
        [JsonProperty("worldVersion")] public int worldVersion;
        [JsonProperty("side")]         public string side = "";
        [JsonProperty("accepted")]     public int accepted;
        [JsonProperty("rejected")]     public int rejected;
        [JsonProperty("warnings")]     public List<string> warnings = new();
        [JsonProperty("items")]        public List<GeneralDirectivePreviewItem> items = new();
        [JsonProperty("mergedPlan")]   public StrategicPlan mergedPlan;
    }

    [Serializable]
    public class GeneralDirectivePreviewItem
    {
        [JsonProperty("directiveIndex")]     public int directiveIndex;
        [JsonProperty("generalIdInput")]     public string generalIdInput = "";
        [JsonProperty("instruction")]        public string instruction = "";
        [JsonProperty("status")]             public string status = "";
        [JsonProperty("confidence")]         public string confidence = "";
        [JsonProperty("matchMode")]          public string matchMode = "";
        [JsonProperty("reason")]             public string reason = "";
        [JsonProperty("warning")]            public string warning = "";
        [JsonProperty("action")]             public string action = "";
        [JsonProperty("resolvedGeneralId")]  public string resolvedGeneralId = "";
        [JsonProperty("resolvedGeneralName")]public string resolvedGeneralName = "";
        [JsonProperty("resolvedUnitId")]     public string resolvedUnitId = "";
        [JsonProperty("targetTileId")]       public string targetTileId = "";
        [JsonProperty("targetTileName")]     public string targetTileName = "";
    }

    // ─── Nation (/api/nation) ───────────────────────────────────────────────

    [Serializable]
    public class NationProfile
    {
        [JsonProperty("factionId")]     public string factionId = "";
        [JsonProperty("nationName")]    public string nationName = "";
        [JsonProperty("color")]         public string color = "";
        [JsonProperty("capitalTileId")] public string capitalTileId;
        [JsonProperty("capitalName")]   public string capitalName;
        [JsonProperty("foundedAt")]     public string foundedAt = "";
        [JsonProperty("updatedAt")]     public string updatedAt = "";
        [JsonProperty("territoryTileCount")]      public int territoryTileCount;
        [JsonProperty("controlledCityCount")]     public int controlledCityCount;
        [JsonProperty("controlledResourceCount")] public int controlledResourceCount;
    }

    [Serializable]
    public class NationProfilesResponse
    {
        [JsonProperty("items")]    public List<NationProfile> items = new();
        [JsonProperty("fetchedAt")] public string fetchedAt;
    }

    [Serializable]
    public class NationFoundResponse
    {
        [JsonProperty("ok")]      public bool ok;
        [JsonProperty("nation")]  public NationProfile nation;
        [JsonProperty("message")] public string message = "";
    }

    // ─── AI Config (/api/ai) ────────────────────────────────────────────────

    [Serializable]
    public class AiModelRoleConfig
    {
        [JsonProperty("commander")] public string commander = "";
        [JsonProperty("general")]   public string general = "";
        [JsonProperty("unit")]      public string unit = "";
    }

    [Serializable]
    public class AiHubConfig
    {
        [JsonProperty("automationEnabled")] public bool automationEnabled;
        [JsonProperty("plannerFrequency")]  public int plannerFrequency;
        [JsonProperty("riskPreference")]    public string riskPreference = "balanced";
        [JsonProperty("doctrinePrompt")]    public string doctrinePrompt = "";
        [JsonProperty("models")]            public AiModelRoleConfig models;
    }

    [Serializable]
    public class AiConfigResponse
    {
        [JsonProperty("config")]    public AiHubConfig config;
        [JsonProperty("updatedAt")] public string updatedAt;
    }

    [Serializable]
    public class AiModelDescriptor
    {
        [JsonProperty("id")]            public string id;
        [JsonProperty("name")]          public string name;
        [JsonProperty("provider")]      public string provider;
        [JsonProperty("contextWindow")] public int? contextWindow;
        [JsonProperty("tags")]          public List<string> tags = new();
        [JsonProperty("available")]     public bool available;
    }

    [Serializable]
    public class AiModelsResponse
    {
        [JsonProperty("items")]    public List<AiModelDescriptor> items = new();
        [JsonProperty("source")]   public string source;
        [JsonProperty("fetchedAt")] public string fetchedAt;
        [JsonProperty("stale")]    public bool stale;
        [JsonProperty("error")]    public string error;
    }

    [Serializable]
    public class AiLogEntry
    {
        [JsonProperty("id")]                     public string id;
        [JsonProperty("status")]                 public string status;
        [JsonProperty("sourceMode")]             public string sourceMode;
        [JsonProperty("requestedTick")]          public int requestedTick;
        [JsonProperty("requestedWorldVersion")]  public int requestedWorldVersion;
        [JsonProperty("message")]                public string message;
        [JsonProperty("resolvedSource")]         public string resolvedSource;
        [JsonProperty("plannerNote")]            public string plannerNote;
        [JsonProperty("completedTick")]          public int? completedTick;
        [JsonProperty("completedWorldVersion")]  public int? completedWorldVersion;
    }

    [Serializable]
    public class AiLogsResponse
    {
        [JsonProperty("items")]    public List<AiLogEntry> items = new();
        [JsonProperty("limit")]    public int limit;
        [JsonProperty("fetchedAt")] public string fetchedAt;
    }

    // ─── World Events (/api/events) ─────────────────────────────────────────

    [Serializable]
    public class WorldEventRecord
    {
        [JsonProperty("id")]           public string id = "";
        [JsonProperty("category")]     public string category = "";
        [JsonProperty("action")]       public string action = "";
        [JsonProperty("success")]      public bool success;
        [JsonProperty("tick")]         public int tick;
        [JsonProperty("worldVersion")] public int worldVersion;
        [JsonProperty("createdAt")]    public string createdAt = "";
        [JsonProperty("requestId")]    public string requestId;
        [JsonProperty("message")]      public string message;
        [JsonProperty("metadata")]     public JObject metadata;
    }

    [Serializable]
    public class WorldEventsResponse
    {
        [JsonProperty("items")] public List<WorldEventRecord> items = new();
    }

    // ─── Map Overview (/api/map/overview) ───────────────────────────────────

    [Serializable]
    public class MapOverviewWorldSize
    {
        [JsonProperty("width")]     public int width;
        [JsonProperty("height")]    public int height;
        [JsonProperty("tileCount")] public int tileCount;
    }

    [Serializable]
    public class MapOverviewProvince
    {
        [JsonProperty("id")]                     public string id;
        [JsonProperty("name")]                   public string name;
        [JsonProperty("summary")]                public string summary;
        [JsonProperty("centerX")]                public int centerX;
        [JsonProperty("centerY")]                public int centerY;
        [JsonProperty("centerTileId")]           public string centerTileId;
        [JsonProperty("primaryControlledTiles")] public int primaryControlledTiles;
        [JsonProperty("opposingControlledTiles")]public int opposingControlledTiles;
        [JsonProperty("neutralTiles")]           public int neutralTiles;
        [JsonProperty("resourceTiles")]          public int resourceTiles;
        [JsonProperty("cityTiles")]              public int cityTiles;
        [JsonProperty("passTiles")]              public int passTiles;
        [JsonProperty("primaryUnits")]           public int primaryUnits;
        [JsonProperty("opposingUnits")]          public int opposingUnits;
    }

    [Serializable]
    public class MapOverviewNation
    {
        [JsonProperty("id")]               public string id;
        [JsonProperty("name")]             public string name;
        [JsonProperty("color")]            public string color;
        [JsonProperty("strength")]         public float strength;
        [JsonProperty("controlledTiles")]  public int controlledTiles;
        [JsonProperty("controlledRegions")] public int controlledRegions;
        [JsonProperty("capitalTileId")]    public string capitalTileId;
        [JsonProperty("capitalName")]      public string capitalName;
    }

    [Serializable]
    public class MapOverviewResponse
    {
        [JsonProperty("tick")]            public int tick;
        [JsonProperty("worldVersion")]    public int worldVersion;
        [JsonProperty("primaryFactionId")]public string primaryFactionId;
        [JsonProperty("worldSize")]       public MapOverviewWorldSize worldSize;
        [JsonProperty("provinces")]       public List<MapOverviewProvince> provinces = new();
        [JsonProperty("nations")]         public List<MapOverviewNation> nations = new();
    }

    // ─── Planning Job History ───────────────────────────────────────────────

    [Serializable]
    public class PlanningJobHistoryEntry
    {
        [JsonProperty("id")]                   public string id = "";
        [JsonProperty("status")]               public string status = "";
        [JsonProperty("sourceMode")]           public string sourceMode = "";
        [JsonProperty("strategicCommand")]     public string strategicCommand = "";
        [JsonProperty("requestedTick")]        public int requestedTick;
        [JsonProperty("requestedWorldVersion")]public int requestedWorldVersion;
        [JsonProperty("message")]              public string message = "";
        [JsonProperty("resolvedSource")]       public string resolvedSource;
        [JsonProperty("plannerNote")]          public string plannerNote;
        [JsonProperty("plannerExplanation")]   public string plannerExplanation;
        [JsonProperty("planningRationale")]    public List<string> planningRationale = new();
        [JsonProperty("completedTick")]        public int? completedTick;
        [JsonProperty("completedWorldVersion")]public int? completedWorldVersion;
        [JsonProperty("plan")]                 public StrategicPlan plan;
    }

    // ─── Replay ─────────────────────────────────────────────────────────────

    [Serializable]
    public class ReplayArchiveEntry
    {
        [JsonProperty("requestId")]          public string requestId = "";
        [JsonProperty("source")]             public string source = "";
        [JsonProperty("strategicCommand")]   public string strategicCommand = "";
        [JsonProperty("basedOnWorldVersion")]public int basedOnWorldVersion;
        [JsonProperty("outcome")]            public string outcome = "";
        [JsonProperty("frameCount")]         public int frameCount;
        [JsonProperty("createdAt")]          public string createdAt = "";
        [JsonProperty("updatedAt")]          public string updatedAt = "";
    }

    [Serializable]
    public class ReplayArchiveResponse
    {
        [JsonProperty("items")] public List<ReplayArchiveEntry> items = new();
    }

    [Serializable]
    public class ExecutionReplay
    {
        [JsonProperty("requestId")]  public string requestId = "";
        [JsonProperty("planIntent")] public string planIntent = "";
        [JsonProperty("startTick")]  public int startTick;
        [JsonProperty("endTick")]    public int endTick;
        [JsonProperty("frames")]     public List<ReplayFrame> frames = new();
    }

    [Serializable]
    public class ReplayFrame
    {
        [JsonProperty("tick")]       public int tick;
        [JsonProperty("highlights")] public List<ReplayHighlight> highlights = new();
    }

    [Serializable]
    public class ReplayHighlight
    {
        [JsonProperty("type")]   public string type = "";
        [JsonProperty("unitId")] public string unitId = "";
        [JsonProperty("tileId")] public string tileId = "";
        [JsonProperty("note")]   public string note = "";
    }

    // ─── Battle ─────────────────────────────────────────────────────────────

    [Serializable]
    public class BattleOutcomeRecord
    {
        [JsonProperty("id")]             public string id = "";
        [JsonProperty("tick")]           public int tick;
        [JsonProperty("regionId")]       public string regionId = "";
        [JsonProperty("tileId")]         public string tileId = "";
        [JsonProperty("attackerFaction")] public string attackerFaction = "";
        [JsonProperty("attackerUnitId")] public string attackerUnitId = "";
        [JsonProperty("outcome")]        public string outcome = "";
        [JsonProperty("attackerLoss")]   public float attackerLoss;
        [JsonProperty("defenderLoss")]   public float defenderLoss;
        [JsonProperty("alliedSupport")]  public float alliedSupport;
        [JsonProperty("summary")]        public string summary = "";
    }

    [Serializable]
    public class DiplomacyAgreement
    {
        [JsonProperty("id")]      public string id = "";
        [JsonProperty("tick")]    public int tick;
        [JsonProperty("type")]    public string type = "";
        [JsonProperty("parties")] public List<string> parties = new();
        [JsonProperty("duration")] public int duration;
        [JsonProperty("terms")]   public string terms = "";
    }

    // ─── WebSocket (/ws) ───────────────────────────────────────────────────

    [Serializable]
    public class WsDeltaUnitData
    {
        [JsonProperty("name")]     public string name = "";
        [JsonProperty("faction")]  public string faction = "";
        [JsonProperty("tileId")]   public string tileId = "";
        [JsonProperty("strength")] public float strength;
        [JsonProperty("supply")]   public float supply;
        [JsonProperty("status")]   public string status = "";
    }

    [Serializable]
    public class WsDeltaUnitChange
    {
        [JsonProperty("id")]  public string id = "";
        [JsonProperty("op")]  public string op = "";
        [JsonProperty("data")] public WsDeltaUnitData data;
    }

    [Serializable]
    public class WsDeltaTileChange
    {
        [JsonProperty("id")]            public string id = "";
        [JsonProperty("owner")]         public string owner;
        [JsonProperty("enemyPressure")] public float enemyPressure;
    }

    [Serializable]
    public class WsDeltaFactionStat
    {
        [JsonProperty("territories")]   public int territories;
        [JsonProperty("totalStrength")] public float totalStrength;
        [JsonProperty("unitCount")]     public int unitCount;
    }

    [Serializable]
    public class WsAiQuotaChange
    {
        [JsonProperty("factionId")]       public string factionId = "";
        [JsonProperty("previousQuota")]   public int previousQuota;
        [JsonProperty("currentQuota")]    public int currentQuota;
        [JsonProperty("maxQuota")]        public int maxQuota;
        [JsonProperty("growthScore")]     public int growthScore;
        [JsonProperty("tugIntensity")]    public int tugIntensity;
        [JsonProperty("nextUnlockScore")] public int? nextUnlockScore;
    }

    [Serializable]
    public class WsTickDeltaMessage
    {
        [JsonProperty("type")]           public string type = "tick_delta";
        [JsonProperty("tick")]           public int tick;
        [JsonProperty("worldVersion")]   public int worldVersion;
        [JsonProperty("factionStats")]   public Dictionary<string, WsDeltaFactionStat> factionStats = new();
        [JsonProperty("unitChanges")]    public List<WsDeltaUnitChange> unitChanges = new();
        [JsonProperty("tileChanges")]    public List<WsDeltaTileChange> tileChanges = new();
        [JsonProperty("aiQuotaChanges")] public List<WsAiQuotaChange> aiQuotaChanges = new();
        [JsonProperty("events")]         public List<NarrativeEvent> events = new();
    }

    [Serializable]
    public class WsBattleReportMessage
    {
        [JsonProperty("type")]   public string type = "battle_report";
        [JsonProperty("tick")]   public int tick;
        [JsonProperty("report")] public BattleOutcomeRecord report;
    }

    [Serializable]
    public class WsDiplomacyMessage
    {
        [JsonProperty("type")]  public string type = "diplomacy_event";
        [JsonProperty("tick")]  public int tick;
        [JsonProperty("event")] public DiplomacyAgreement eventData;
    }

    [Serializable]
    public class WsGeneralActionMessage
    {
        [JsonProperty("type")]           public string type = "general_action";
        [JsonProperty("tick")]           public int tick;
        [JsonProperty("generalId")]      public string generalId = "";
        [JsonProperty("action")]         public string action = "";
        [JsonProperty("autonomySource")] public string autonomySource = "";
        [JsonProperty("loyaltyLevel")]   public float? loyaltyLevel;
        [JsonProperty("lordTrust")]      public float? lordTrust;
        [JsonProperty("tier")]           public int? tier;
    }

    [Serializable]
    public class WsGeneralMessageMessage
    {
        [JsonProperty("type")]         public string type = "general_message";
        [JsonProperty("tick")]         public int tick;
        [JsonProperty("generalId")]    public string generalId = "";
        [JsonProperty("generalName")]  public string generalName = "";
        [JsonProperty("faction")]      public string faction = "";
        [JsonProperty("text")]         public string text = "";
        [JsonProperty("trigger")]      public string trigger = "";
        [JsonProperty("loyaltyLevel")] public float loyaltyLevel;
        [JsonProperty("lordTrust")]    public float lordTrust;
    }

    [Serializable]
    public class WsSubscribedMessage
    {
        [JsonProperty("type")]      public string type = "subscribed";
        [JsonProperty("factionId")] public string factionId = "";
        [JsonProperty("tick")]      public int tick;
    }

    [Serializable]
    public class WsPongMessage
    {
        [JsonProperty("type")] public string type = "pong";
    }

    [Serializable]
    public class WsErrorMessage
    {
        [JsonProperty("type")]    public string type = "error";
        [JsonProperty("message")] public string message = "";
    }

    [Serializable]
    public class WsClientSubscribeMessage
    {
        [JsonProperty("type")]      public string type = "subscribe";
        [JsonProperty("factionId")] public string factionId = "";
        [JsonProperty("token")]     public string token;
    }

    [Serializable]
    public class WsClientPingMessage
    {
        [JsonProperty("type")] public string type = "ping";
    }

    // ─── Generals List (/api/generals) ──────────────────────────────────────

    [Serializable]
    public class GeneralSummary
    {
        [JsonProperty("id")]            public string id;
        [JsonProperty("name")]          public string name;
        [JsonProperty("faction")]       public string faction;
        [JsonProperty("unitId")]        public string unitId;
        [JsonProperty("personality")]   public GeneralPersonality personality;
        [JsonProperty("stats")]         public GeneralStats stats;
        [JsonProperty("memorySnippet")] public List<string> memorySnippet = new();
    }

    [Serializable]
    public class GeneralStats
    {
        [JsonProperty("battlesWon")]           public int battlesWon;
        [JsonProperty("battlesLost")]          public int battlesLost;
        [JsonProperty("lordTrust")]            public float lordTrust;
        [JsonProperty("recentIgnored")]        public int recentIgnored;
        [JsonProperty("pendingGrievanceCount")] public int pendingGrievanceCount;
    }

    [Serializable]
    public class GeneralsListResponse
    {
        [JsonProperty("ok")]       public bool ok;
        [JsonProperty("count")]    public int count;
        [JsonProperty("generals")] public List<GeneralSummary> generals = new();
    }

    // ─── General Chat (/api/generals/:id/chat) ─────────────────────────────

    [Serializable]
    public class GeneralChatMessage
    {
        [JsonProperty("role")]      public string role = "";
        [JsonProperty("content")]   public string content = "";
        [JsonProperty("timestamp")] public string timestamp = "";
    }

    [Serializable]
    public class GeneralChatResponse
    {
        [JsonProperty("ok")]       public bool ok;
        [JsonProperty("reply")]    public string reply = "";
        [JsonProperty("mode")]     public string mode;
        [JsonProperty("emotion")]  public string emotion;
        [JsonProperty("actions")]  public JArray actions;
        [JsonProperty("error")]    public string error;
    }

    // ─── Save Slots (/api/save-slots) ───────────────────────────────────────

    [Serializable]
    public class SaveSlotRecord
    {
        [JsonProperty("slotId")]       public string slotId = "";
        [JsonProperty("label")]        public string label = "";
        [JsonProperty("tick")]         public int tick;
        [JsonProperty("worldVersion")] public int worldVersion;
        [JsonProperty("savedAt")]      public string savedAt = "";
    }

    [Serializable]
    public class SaveSlotsResponse
    {
        [JsonProperty("slots")] public List<SaveSlotRecord> slots = new();
    }

    [Serializable]
    public class SaveSlotSaveResponse
    {
        [JsonProperty("slot")] public SaveSlotRecord slot;
    }
}
