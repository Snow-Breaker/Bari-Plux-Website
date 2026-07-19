using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Threading;

namespace BariPluxTool.Services
{
    /// <summary>
    /// Keeps one app instance alive and delivers browser login callbacks to the running window.
    /// </summary>
    public static class AppInstanceService
    {
        private const string MutexName = "Global\\BariPluxTool_SingleInstance_v2";
        private const string PipeName = "BariPluxTool_Pipe_v2";
        private const string PendingLoginFileName = "pending_login.url";

        private static Mutex? _instanceMutex;
        private static Thread? _pipeThread;
        private static volatile bool _isPrimary;
        private static Action<string>? _messageHandler;

        public static bool IsPrimaryInstance => _isPrimary;

        [System.Runtime.InteropServices.DllImport("kernel32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
        private static extern IntPtr GetCommandLine();

        public static string? ExtractProtocolUrl(string[] args)
        {
            // First check normal args
            foreach (var arg in args)
            {
                if (string.IsNullOrWhiteSpace(arg))
                    continue;

                if (arg.StartsWith("baripluxtool://", StringComparison.OrdinalIgnoreCase) ||
                    arg.StartsWith("bptv2://", StringComparison.OrdinalIgnoreCase))
                    return arg;
            }

            // Fallback: parse raw Windows command line
            var cmdLinePtr = GetCommandLine();
            var cmdLine = System.Runtime.InteropServices.Marshal.PtrToStringAuto(cmdLinePtr) ?? string.Empty;

            var match = System.Text.RegularExpressions.Regex.Match(
                cmdLine, @"(baripluxtool://\S+|bptv2://\S+)");

            if (match.Success)
                return match.Value.Trim('"');

            return null;
        }

        /// <summary>Returns true if this process should continue startup as the main instance.</summary>
        public static bool TryBecomePrimaryInstance()
        {
            try
            {
                _instanceMutex = new Mutex(true, MutexName, out bool createdNew);
                _isPrimary = createdNew;
                return createdNew;
            }
            catch
            {
                _isPrimary = false;
                return false;
            }
        }

        public static void StartListening(Action<string> onMessage)
        {
            if (!_isPrimary)
                return;

            _messageHandler = onMessage;
            _pipeThread = new Thread(PipeServerLoop)
            {
                IsBackground = true,
                Name = "BariPluxTool_PipeServer"
            };
            _pipeThread.Start();
        }

        /// <summary>
        /// Forwards login to the running instance and asks it to come to the foreground.
        /// Returns true if delivery likely succeeded.
        /// </summary>
        public static bool ForwardLoginToRunningInstance(string protocolUrl)
        {
            WritePendingLogin(protocolUrl);

            var payload = "LOGIN|" + protocolUrl;
            if (TrySendPipeMessage(payload, attempts: 8, timeoutMs: 2500))
                return true;

            TrySendPipeMessage("ACTIVATE", attempts: 4, timeoutMs: 1500);
            return false;
        }

        public static void TryActivateRunningInstance()
        {
            TrySendPipeMessage("ACTIVATE", attempts: 4, timeoutMs: 1500);
        }

        public static string? ConsumePendingLogin()
        {
            try
            {
                var path = GetPendingLoginPath();
                if (!File.Exists(path))
                    return null;

                var url = File.ReadAllText(path, Encoding.UTF8).Trim();
                File.Delete(path);
                return string.IsNullOrWhiteSpace(url) ? null : url;
            }
            catch
            {
                return null;
            }
        }

        private static void WritePendingLogin(string url)
        {
            try
            {
                var path = GetPendingLoginPath();
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.WriteAllText(path, url, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[AppInstance] Pending login write failed: {ex.Message}");
            }
        }

        private static string GetPendingLoginPath()
        {
            var folder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "BariPluxTool");
            return Path.Combine(folder, PendingLoginFileName);
        }

        private static bool TrySendPipeMessage(string message, int attempts, int timeoutMs)
        {
            for (int i = 0; i < attempts; i++)
            {
                try
                {
                    using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
                    client.Connect(timeoutMs);
                    using var writer = new StreamWriter(client, Encoding.UTF8) { AutoFlush = true };
                    writer.WriteLine(message);
                    return true;
                }
                catch
                {
                    Thread.Sleep(150 + i * 50);
                }
            }

            return false;
        }

        private static void PipeServerLoop()
        {
            while (_isPrimary)
            {
                try
                {
                    using var server = new NamedPipeServerStream(
                        PipeName,
                        PipeDirection.In,
                        NamedPipeServerStream.MaxAllowedServerInstances,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous);

                    server.WaitForConnection();

                    using var reader = new StreamReader(server, Encoding.UTF8);
                    var line = reader.ReadLine();
                    if (string.IsNullOrWhiteSpace(line))
                        continue;

                    HandlePipeMessage(line.Trim());
                }
                catch
                {
                    Thread.Sleep(200);
                }
            }
        }

        private static void HandlePipeMessage(string message)
        {
            try
            {
                if (message == "ACTIVATE")
                {
                    Application.Current?.Dispatcher.BeginInvoke(ActivateMainWindow, DispatcherPriority.Normal);
                    return;
                }

                if (message.StartsWith("LOGIN|", StringComparison.Ordinal))
                {
                    var url = message["LOGIN|".Length..];
                    ClearPendingLoginFile();

                    Application.Current?.Dispatcher.BeginInvoke(() =>
                    {
                        _messageHandler?.Invoke(url);
                        ActivateMainWindow();
                    }, DispatcherPriority.Normal);
                    return;
                }

                if (message.Contains("://", StringComparison.Ordinal))
                {
                    Application.Current?.Dispatcher.BeginInvoke(() =>
                    {
                        _messageHandler?.Invoke(message);
                        ActivateMainWindow();
                    }, DispatcherPriority.Normal);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[AppInstance] Handle message error: {ex.Message}");
            }
        }

        private static void ActivateMainWindow()
        {
            if (Application.Current?.MainWindow is Window window)
                window.BringToFront();
        }

        private static void ClearPendingLoginFile()
        {
            try
            {
                var path = GetPendingLoginPath();
                if (File.Exists(path))
                    File.Delete(path);
            }
            catch { }
        }
    }
}
