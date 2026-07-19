using System;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;

namespace BariPluxTool.Controls
{
    public partial class LoginGateControl : UserControl
    {
        /// <summary>Opened in the user's default browser; ?desktop=1 triggers auto-return to the app.</summary>
        public const string LoginUrl = "https://bariplux.com/login1.html?desktop=1";

        public event EventHandler? SkipRequested;

        public LoginGateControl()
        {
            InitializeComponent();
        }

        public void Show(bool openBrowserImmediately = true)
        {
            Visibility = Visibility.Visible;
            IsHitTestVisible = true;
            Focus();
            StatusText.Text = "Waiting for browser sign-in…";

            if (openBrowserImmediately)
                OpenBrowser();
        }

        public void HideGate()
        {
            Visibility = Visibility.Collapsed;
            IsHitTestVisible = false;
        }

        public void SetWaitingStatus()
        {
            StatusText.Text = "Waiting for browser sign-in…";
        }

        public void SetSuccessStatus()
        {
            StatusText.Text = "Sign-in received. Welcome back!";
        }

        public void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = LoginUrl,
                    UseShellExecute = true
                });
                StatusText.Text = "Complete sign-in in your browser. This app will unlock when you are done.";
            }
            catch (Exception ex)
            {
                StatusText.Text = "Could not open browser: " + ex.Message;
                Debug.WriteLine($"[LoginGate] Browser open error: {ex.Message}");
            }
        }

        private void BtnOpenBrowser_Click(object sender, RoutedEventArgs e) => OpenBrowser();

        private void BtnSkipLogin_Click(object sender, RoutedEventArgs e)
        {
            SkipRequested?.Invoke(this, EventArgs.Empty);
        }
    }
}
