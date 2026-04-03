using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Linq;

namespace SLGCommander.UnityBridge
{
    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum WorldActionType
    {
        appendPlanningJobHistory,
        queuePlanExecution,
        previewGeneralDirectives,
        previewDomainAgenda,
        previewNationalAgenda,
        previewCourtSession,
        queryCivilMemory,
        advanceTick,
        clearPlanExecution,
        moveUnit,
        deployReserveHero,
        upgradeCity,
        upgradeCityTech,
        queueTacticalOverride,
        updateAllianceDirective,
    }

    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum WorldPlanSource
    {
        mock,
        local,
        gateway,
    }

    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum WorldActionOrderType
    {
        march,
        garrison,
        recon,
        support,
        capture,
    }

    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum WorldExecutionEnqueueMode
    {
        replace,
        append,
        reject_if_active,
    }

    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum WorldCityTechTrackId
    {
        governance,
        logistics,
        defense,
        recruitment,
    }

    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum WorldTacticalTemplateId
    {
        rally,
        harass,
        withdraw,
        breakthrough,
        sweep,
        garrison,
    }

    [Serializable]
    public sealed class WorldActionRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action;

        [JsonProperty("payload")]
        public object Payload;
    }

    [Serializable]
    public sealed class WorldEmptyPayloadDto
    {
    }

    [Serializable]
    public sealed class WorldStructuredOrderDto
    {
        [JsonProperty("unitId")]
        public string UnitId = string.Empty;

        [JsonProperty("action")]
        public WorldActionOrderType Action;

        [JsonProperty("target")]
        public string Target = string.Empty;
    }

    [Serializable]
    public sealed class WorldStrategicPlanDto
    {
        [JsonProperty("intent")]
        public string Intent = string.Empty;

        [JsonProperty("priority")]
        public string Priority = "medium";

        [JsonProperty("orders")]
        public List<WorldStructuredOrderDto> Orders = new();

        [JsonProperty("constraints")]
        public List<string> Constraints = new();

        [JsonProperty("reviewAfterTicks")]
        public int ReviewAfterTicks;
    }

    [Serializable]
    public sealed class WorldGeneralDirectiveDto
    {
        [JsonProperty("generalId")]
        public string GeneralId = string.Empty;

        [JsonProperty("instruction")]
        public string Instruction = string.Empty;

        [JsonProperty("targetTileId")]
        public string TargetTileId = string.Empty;

        [JsonProperty("action")]
        public string Action = string.Empty;
    }

    [Serializable]
    public sealed class WorldQueuePlanExecutionPayloadDto
    {
        [JsonProperty("plan")]
        public WorldStrategicPlanDto Plan = new();

        [JsonProperty("source")]
        public WorldPlanSource Source = WorldPlanSource.mock;

        [JsonProperty("requestId")]
        public string RequestId = string.Empty;

        [JsonProperty("strategicCommand")]
        public string StrategicCommand = string.Empty;

        [JsonProperty("basedOnWorldVersion")]
        public int BasedOnWorldVersion;

        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("plannerNote")]
        public string PlannerNote;

        [JsonProperty("plannerExplanation")]
        public string PlannerExplanation;

        [JsonProperty("planningRationale")]
        public List<string> PlanningRationale = new();

        [JsonProperty("dispatchGenerals")]
        public bool? DispatchGenerals;

        [JsonProperty("generalConcurrency")]
        public int? GeneralConcurrency;

        [JsonProperty("generalSide")]
        public string GeneralSide;

        [JsonProperty("generalDirectives")]
        public List<WorldGeneralDirectiveDto> GeneralDirectives = new();

        [JsonProperty("executionMode")]
        public WorldExecutionEnqueueMode? ExecutionMode;

        [JsonProperty("expectedExecutionRequestId")]
        public string ExpectedExecutionRequestId;
    }

    [Serializable]
    public sealed class WorldMoveUnitPayloadDto
    {
        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("unitId")]
        public string UnitId = string.Empty;

        [JsonProperty("targetTileId")]
        public string TargetTileId = string.Empty;
    }

    [Serializable]
    public sealed class WorldDeployReserveHeroPayloadDto
    {
        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("heroId")]
        public string HeroId = string.Empty;

        [JsonProperty("tileId")]
        public string TileId = string.Empty;
    }

    [Serializable]
    public sealed class WorldUpgradeCityPayloadDto
    {
        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("tileId")]
        public string TileId = string.Empty;
    }

    [Serializable]
    public sealed class WorldUpgradeCityTechPayloadDto
    {
        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("tileId")]
        public string TileId = string.Empty;

        [JsonProperty("techId")]
        public WorldCityTechTrackId TechId;
    }

    [Serializable]
    public sealed class WorldQueueTacticalOverridePayloadDto
    {
        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("unitId")]
        public string UnitId = string.Empty;

        [JsonProperty("templateId")]
        public WorldTacticalTemplateId TemplateId;

        [JsonProperty("targetTileId")]
        public string TargetTileId = string.Empty;

        [JsonProperty("summary")]
        public string Summary = string.Empty;
    }

    [Serializable]
    public sealed class WorldUpdateAllianceDirectivePayloadDto
    {
        [JsonProperty("regionId")]
        public string RegionId = string.Empty;

        [JsonProperty("stance")]
        public string Stance = string.Empty;
    }

    [Serializable]
    public sealed class WorldClearPlanExecutionPayloadDto
    {
        [JsonProperty("factionId")]
        public string FactionId = string.Empty;
    }

    [Serializable]
    public sealed class WorldAdvanceTickRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.advanceTick;

        [JsonProperty("payload")]
        public WorldEmptyPayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldQueuePlanExecutionRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.queuePlanExecution;

        [JsonProperty("payload")]
        public WorldQueuePlanExecutionPayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldMoveUnitRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.moveUnit;

        [JsonProperty("payload")]
        public WorldMoveUnitPayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldClearPlanExecutionRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.clearPlanExecution;

        [JsonProperty("payload")]
        public WorldClearPlanExecutionPayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldDeployReserveHeroRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.deployReserveHero;

        [JsonProperty("payload")]
        public WorldDeployReserveHeroPayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldUpgradeCityRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.upgradeCity;

        [JsonProperty("payload")]
        public WorldUpgradeCityPayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldUpgradeCityTechRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.upgradeCityTech;

        [JsonProperty("payload")]
        public WorldUpgradeCityTechPayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldQueueTacticalOverrideRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.queueTacticalOverride;

        [JsonProperty("payload")]
        public WorldQueueTacticalOverridePayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldUpdateAllianceDirectiveRequestDto
    {
        [JsonProperty("action")]
        public WorldActionType Action = WorldActionType.updateAllianceDirective;

        [JsonProperty("payload")]
        public WorldUpdateAllianceDirectivePayloadDto Payload = new();
    }

    [Serializable]
    public sealed class WorldActionResponseDto
    {
        [JsonProperty("ok")]
        public bool Ok;

        [JsonProperty("tick")]
        public int Tick;

        [JsonProperty("worldVersion")]
        public int WorldVersion;

        [JsonProperty("message")]
        public string Message = string.Empty;

        [JsonProperty("unitId")]
        public string UnitId;

        [JsonProperty("world")]
        public JToken World;

        [JsonProperty("domainAgenda")]
        public JToken DomainAgenda;

        [JsonProperty("domainMessages")]
        public JToken DomainMessages;

        [JsonProperty("courtSession")]
        public JToken CourtSession;

        [JsonProperty("civilMemory")]
        public JToken CivilMemory;
    }
}
