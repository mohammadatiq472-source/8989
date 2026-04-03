using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace SLGCommander.UnityBridge
{
    public static class AiConfigFactionConstraint
    {
        public const string HumanFactionId = "";
        public const string DefaultFactionId = "";

        public static bool IsHumanControlledFaction(string factionId)
        {
            return !string.IsNullOrWhiteSpace(factionId?.Trim());
        }
    }

    [Serializable]
    [JsonConverter(typeof(StringEnumConverter))]
    public enum AiRiskPreference
    {
        conservative,
        balanced,
        aggressive,
    }

    [Serializable]
    public sealed class AiModelRoleConfigDto
    {
        [JsonProperty("commander")]
        public string Commander = string.Empty;

        [JsonProperty("general")]
        public string General = string.Empty;

        [JsonProperty("unit")]
        public string Unit = string.Empty;
    }

    [Serializable]
    public sealed class AiHubConfigDto
    {
        [JsonProperty("automationEnabled")]
        public bool AutomationEnabled;

        [JsonProperty("plannerFrequency")]
        public int PlannerFrequency;

        [JsonProperty("riskPreference")]
        public AiRiskPreference RiskPreference = AiRiskPreference.balanced;

        [JsonProperty("doctrinePrompt")]
        public string DoctrinePrompt = string.Empty;

        [JsonProperty("models")]
        public AiModelRoleConfigDto Models = new();
    }

    [Serializable]
    public sealed class AiConfigResponseDto
    {
        [JsonProperty("config")]
        public AiHubConfigDto Config = new();

        [JsonProperty("updatedAt")]
        public string UpdatedAt = string.Empty;

        [JsonProperty("factionId")]
        public string FactionId = AiConfigFactionConstraint.DefaultFactionId;

        [JsonProperty("error")]
        public string Error;
    }

    [Serializable]
    public sealed class AiConfigUpdateRequestDto
    {
        [JsonProperty("factionId")]
        public string FactionId = AiConfigFactionConstraint.DefaultFactionId;

        [JsonProperty("config")]
        public AiHubConfigDto Config = new();
    }
}
