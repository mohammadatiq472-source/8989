#nullable enable
using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AiNativeSlg.Unity.Contracts.World
{
    // Match the backend /api/world action names exactly.
    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
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
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldPlanSource
    {
        mock,
        local,
        gateway,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldRegionPriority
    {
        low,
        medium,
        high,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldAllianceStance
    {
        hold,
        support,
        harass,
        expand,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldActionOrderType
    {
        march,
        garrison,
        recon,
        support,
        capture,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldExecutionEnqueueMode
    {
        replace,
        append,
        reject_if_active,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldCityTechTrackId
    {
        governance,
        logistics,
        defense,
        recruitment,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
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
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldCivilMemoryEventType
    {
        agenda_compiled,
        court_session_closed,
        court_resolution,
        execution_outcome,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldCivilExecutionOutcome
    {
        pending,
        success,
        failed,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldCivilResponsibilityRole
    {
        sponsor,
        voter_yes,
        voter_no,
        executor,
        observer,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum WorldCivilMemoryIntegrityAlgorithm
    {
        sha256,
    }

    [Serializable]
    public class WorldActionRequestDto<TPayload>
    {
        [JsonPropertyName("action")]
        public WorldActionType Action { get; set; }

        [JsonPropertyName("payload")]
        public TPayload? Payload { get; set; }
    }

    [Serializable]
    public sealed class WorldEmptyPayloadDto
    {
    }

    [Serializable]
    public sealed class WorldStructuredOrderDto
    {
        [JsonPropertyName("unitId")]
        public string UnitId { get; set; } = string.Empty;

        [JsonPropertyName("action")]
        public WorldActionOrderType Action { get; set; }

        [JsonPropertyName("target")]
        public string Target { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class WorldStrategicPlanDto
    {
        [JsonPropertyName("intent")]
        public string Intent { get; set; } = string.Empty;

        [JsonPropertyName("priority")]
        public WorldRegionPriority Priority { get; set; }

        [JsonPropertyName("orders")]
        public WorldStructuredOrderDto[] Orders { get; set; } = Array.Empty<WorldStructuredOrderDto>();

        [JsonPropertyName("constraints")]
        public string[] Constraints { get; set; } = Array.Empty<string>();

        [JsonPropertyName("reviewAfterTicks")]
        public int ReviewAfterTicks { get; set; }
    }

    [Serializable]
    public sealed class WorldGeneralDirectiveDto
    {
        [JsonPropertyName("generalId")]
        public string GeneralId { get; set; } = string.Empty;

        [JsonPropertyName("instruction")]
        public string Instruction { get; set; } = string.Empty;

        [JsonPropertyName("targetTileId")]
        public string? TargetTileId { get; set; }

        [JsonPropertyName("action")]
        public WorldActionOrderType? Action { get; set; }
    }

    [Serializable]
    public sealed class WorldAppendPlanningJobHistoryPayloadDto
    {
        [JsonPropertyName("entry")]
        public JsonElement Entry { get; set; }
    }

    [Serializable]
    public sealed class WorldQueuePlanExecutionPayloadDto
    {
        [JsonPropertyName("plan")]
        public WorldStrategicPlanDto Plan { get; set; } = new WorldStrategicPlanDto();

        [JsonPropertyName("source")]
        public WorldPlanSource Source { get; set; }

        [JsonPropertyName("strategicCommand")]
        public string StrategicCommand { get; set; } = string.Empty;

        [JsonPropertyName("requestId")]
        public string RequestId { get; set; } = string.Empty;

        [JsonPropertyName("basedOnWorldVersion")]
        public long BasedOnWorldVersion { get; set; }

        [JsonPropertyName("factionId")]
        public string? FactionId { get; set; }

        [JsonPropertyName("plannerNote")]
        public string? PlannerNote { get; set; }

        [JsonPropertyName("plannerExplanation")]
        public string? PlannerExplanation { get; set; }

        [JsonPropertyName("planningRationale")]
        public string[]? PlanningRationale { get; set; }

        [JsonPropertyName("dispatchGenerals")]
        public bool? DispatchGenerals { get; set; }

        [JsonPropertyName("generalConcurrency")]
        public int? GeneralConcurrency { get; set; }

        [JsonPropertyName("generalSide")]
        public string? GeneralSide { get; set; }

        [JsonPropertyName("generalDirectives")]
        public WorldGeneralDirectiveDto[]? GeneralDirectives { get; set; }

        [JsonPropertyName("executionMode")]
        public WorldExecutionEnqueueMode? ExecutionMode { get; set; }

        [JsonPropertyName("expectedExecutionRequestId")]
        public string? ExpectedExecutionRequestId { get; set; }
    }

    [Serializable]
    public sealed class WorldPreviewGeneralDirectivesPayloadDto
    {
        [JsonPropertyName("directives")]
        public WorldGeneralDirectiveDto[] Directives { get; set; } = Array.Empty<WorldGeneralDirectiveDto>();

        [JsonPropertyName("side")]
        public string? Side { get; set; }

        [JsonPropertyName("basePlan")]
        public WorldStrategicPlanDto? BasePlan { get; set; }
    }

    [Serializable]
    public sealed class WorldPreviewDomainAgendaPayloadDto
    {
        [JsonPropertyName("factionId")]
        public string? FactionId { get; set; }

        [JsonPropertyName("domainId")]
        public string? DomainId { get; set; }

        [JsonPropertyName("includeMessages")]
        public bool? IncludeMessages { get; set; }
    }

    [Serializable]
    public sealed class WorldPreviewNationalAgendaPayloadDto
    {
        [JsonPropertyName("maxOptions")]
        public int? MaxOptions { get; set; }
    }

    [Serializable]
    public sealed class WorldPreviewCourtSessionPayloadDto
    {
        [JsonPropertyName("maxProposals")]
        public int? MaxProposals { get; set; }

        [JsonPropertyName("maxOptions")]
        public int? MaxOptions { get; set; }
    }

    [Serializable]
    public sealed class WorldQueryCivilMemoryPayloadDto
    {
        [JsonPropertyName("limit")]
        public int? Limit { get; set; }

        [JsonPropertyName("type")]
        public WorldCivilMemoryEventType? Type { get; set; }

        [JsonPropertyName("tickFrom")]
        public int? TickFrom { get; set; }

        [JsonPropertyName("tickTo")]
        public int? TickTo { get; set; }
    }

    [Serializable]
    public sealed class WorldClearPlanExecutionPayloadDto
    {
        [JsonPropertyName("factionId")]
        public string? FactionId { get; set; }
    }

    [Serializable]
    public sealed class WorldMoveUnitPayloadDto
    {
        [JsonPropertyName("unitId")]
        public string UnitId { get; set; } = string.Empty;

        [JsonPropertyName("targetTileId")]
        public string TargetTileId { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class WorldDeployReserveHeroPayloadDto
    {
        [JsonPropertyName("factionId")]
        public string FactionId { get; set; } = string.Empty;

        [JsonPropertyName("heroId")]
        public string HeroId { get; set; } = string.Empty;

        [JsonPropertyName("tileId")]
        public string TileId { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class WorldUpgradeCityPayloadDto
    {
        [JsonPropertyName("tileId")]
        public string TileId { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class WorldUpgradeCityTechPayloadDto
    {
        [JsonPropertyName("tileId")]
        public string TileId { get; set; } = string.Empty;

        [JsonPropertyName("techId")]
        public WorldCityTechTrackId TechId { get; set; }
    }

    [Serializable]
    public sealed class WorldQueueTacticalOverridePayloadDto
    {
        [JsonPropertyName("unitId")]
        public string UnitId { get; set; } = string.Empty;

        [JsonPropertyName("templateId")]
        public WorldTacticalTemplateId TemplateId { get; set; }

        [JsonPropertyName("targetTileId")]
        public string TargetTileId { get; set; } = string.Empty;

        [JsonPropertyName("summary")]
        public string Summary { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class WorldUpdateAllianceDirectivePayloadDto
    {
        [JsonPropertyName("regionId")]
        public string RegionId { get; set; } = string.Empty;

        [JsonPropertyName("stance")]
        public WorldAllianceStance Stance { get; set; }
    }

    [Serializable]
    public sealed class WorldAdvanceTickRequestDto : WorldActionRequestDto<WorldEmptyPayloadDto>
    {
        public WorldAdvanceTickRequestDto()
        {
            Action = WorldActionType.advanceTick;
            Payload = new WorldEmptyPayloadDto();
        }
    }

    [Serializable]
    public sealed class WorldAppendPlanningJobHistoryRequestDto : WorldActionRequestDto<WorldAppendPlanningJobHistoryPayloadDto>
    {
        public WorldAppendPlanningJobHistoryRequestDto()
        {
            Action = WorldActionType.appendPlanningJobHistory;
        }
    }

    [Serializable]
    public sealed class WorldQueuePlanExecutionRequestDto : WorldActionRequestDto<WorldQueuePlanExecutionPayloadDto>
    {
        public WorldQueuePlanExecutionRequestDto()
        {
            Action = WorldActionType.queuePlanExecution;
        }
    }

    [Serializable]
    public sealed class WorldPreviewGeneralDirectivesRequestDto : WorldActionRequestDto<WorldPreviewGeneralDirectivesPayloadDto>
    {
        public WorldPreviewGeneralDirectivesRequestDto()
        {
            Action = WorldActionType.previewGeneralDirectives;
        }
    }

    [Serializable]
    public sealed class WorldPreviewDomainAgendaRequestDto : WorldActionRequestDto<WorldPreviewDomainAgendaPayloadDto>
    {
        public WorldPreviewDomainAgendaRequestDto()
        {
            Action = WorldActionType.previewDomainAgenda;
        }
    }

    [Serializable]
    public sealed class WorldPreviewNationalAgendaRequestDto : WorldActionRequestDto<WorldPreviewNationalAgendaPayloadDto>
    {
        public WorldPreviewNationalAgendaRequestDto()
        {
            Action = WorldActionType.previewNationalAgenda;
        }
    }

    [Serializable]
    public sealed class WorldPreviewCourtSessionRequestDto : WorldActionRequestDto<WorldPreviewCourtSessionPayloadDto>
    {
        public WorldPreviewCourtSessionRequestDto()
        {
            Action = WorldActionType.previewCourtSession;
        }
    }

    [Serializable]
    public sealed class WorldQueryCivilMemoryRequestDto : WorldActionRequestDto<WorldQueryCivilMemoryPayloadDto>
    {
        public WorldQueryCivilMemoryRequestDto()
        {
            Action = WorldActionType.queryCivilMemory;
        }
    }

    [Serializable]
    public sealed class WorldClearPlanExecutionRequestDto : WorldActionRequestDto<WorldClearPlanExecutionPayloadDto>
    {
        public WorldClearPlanExecutionRequestDto()
        {
            Action = WorldActionType.clearPlanExecution;
        }
    }

    [Serializable]
    public sealed class WorldMoveUnitRequestDto : WorldActionRequestDto<WorldMoveUnitPayloadDto>
    {
        public WorldMoveUnitRequestDto()
        {
            Action = WorldActionType.moveUnit;
        }
    }

    [Serializable]
    public sealed class WorldDeployReserveHeroRequestDto : WorldActionRequestDto<WorldDeployReserveHeroPayloadDto>
    {
        public WorldDeployReserveHeroRequestDto()
        {
            Action = WorldActionType.deployReserveHero;
        }
    }

    [Serializable]
    public sealed class WorldUpgradeCityRequestDto : WorldActionRequestDto<WorldUpgradeCityPayloadDto>
    {
        public WorldUpgradeCityRequestDto()
        {
            Action = WorldActionType.upgradeCity;
        }
    }

    [Serializable]
    public sealed class WorldUpgradeCityTechRequestDto : WorldActionRequestDto<WorldUpgradeCityTechPayloadDto>
    {
        public WorldUpgradeCityTechRequestDto()
        {
            Action = WorldActionType.upgradeCityTech;
        }
    }

    [Serializable]
    public sealed class WorldQueueTacticalOverrideRequestDto : WorldActionRequestDto<WorldQueueTacticalOverridePayloadDto>
    {
        public WorldQueueTacticalOverrideRequestDto()
        {
            Action = WorldActionType.queueTacticalOverride;
        }
    }

    [Serializable]
    public sealed class WorldUpdateAllianceDirectiveRequestDto : WorldActionRequestDto<WorldUpdateAllianceDirectivePayloadDto>
    {
        public WorldUpdateAllianceDirectiveRequestDto()
        {
            Action = WorldActionType.updateAllianceDirective;
        }
    }

    [Serializable]
    public sealed class WorldActionResponseDto
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("worldVersion")]
        public long WorldVersion { get; set; }

        [JsonPropertyName("tick")]
        public int Tick { get; set; }

        [JsonPropertyName("world")]
        public JsonElement? World { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("unitId")]
        public string? UnitId { get; set; }

        [JsonPropertyName("domainAgenda")]
        public JsonElement? DomainAgenda { get; set; }

        [JsonPropertyName("domainCommMetrics")]
        public JsonElement? DomainCommMetrics { get; set; }

        [JsonPropertyName("domainMessages")]
        public JsonElement[]? DomainMessages { get; set; }

        [JsonPropertyName("nationalAgenda")]
        public JsonElement? NationalAgenda { get; set; }

        [JsonPropertyName("courtSession")]
        public JsonElement? CourtSession { get; set; }

        [JsonPropertyName("civilMemoryEntries")]
        public JsonElement[]? CivilMemoryEntries { get; set; }
    }
}
