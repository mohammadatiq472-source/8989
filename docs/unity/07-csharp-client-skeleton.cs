using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Slg.UnityClient
{
    /// <summary>
    /// Thin UnityWebRequest client for the Unity-first session and world APIs.
    /// </summary>
    public sealed class SlgApiClient : IDisposable
    {
        public string BaseUrl { get; }
        public int DefaultTimeoutSeconds { get; set; }

        public SlgApiClient(string baseUrl, int defaultTimeoutSeconds = 15)
        {
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                throw new ArgumentException("Base URL is required.", nameof(baseUrl));
            }

            BaseUrl = baseUrl.TrimEnd('/');
            DefaultTimeoutSeconds = Math.Max(1, defaultTimeoutSeconds);
        }

        public void Dispose()
        {
            // Stateless client; requests are disposed per call.
        }

        public Task<JoinResponse> JoinAsync(
            string factionId,
            string playerName,
            CancellationToken cancellationToken = default(CancellationToken),
            TimeSpan? timeout = null)
        {
            var request = new JoinRequest
            {
                factionId = factionId,
                playerName = playerName,
            };

            return PostJsonAsync<JoinResponse>("/api/session/join", request, cancellationToken, timeout);
        }

        public Task<HeartbeatResponse> HeartbeatAsync(
            string token,
            CancellationToken cancellationToken = default(CancellationToken),
            TimeSpan? timeout = null)
        {
            var request = new TokenRequest
            {
                token = token,
            };

            return PostJsonAsync<HeartbeatResponse>("/api/session/heartbeat", request, cancellationToken, timeout);
        }

        public Task<SessionRuntimeResponse> GetRuntimeAsync(
            CancellationToken cancellationToken = default(CancellationToken),
            TimeSpan? timeout = null)
        {
            return GetJsonAsync<SessionRuntimeResponse>("/api/session/runtime", cancellationToken, timeout);
        }

        public Task<SetAutonomyResponse> SetAutonomyAsync(
            string token,
            string level,
            CancellationToken cancellationToken = default(CancellationToken),
            TimeSpan? timeout = null)
        {
            var request = new SetAutonomyRequest
            {
                token = token,
                level = level,
            };

            return PostJsonAsync<SetAutonomyResponse>("/api/session/autonomy", request, cancellationToken, timeout);
        }

        /// <summary>
        /// Sends a world action envelope to /api/world/action.
        /// The payload must be a raw JSON object string because the server accepts
        /// multiple action-specific payload shapes.
        /// </summary>
        public Task<TResponse> WorldActionAsync<TResponse>(
            string action,
            string payloadJson = null,
            bool includeWorld = false,
            CancellationToken cancellationToken = default(CancellationToken),
            TimeSpan? timeout = null)
        {
            if (string.IsNullOrWhiteSpace(action))
            {
                throw new ArgumentException("Action is required.", nameof(action));
            }

            var body = BuildWorldActionBody(action, payloadJson);
            return PostRawJsonAsync<TResponse>("/api/world/action", body, includeWorld, cancellationToken, timeout);
        }

        public Task<string> WorldActionRawAsync(
            string action,
            string payloadJson = null,
            bool includeWorld = false,
            CancellationToken cancellationToken = default(CancellationToken),
            TimeSpan? timeout = null)
        {
            return WorldActionAsync<string>(action, payloadJson, includeWorld, cancellationToken, timeout);
        }

        private Task<TResponse> GetJsonAsync<TResponse>(
            string path,
            CancellationToken cancellationToken,
            TimeSpan? timeout)
        {
            var request = UnityWebRequest.Get(BuildUrl(path));
            return SendAndDeserializeAsync<TResponse>(request, cancellationToken, timeout);
        }

        private Task<TResponse> PostJsonAsync<TResponse>(
            string path,
            object body,
            CancellationToken cancellationToken,
            TimeSpan? timeout)
        {
            var json = JsonUtility.ToJson(body);
            return PostRawJsonAsync<TResponse>(path, json, false, cancellationToken, timeout);
        }

        private Task<TResponse> PostRawJsonAsync<TResponse>(
            string path,
            string jsonBody,
            bool includeWorld,
            CancellationToken cancellationToken,
            TimeSpan? timeout)
        {
            var url = BuildUrl(path, includeWorld);
            var request = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST);
            var payload = Encoding.UTF8.GetBytes(string.IsNullOrEmpty(jsonBody) ? "{}" : jsonBody);
            request.uploadHandler = new UploadHandlerRaw(payload);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("Accept", "application/json");

            return SendAndDeserializeAsync<TResponse>(request, cancellationToken, timeout);
        }

        private async Task<TResponse> SendAndDeserializeAsync<TResponse>(
            UnityWebRequest request,
            CancellationToken cancellationToken,
            TimeSpan? timeout)
        {
            var effectiveTimeout = ResolveTimeout(timeout);
            request.timeout = Math.Max(1, (int)Math.Ceiling(effectiveTimeout.TotalSeconds));

            CancellationTokenSource timeoutCts = null;
            if (effectiveTimeout > TimeSpan.Zero)
            {
                timeoutCts = new CancellationTokenSource(effectiveTimeout);
            }

            using (request)
            using (timeoutCts)
            using (var linkedCts = timeoutCts == null
                ? CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
                : CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token))
            using (linkedCts.Token.Register(() => request.Abort()))
            {
                var operation = request.SendWebRequest();
                while (!operation.isDone)
                {
                    linkedCts.Token.ThrowIfCancellationRequested();
                    await Task.Yield();
                }

                linkedCts.Token.ThrowIfCancellationRequested();

                var responseText = request.downloadHandler != null ? request.downloadHandler.text : string.Empty;
                if (request.result != UnityWebRequest.Result.Success)
                {
                    throw new UnityWebRequestApiException(
                        request.responseCode,
                        request.error,
                        responseText,
                        request.url);
                }

                if (typeof(TResponse) == typeof(string))
                {
                    return (TResponse)(object)responseText;
                }

                if (string.IsNullOrWhiteSpace(responseText))
                {
                    return default(TResponse);
                }

                try
                {
                    return JsonUtility.FromJson<TResponse>(responseText);
                }
                catch (Exception ex)
                {
                    throw new UnityWebRequestApiException(
                        request.responseCode,
                        "Failed to parse JSON response.",
                        responseText,
                        request.url,
                        ex);
                }
            }
        }

        private TimeSpan ResolveTimeout(TimeSpan? timeout)
        {
            var effectiveTimeout = timeout ?? TimeSpan.FromSeconds(DefaultTimeoutSeconds);
            if (effectiveTimeout <= TimeSpan.Zero)
            {
                effectiveTimeout = TimeSpan.FromSeconds(1);
            }

            return effectiveTimeout;
        }

        private string BuildUrl(string path, bool includeWorld = false)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("Path is required.", nameof(path));
            }

            var url = path.StartsWith("/") ? BaseUrl + path : BaseUrl + "/" + path;
            if (includeWorld)
            {
                url += path.IndexOf("?", StringComparison.Ordinal) < 0 ? "?includeWorld=true" : "&includeWorld=true";
            }

            return url;
        }

        private static string BuildWorldActionBody(string action, string payloadJson)
        {
            var builder = new StringBuilder();
            builder.Append('{');
            builder.Append("\"action\":");
            builder.Append(JsonString(action));

            if (!string.IsNullOrWhiteSpace(payloadJson))
            {
                builder.Append(',');
                builder.Append("\"payload\":");
                builder.Append(payloadJson);
            }

            builder.Append('}');
            return builder.ToString();
        }

        private static string JsonString(string value)
        {
            if (value == null)
            {
                return "null";
            }

            var escaped = new StringBuilder(value.Length + 8);
            escaped.Append('"');
            for (var i = 0; i < value.Length; i++)
            {
                var ch = value[i];
                switch (ch)
                {
                    case '\\':
                        escaped.Append("\\\\");
                        break;
                    case '"':
                        escaped.Append("\\\"");
                        break;
                    case '\b':
                        escaped.Append("\\b");
                        break;
                    case '\f':
                        escaped.Append("\\f");
                        break;
                    case '\n':
                        escaped.Append("\\n");
                        break;
                    case '\r':
                        escaped.Append("\\r");
                        break;
                    case '\t':
                        escaped.Append("\\t");
                        break;
                    default:
                        if (ch < 0x20)
                        {
                            escaped.Append("\\u");
                            escaped.Append(((int)ch).ToString("x4"));
                        }
                        else
                        {
                            escaped.Append(ch);
                        }
                        break;
                }
            }

            escaped.Append('"');
            return escaped.ToString();
        }
    }

    [Serializable]
    public sealed class JoinRequest
    {
        public string factionId;
        public string playerName;
    }

    [Serializable]
    public sealed class TokenRequest
    {
        public string token;
    }

    [Serializable]
    public sealed class SetAutonomyRequest
    {
        public string token;
        public string level;
    }

    [Serializable]
    public sealed class JoinResponse
    {
        public string sessionId;
        public string token;
        public string factionId;
        public string error;
    }

    [Serializable]
    public sealed class HeartbeatResponse
    {
        public bool ok;
        public string error;
    }

    [Serializable]
    public sealed class SetAutonomyResponse
    {
        public bool ok;
        public string error;
    }

    [Serializable]
    public sealed class SessionRuntimeResponse
    {
        public int tick;
        public int worldVersion;
        public RuntimeFactionInfo[] factions;
    }

    [Serializable]
    public sealed class RuntimeFactionInfo
    {
        public string factionId;
        public string autonomyLevel;
        public string controlMode;
        public string playerName;
        public bool online;
        public string doctrinePreview;
        public string doctrineUpdatedAt;
        public bool hasModelConfig;
        public string commanderModel;
        public string generalModel;
        public string unitModel;
    }

    public sealed class UnityWebRequestApiException : Exception
    {
        public long StatusCode { get; }
        public string ResponseBody { get; }
        public string RequestUrl { get; }

        public UnityWebRequestApiException(long statusCode, string message, string responseBody, string requestUrl)
            : base(BuildMessage(statusCode, message, requestUrl, responseBody))
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
            RequestUrl = requestUrl;
        }

        public UnityWebRequestApiException(long statusCode, string message, string responseBody, string requestUrl, Exception innerException)
            : base(BuildMessage(statusCode, message, requestUrl, responseBody), innerException)
        {
            StatusCode = statusCode;
            ResponseBody = responseBody;
            RequestUrl = requestUrl;
        }

        private static string BuildMessage(long statusCode, string message, string requestUrl, string responseBody)
        {
            return string.Format(
                "HTTP {0} for {1}: {2}. Body: {3}",
                statusCode,
                requestUrl ?? "<unknown>",
                message ?? "Request failed",
                string.IsNullOrWhiteSpace(responseBody) ? "<empty>" : responseBody);
        }
    }
}
