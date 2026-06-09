using System.Collections.Concurrent;
using Microsoft.Win32;

namespace BariPluxTool.Services
{
    public static class RegistryCache
    {
        private static readonly ConcurrentDictionary<string, object?> _cache = new(StringComparer.OrdinalIgnoreCase);

        public static object? GetValue(string valueName, object? defaultValue = null)
        {
            if (_cache.TryGetValue(valueName, out var cached))
                return cached;

            var value = Registry.CurrentUser.GetValue(valueName, defaultValue);
            _cache[valueName] = value;
            return value;
        }

        public static void SetValue(string valueName, object value)
        {
            _cache[valueName] = value;
            Registry.CurrentUser.SetValue(valueName, value);
        }

        public static void Invalidate(string valueName)
        {
            _cache.TryRemove(valueName, out _);
        }

        public static object? GetSubKeyValue(string keyName, string valueName, object? defaultValue = null)
        {
            var cacheKey = $"{keyName}\\{valueName}";
            if (_cache.TryGetValue(cacheKey, out var cached))
                return cached;

            using var key = Registry.CurrentUser.OpenSubKey(keyName);
            var value = key?.GetValue(valueName, defaultValue);
            _cache[cacheKey] = value;
            return value;
        }
    }
}
