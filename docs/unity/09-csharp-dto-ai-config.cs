#nullable enable
using System;
using System.Text.Json.Serialization;

namespace AiNativeSlg.Unity.Contracts.AiConfig
{
    /// <summary>
    /// Shared route contract for GET /api/ai/config and POST /api/ai/config.
    /// Unity uses runtime-injected faction ids. The UI should bind to the joined faction id.
    /// </summary>
    public static class AiConfigFactionConstraint
    {
        public const string HumanFactionId = "";

        public static bool IsHumanControlledFaction(string? factionId)
        {
            return !string.IsNullOrWhiteSpace(factionId?.Trim());
        }
    }

    [Serializable]
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum AiRiskPreference
    {
        conservative,
        balanced,
        aggressive,
    }

    [Serializable]
    public sealed class AiModelRoleConfigDto
    {
        [JsonPropertyName("commander")]
        public string Commander { get; set; } = string.Empty;

        [JsonPropertyName("general")]
        public string General { get; set; } = string.Empty;

        [JsonPropertyName("unit")]
        public string Unit { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class AiHubConfigDto
    {
        [JsonPropertyName("automationEnabled")]
        public bool AutomationEnabled { get; set; }

        [JsonPropertyName("plannerFrequency")]
        public int PlannerFrequency { get; set; }

        [JsonPropertyName("riskPreference")]
        public AiRiskPreference RiskPreference { get; set; }

        [JsonPropertyName("doctrinePrompt")]
        public string DoctrinePrompt { get; set; } = string.Empty;

        [JsonPropertyName("models")]
        public AiModelRoleConfigDto Models { get; set; } = new AiModelRoleConfigDto();
    }

    [Serializable]
    public sealed class AiConfigResponseDto
    {
        [JsonPropertyName("config")]
        public AiHubConfigDto Config { get; set; } = new AiHubConfigDto();

        [JsonPropertyName("updatedAt")]
        public string UpdatedAt { get; set; } = string.Empty;

        [JsonPropertyName("factionId")]
        public string FactionId { get; set; } = string.Empty;
    }

    [Serializable]
    public sealed class AiConfigUpdateRequestDto
    {
        [JsonPropertyName("config")]
        public AiHubConfigDto Config { get; set; } = new AiHubConfigDto();

        [JsonPropertyName("factionId")]
        public string? FactionId { get; set; }
    }
}
