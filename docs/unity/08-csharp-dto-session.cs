#nullable enable
using System;
using System.Text.Json.Serialization;

namespace AiNativeSlg.Unity.Contracts.Session
{
    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum SessionAutonomyLevel
    {
        L1_assigned,
        L2_delegated,
        L3_negotiated,
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum SessionControlMode
    {
        human_assigned,
        ai_delegated,
        ai_negotiated,
    }

    [Serializable]
    public sealed class SessionJoinRequestDto
    {
        [JsonPropertyName("factionId")]
        public string FactionId { get; set; } = string.Empty;

        [JsonPropertyName("playerName")]
        public string PlayerName { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class SessionTokenRequestDto
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class SessionAutonomyRequestDto
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("level")]
        public SessionAutonomyLevel Level { get; set; }
    }

    [Serializable]
    public sealed class SessionJoinResponseDto
    {
        [JsonPropertyName("sessionId")]
        public string SessionId { get; set; } = string.Empty;

        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("factionId")]
        public string FactionId { get; set; } = string.Empty;

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }

    [Serializable]
    public sealed class SessionHeartbeatResponseDto
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }

    [Serializable]
    public sealed class SessionLeaveResponseDto
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }
    }

    [Serializable]
    public sealed class SessionStatusPlayerDto
    {
        [JsonPropertyName("sessionId")]
        public string SessionId { get; set; } = string.Empty;

        [JsonPropertyName("factionId")]
        public string FactionId { get; set; } = string.Empty;

        [JsonPropertyName("playerName")]
        public string PlayerName { get; set; } = string.Empty;

        [JsonPropertyName("online")]
        public bool Online { get; set; }

        [JsonPropertyName("autonomyLevel")]
        public SessionAutonomyLevel AutonomyLevel { get; set; }
    }

    [Serializable]
    public sealed class SessionStatusResponseDto
    {
        [JsonPropertyName("players")]
        public SessionStatusPlayerDto[] Players { get; set; } = Array.Empty<SessionStatusPlayerDto>();

        [JsonPropertyName("aiControlledFactions")]
        public string[] AiControlledFactions { get; set; } = Array.Empty<string>();
    }

    [Serializable]
    public sealed class SessionMetricsResponseDto
    {
        [JsonPropertyName("activeSessions")]
        public int ActiveSessions { get; set; }

        [JsonPropertyName("onlineSessions")]
        public int OnlineSessions { get; set; }

        [JsonPropertyName("delegatedSessions")]
        public int DelegatedSessions { get; set; }

        [JsonPropertyName("claimedFactions")]
        public int ClaimedFactions { get; set; }

        [JsonPropertyName("maxActiveSessions")]
        public int MaxActiveSessions { get; set; }

        [JsonPropertyName("heartbeatTimeoutMs")]
        public int HeartbeatTimeoutMs { get; set; }

        [JsonPropertyName("staleSessionTtlMs")]
        public int StaleSessionTtlMs { get; set; }

        [JsonPropertyName("maxPlayerNameLength")]
        public int MaxPlayerNameLength { get; set; }
    }

    [Serializable]
    public sealed class SessionRuntimeFactionDto
    {
        [JsonPropertyName("factionId")]
        public string FactionId { get; set; } = string.Empty;

        [JsonPropertyName("autonomyLevel")]
        public SessionAutonomyLevel AutonomyLevel { get; set; }

        [JsonPropertyName("controlMode")]
        public SessionControlMode ControlMode { get; set; }

        [JsonPropertyName("playerName")]
        public string? PlayerName { get; set; }

        [JsonPropertyName("online")]
        public bool Online { get; set; }

        [JsonPropertyName("doctrinePreview")]
        public string DoctrinePreview { get; set; } = string.Empty;

        [JsonPropertyName("doctrineUpdatedAt")]
        public string? DoctrineUpdatedAt { get; set; }

        [JsonPropertyName("hasModelConfig")]
        public bool HasModelConfig { get; set; }

        [JsonPropertyName("commanderModel")]
        public string? CommanderModel { get; set; }

        [JsonPropertyName("generalModel")]
        public string? GeneralModel { get; set; }

        [JsonPropertyName("unitModel")]
        public string? UnitModel { get; set; }
    }

    [Serializable]
    public sealed class SessionRuntimeResponseDto
    {
        [JsonPropertyName("tick")]
        public int Tick { get; set; }

        [JsonPropertyName("worldVersion")]
        public long WorldVersion { get; set; }

        [JsonPropertyName("factions")]
        public SessionRuntimeFactionDto[] Factions { get; set; } = Array.Empty<SessionRuntimeFactionDto>();
    }

    [Serializable]
    public sealed class SessionAutonomyResponseDto
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
