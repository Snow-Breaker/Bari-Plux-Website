using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Serilog;

namespace BariPluxTool.Services
{
    public static class AppSettingsService
    {
        private static readonly ILogger _logger = Log.ForContext(typeof(AppSettingsService));

        public static readonly int[] UiZoomPresets = { 75, 85, 90, 100, 110, 125 };

        private static string SettingsFilePath => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "BPTV2",
            "settings.txt");

        public static string GetDefaultInstallPath()
        {
            return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        }

        public static string GetInstallPath()
        {
            var saved = ReadValue("InstallPath");
            if (!string.IsNullOrWhiteSpace(saved))
                return saved.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            return GetDefaultInstallPath();
        }

        public static void SetInstallPath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                RemoveValue("InstallPath");
            else
                WriteValue("InstallPath", path.Trim().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        }

        public static void ClearInstallPath() => RemoveValue("InstallPath");

        public static int GetUiZoomPercent()
        {
            var raw = ReadValue("UiZoomPercent");
            if (int.TryParse(raw, out int percent) && UiZoomPresets.Contains(percent))
                return percent;
            return 100;
        }

        public static void SetUiZoomPercent(int percent)
        {
            if (!UiZoomPresets.Contains(percent))
                percent = 100;
            WriteValue("UiZoomPercent", percent.ToString());
        }

        public static double GetUiZoomFactor() => GetUiZoomPercent() / 100.0;

        public static int GetUiZoomPresetIndex()
        {
            int percent = GetUiZoomPercent();
            int index = Array.IndexOf(UiZoomPresets, percent);
            return index >= 0 ? index : Array.IndexOf(UiZoomPresets, 100);
        }

        public static int GetPercentFromPresetIndex(int index)
        {
            if (index < 0) index = 0;
            if (index >= UiZoomPresets.Length) index = UiZoomPresets.Length - 1;
            return UiZoomPresets[index];
        }

        private static string? ReadValue(string key)
        {
            try
            {
                if (!File.Exists(SettingsFilePath))
                    return null;

                foreach (var line in File.ReadAllLines(SettingsFilePath))
                {
                    if (line.StartsWith(key + "=", StringComparison.Ordinal))
                        return line[(key.Length + 1)..];
                }
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to read settings value for key: {Key}", key);
            }

            return null;
        }

        private static void WriteValue(string key, string value)
        {
            try
            {
                var dir = Path.GetDirectoryName(SettingsFilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                var lines = File.Exists(SettingsFilePath)
                    ? File.ReadAllLines(SettingsFilePath).ToList()
                    : new List<string>();

                lines.RemoveAll(l => l.StartsWith(key + "=", StringComparison.Ordinal));
                lines.Add($"{key}={value}");
                File.WriteAllLines(SettingsFilePath, lines);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to write settings value for key: {Key}", key);
            }
        }

        private static void RemoveValue(string key)
        {
            try
            {
                if (!File.Exists(SettingsFilePath))
                    return;

                var lines = File.ReadAllLines(SettingsFilePath)
                    .Where(l => !l.StartsWith(key + "=", StringComparison.Ordinal))
                    .ToList();

                if (lines.Count == 0)
                    File.Delete(SettingsFilePath);
                else
                    File.WriteAllLines(SettingsFilePath, lines);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to remove settings value for key: {Key}", key);
            }
        }
    }
}
