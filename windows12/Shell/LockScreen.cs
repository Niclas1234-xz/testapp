using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Transformation;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Sperrbildschirm mit Uhr und Anmeldung (optional mit Kennwort).</summary>
public sealed class LockScreen : Panel
{
    readonly Border _wallpaper = new();
    readonly StackPanel _clockView;
    readonly StackPanel _loginView;
    readonly TextBlock _time;
    readonly TextBlock _date;
    readonly TextBlock _hint;
    readonly TextBlock _name;
    readonly ContentControl _avatar = new();
    readonly TextBox _password;
    readonly Button _signIn;
    readonly Grid _passwordRow;
    readonly TextBlock _error;
    bool _login;

    /// <summary>True, solange der Sperrbildschirm aktiv ist (auch während er noch ausgeblendet wird: false).</summary>
    public bool IsLocked { get; private set; }

    public LockScreen()
    {
        Background = Brushes.Black;
        Transitions = [new DoubleTransition { Property = OpacityProperty, Duration = TimeSpan.FromMilliseconds(350) }];
        RenderTransformOrigin = new RelativePoint(0.5, 0.5, RelativeUnit.Relative);

        _wallpaper.Transitions = [new EffectTransition { Property = EffectProperty, Duration = TimeSpan.FromMilliseconds(300) }];

        var white = Brushes.White;
        _time = new TextBlock { FontSize = 104, FontWeight = FontWeight.SemiBold, Foreground = white, HorizontalAlignment = HorizontalAlignment.Center };
        _date = new TextBlock { FontSize = 24, Foreground = white, HorizontalAlignment = HorizontalAlignment.Center };
        _clockView = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 90, 0, 0),
            Children = { _date, _time },
            Effect = new DropShadowEffect { BlurRadius = 20, OffsetX = 0, OffsetY = 2, Color = Colors.Black, Opacity = 0.5 },
        };
        _hint = new TextBlock
        {
            Text = "Klicken oder eine Taste drücken, um dich anzumelden",
            Foreground = white,
            Opacity = 0.85,
            FontSize = 14,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 0, 60),
        };

        // Anmeldung
        _name = new TextBlock { FontSize = 28, FontWeight = FontWeight.SemiBold, Foreground = white, HorizontalAlignment = HorizontalAlignment.Center };
        _password = new TextBox
        {
            PasswordChar = '•',
            PlaceholderText = "Kennwort",
            Width = 260,
            Height = 36,
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        _password.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter)
            {
                e.Handled = true;
                TryLogin();
            }
        };
        var go = new Button
        {
            Width = 36,
            Height = 36,
            Padding = new Thickness(0),
            Content = Icons.Glyph("arrow-right", 16, Brushes.White),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        go.Classes.Add("accent");
        go.Click += (_, _) => TryLogin();
        _passwordRow = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto"),
            HorizontalAlignment = HorizontalAlignment.Center,
            Children = { _password.Col(0), go.Margin(6, 0, 0, 0).Col(1) },
        };
        _signIn = new Button { Content = "Anmelden", Width = 160, Height = 36, HorizontalAlignment = HorizontalAlignment.Center, HorizontalContentAlignment = HorizontalAlignment.Center };
        _signIn.Classes.Add("accent");
        _signIn.Click += (_, _) => TryLogin();
        _error = new TextBlock { Foreground = new SolidColorBrush(Color.Parse("#FFB4B4")), HorizontalAlignment = HorizontalAlignment.Center, FontSize = 13 };

        _loginView = new StackPanel
        {
            Spacing = 16,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Children = { _avatar, _name, _passwordRow, _signIn, _error },
            IsVisible = false,
        };
        _avatar.HorizontalAlignment = HorizontalAlignment.Center;

        // Unten rechts: Netzwerk & Energie
        var power = new Button
        {
            Width = 40,
            Height = 40,
            Padding = new Thickness(0),
            Content = Icons.Glyph("power", 18, Brushes.White),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Background = Brushes.Transparent,
        };
        var shutdown = new MenuItem { Header = "Herunterfahren", Icon = Icons.Glyph("power", 14) };
        shutdown.Click += (_, _) => ShellWindow.Current.Shutdown(false);
        var restart = new MenuItem { Header = "Neu starten", Icon = Icons.Glyph("restart", 14) };
        restart.Click += (_, _) => ShellWindow.Current.Shutdown(true);
        power.Flyout = new MenuFlyout { ItemsSource = new[] { shutdown, restart } };
        var corner = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 28, 24),
            Children =
            {
                Icons.Glyph("wifi", 18, Brushes.White).VCenter(),
                Icons.Glyph("battery", 18, Brushes.White).VCenter().Margin(6, 0, 6, 0),
                power,
            },
        };

        Children.Add(_wallpaper);
        Children.Add(new Border { Background = new SolidColorBrush(Color.Parse("#33000000")) });
        Children.Add(_clockView);
        Children.Add(_hint);
        Children.Add(_loginView);
        Children.Add(corner);

        PointerPressed += (_, e) =>
        {
            if (!_login && e.Source is not Button)
            {
                ShowLogin();
                e.Handled = true;
            }
        };

        ShellWindow.Current.Tick += UpdateClock;
        UpdateClock();
    }

    public void UpdateWallpaper()
    {
        _wallpaper.Child = Appearance.CreateWallpaper(Sys.Settings.Wallpaper, Sys.Settings.WallpaperImage);
    }

    void UpdateClock()
    {
        if (!IsVisible) return;
        var now = DateTime.Now;
        _time.Text = Sys.FormatTime(now, false);
        _date.Text = now.ToString("dddd, d. MMMM", Sys.German);
    }

    /// <summary>Sperrbildschirm mit Uhr anzeigen.</summary>
    public void Show()
    {
        IsLocked = true;
        IsVisible = true;
        Opacity = 1;
        _login = false;
        _clockView.IsVisible = true;
        _hint.IsVisible = true;
        _loginView.IsVisible = false;
        _wallpaper.Effect = null;
        UpdateClock();
    }

    /// <summary>Direkt die Anmeldemaske anzeigen.</summary>
    public void ShowLogin()
    {
        IsLocked = true;
        IsVisible = true;
        Opacity = 1;
        _login = true;
        _clockView.IsVisible = false;
        _hint.IsVisible = false;
        _loginView.IsVisible = true;
        _wallpaper.Effect = new BlurEffect { Radius = 40 };
        _error.Text = "";
        _password.Text = "";

        var s = Sys.Settings;
        _avatar.Content = Icons.Avatar(s.UserName, s.AvatarColor, 120);
        _name.Text = s.UserName;
        _passwordRow.IsVisible = Sys.HasPassword;
        _signIn.IsVisible = !Sys.HasPassword;
        Dispatcher.UIThread.Post(() =>
        {
            if (Sys.HasPassword) _password.Focus();
            else _signIn.Focus();
        }, DispatcherPriority.Background);
    }

    public void HandleKey(KeyEventArgs e)
    {
        if (!_login)
        {
            ShowLogin();
            e.Handled = true;
        }
        else if (e.Key == Key.Escape)
        {
            Show();
            e.Handled = true;
        }
    }

    void TryLogin()
    {
        if (!Sys.CheckPassword(_password.Text ?? ""))
        {
            _error.Text = "Das Kennwort ist falsch. Versuche es erneut.";
            _password.Text = "";
            _password.Focus();
            return;
        }
        Unlock(animated: true);
        ShellWindow.Current.OnSignedIn();
    }

    public void Unlock(bool animated)
    {
        IsLocked = false;
        _login = false;
        if (!animated)
        {
            IsVisible = false;
            return;
        }
        Opacity = 0;
        DispatcherTimer.RunOnce(() =>
        {
            if (!IsLocked) IsVisible = false;
        }, TimeSpan.FromMilliseconds(360));
    }
}
