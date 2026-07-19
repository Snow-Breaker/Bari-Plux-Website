using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Serilog;

namespace BariPluxTool.Services
{
    public class DiscordNotificationService
    {
        private readonly string _webhookUrl;
        private readonly ILogger _logger;
        private readonly bool _enabled;
        private static readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(5) };

        public DiscordNotificationService(IConfiguration config, ILogger logger)
        {
            _webhookUrl = config["Notifications:DiscordWebhookUrl"] ?? string.Empty;
            _enabled = !string.IsNullOrEmpty(_webhookUrl);
            _logger = logger;
        }

        public async Task SendAsync(string title, string description, int color = 0x5865F2, Dictionary<string, string>? fields = null)
        {
            if (!_enabled)
            {
                _logger.Debug("Discord webhook disabled — webhook URL not configured");
                return;
            }

            try
            {
                var embed = new Dictionary<string, object?>
                {
                    ["title"] = title,
                    ["description"] = description,
                    ["color"] = color,
                    ["timestamp"] = DateTime.UtcNow.ToString("o")
                };

                if (fields != null && fields.Count > 0)
                {
                    var fieldList = new List<Dictionary<string, object>>();
                    foreach (var kvp in fields)
                    {
                        fieldList.Add(new Dictionary<string, object>
                        {
                            ["name"] = kvp.Key,
                            ["value"] = kvp.Value,
                            ["inline"] = false
                        });
                    }
                    embed["fields"] = fieldList;
                }

                var payload = new Dictionary<string, object?>
                {
                    ["embeds"] = new[] { embed }
                };

                var json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await _httpClient.PostAsync(_webhookUrl, content);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.Warning("Discord webhook returned {StatusCode}: {Body}",
                        response.StatusCode, await response.Content.ReadAsStringAsync());
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to send Discord webhook notification");
            }
        }

        public Task NotifyNewUserAsync(string email, string uid, string provider)
        {
            var fields = new Dictionary<string, string>
            {
                ["Email"] = email,
                ["User ID"] = uid,
                ["Provider"] = provider
            };
            return SendAsync("\U0001f464 New User Registered", "A new user has registered.", 0x57F287, fields);
        }

        public Task NotifyBugReportAsync(string reportId, string title, string description, string userEmail)
        {
            var fields = new Dictionary<string, string>
            {
                ["Report ID"] = reportId,
                ["Title"] = title,
                ["Description"] = description.Length > 1000 ? description[..1000] + "..." : description,
                ["User Email"] = userEmail
            };
            return SendAsync("\U0001f41b Bug Report Submitted", "A new bug report has been submitted.", 0xFEE75C, fields);
        }

        public Task NotifyCrashAsync(string exceptionType, string message, string stackTraceSummary)
        {
            var fields = new Dictionary<string, string>
            {
                ["Exception Type"] = exceptionType,
                ["Message"] = message,
                ["Stack Trace"] = stackTraceSummary.Length > 1000 ? stackTraceSummary[..1000] + "..." : stackTraceSummary
            };
            return SendAsync("\U0001f4a5 App Crash Detected", "An unhandled exception occurred.", 0xED4245, fields);
        }
    }
}
