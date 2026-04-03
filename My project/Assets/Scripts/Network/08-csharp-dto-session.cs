using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace SLGCommander.UnityBridge
{
    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum SessionAutonomyLevel
    {
        L1_assigned,
        L2_delegated,
        L3_negotiated,
    }

    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum SessionControlMode
    {
        human_assigned,
        ai_delegated,
        ai_negotiated,
    }

    [Serializable]
    public sealed class SessionJoinRequestDto
    {
        [JsonProperty("factionId")]
        public string FactionId = AiConfigFactionConstraint.HumanFactionId;

        [JsonProperty("playerName")]
        public string PlayerName = string.Empty;
    }

    [Serializable]
    public sealed class SessionTokenRequestDto
    {
        [JsonProperty("token")]
        public string Token = string.Empty;
    }

    [Serializable]
    public sealed class SessionAutonomyRequestDto
    {
        [JsonProperty("token")]
        public string Token = string.Empty;

        [JsonProperty("level")]
        public SessionAutonomyLevel Level = SessionAutonomyLevel.L1_assigned;
    }

    [Serializable]
    public sealed class SessionJoinResponseDto
    {
        [JsonProperty("sessionId")]
        public string SessionId = string.Empty;

        [JsonProperty("token")]
        public string Token = string.Empty;

        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("error")]
        public string Error;
    }

    [Serializable]
    public sealed class SessionHeartbeatResponseDto
    {
        [JsonProperty("ok")]
        public bool Ok;

        [JsonProperty("error")]
        public string Error;
    }

    [Serializable]
    public sealed class SessionLeaveResponseDto
    {
        [JsonProperty("ok")]
        public bool Ok;

        [JsonProperty("error")]
        public string Error;
    }

    [Serializable]
    public sealed class SessionStatusPlayerDto
    {
        [JsonProperty("sessionId")]
        public string SessionId = string.Empty;

        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("playerName")]
        public string PlayerName = string.Empty;

        [JsonProperty("lastHeartbeatAt")]
        public string LastHeartbeatAt = string.Empty;

        [JsonProperty("autonomyLevel")]
        public SessionAutonomyLevel AutonomyLevel = SessionAutonomyLevel.L1_assigned;
    }

    [Serializable]
    public sealed class SessionStatusResponseDto
    {
        [JsonProperty("players")]
        public List<SessionStatusPlayerDto> Players = new();

        [JsonProperty("aiControlledFactions")]
        public List<string> AiControlledFactions = new();
    }

    [Serializable]
    public sealed class SessionMetricsResponseDto
    {
        [JsonProperty("activeSessions")]
        public int ActiveSessions;

        [JsonProperty("onlinePlayers")]
        public int OnlinePlayers;

        [JsonProperty("autonomy")]
        public Dictionary<string, int> Autonomy = new();
    }

    [Serializable]
    public sealed class SessionRuntimeFactionDto
    {
        [JsonProperty("factionId")]
        public string FactionId = string.Empty;

        [JsonProperty("autonomyLevel")]
        public SessionAutonomyLevel AutonomyLevel = SessionAutonomyLevel.L1_assigned;

        [JsonProperty("controlMode")]
        public SessionControlMode ControlMode = SessionControlMode.human_assigned;

        [JsonProperty("playerName")]
        public string PlayerName;

        [JsonProperty("online")]
        public bool Online;

        [JsonProperty("doctrinePreview")]
        public string DoctrinePreview = string.Empty;

        [JsonProperty("doctrineUpdatedAt")]
        public string DoctrineUpdatedAt;

        [JsonProperty("hasModelConfig")]
        public bool HasModelConfig;

        [JsonProperty("commanderModel")]
        public string CommanderModel;

        [JsonProperty("generalModel")]
        public string GeneralModel;

        [JsonProperty("unitModel")]
        public string UnitModel;
    }

    [Serializable]
    public sealed class SessionRuntimeResponseDto
    {
        [JsonProperty("tick")]
        public int Tick;

        [JsonProperty("worldVersion")]
        public int WorldVersion;

        [JsonProperty("factions")]
        public List<SessionRuntimeFactionDto> Factions = new();
    }

    [Serializable]
    public sealed class SessionAutonomyResponseDto
    {
        [JsonProperty("ok")]
        public bool Ok;

        [JsonProperty("error")]
        public string Error;
    }
}
