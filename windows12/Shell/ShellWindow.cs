using System.Collections.ObjectModel;
using System.Diagnostics;
using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Transformation;
using Avalonia.Threading;
using Windows12.Apps;
using Windows12.Core;

namespace Windows12.Shell;

public sealed record Notification(string Title, string Message, string? AppId, DateTime Time);

/// <summary>
/// Das Hauptfenster: enthält Hintergrund, Desktop, Fenster, Taskleiste, Flyouts,
/// Sperrbildschirm und Startbildschirm als übereinanderliegende Ebenen.
/// </summary>
public sealed class ShellWindow : Window
{
    public const double TopBarHeight = 36;
    public const double TaskbarReserve = 70;

    public static ShellWindow Current { get; private set; } = null!;

    readonly Border _wallpaperHost = new();
    readonly Canvas _windowLayer = new();
    readonly DesktopIcons _desktop;
    readonly TopBar _topBar;
    readonly Taskbar _taskbar;
    readonly Border _dismissLayer;
    readonly StackPanel _toasts;
    readonly Border _brightness;
    readonly Border _nightLight;
    readonly LockScreen _lock;
    readonly BootScreen _boot;
    readonly List<Flyout> _flyouts = [];
    readonly DispatcherTimer _clock;
    bool _allowClose;
    DateTime _lastAltF4;

    public WindowManager WM { get; }
    public DialogHost Dialogs { get; }
    public StartMenu StartMenu { get; }
    public QuickSettings QuickSettings { get; }
    public NotificationCenter NotificationCenter { get; }
    public WidgetsPanel Widgets { get; }
    public TaskView TaskView { get; }
    public ObservableCollection<Notification> Notifications { get; } = [];
    public bool IsLocked => _lock.IsLocked;

    /// <summary>Wird jede Sekunde ausgelöst (Uhren, Leistungsanzeigen).</summary>
    public event Action? Tick;

    public ShellWindow(bool windowed)
    {
        Current = this;
        Title = "Windows 12";
        Background = Brushes.Black;
        if (OperatingSystem.IsWindows())
            FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI");

        if (windowed)
        {
            Width = 1440;
            Height = 900;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
        }
        else
        {
            WindowDecorations = WindowDecorations.None;
            WindowState = WindowState.FullScreen;
        }

        WM = new WindowManager(_windowLayer);
        Dialogs = new DialogHost();
        _desktop = new DesktopIcons();
        _topBar = new TopBar();
        _taskbar = new Taskbar();
        StartMenu = new StartMenu();
        QuickSettings = new QuickSettings();
        NotificationCenter = new NotificationCenter();
        Widgets = new WidgetsPanel();
        TaskView = new TaskView();
        _lock = new LockScreen();
        _boot = new BootScreen();
        _flyouts.AddRange([StartMenu, QuickSettings, NotificationCenter, Widgets]);

        _dismissLayer = new Border { Background = Brushes.Transparent, IsVisible = false };
        _dismissLayer.PointerPressed += (_, _) => CloseFlyouts();

        _toasts = new StackPanel
        {
            Spacing = 8,
            Width = 370,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 12, TaskbarReserve + 4),
        };

        _brightness = new Border { Background = Brushes.Black, IsHitTestVisible = false };
        _nightLight = new Border { Background = new SolidColorBrush(Color.Parse("#FF8C00")), IsHitTestVisible = false };

        _wallpaperHost.PointerPressed += (_, _) => WM.Deactivate();

        Content = new Panel
        {
            Children =
            {
                _wallpaperHost,
                _desktop,
                _windowLayer,
                _dismissLayer,
                _topBar,
                _taskbar,
                StartMenu,
                QuickSettings,
                NotificationCenter,
                Widgets,
                TaskView,
                _toasts,
                Dialogs,
                _lock,
                _brightness,
                _nightLight,
                _boot,
            },
        };

        ApplyWallpaper();
        ApplyLayout();
        ApplyDisplay();
        Sys.Changed += OnSettingChanged;

        _clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _clock.Tick += (_, _) => Tick?.Invoke();
        _clock.Start();

        AddHandler(KeyDownEvent, OnKeyDown, RoutingStrategies.Tunnel);
        AddHandler(KeyUpEvent, OnKeyUp, RoutingStrategies.Tunnel);
        Closing += OnClosing;
        Opened += async (_, _) =>
        {
            // Ohne Fenstermanager (z. B. reines X11) greift Vollbild nicht – dann Bildschirm manuell füllen.
            if (!windowed && Screens.ScreenFromWindow(this) is { } screen)
            {
                Position = screen.Bounds.Position;
                Width = screen.Bounds.Width / screen.Scaling;
                Height = screen.Bounds.Height / screen.Scaling;
            }
            await BootAsync(Environment.GetCommandLineArgs().Contains("--autologin"));
        };
    }

    // ------------------------------------------------------------ Start / Herunterfahren

    async Task BootAsync(bool autoLogin)
    {
        Sys.BootTime = DateTime.Now;
        _lock.Show();
        if (autoLogin) _lock.Unlock(animated: false);
        await _boot.BootAsync();
        if (autoLogin) OnSignedIn();
    }

    /// <summary>Nach erfolgreicher Anmeldung.</summary>
    internal void OnSignedIn()
    {
        SampleContent.EnsurePictures();
        if (Notifications.Count == 0)
            Notify("Willkommen bei Windows 12", $"Schön, dass du da bist, {Sys.Settings.UserName}! Klicke auf das Logo unten, um loszulegen.", "winver");
    }

    public void Lock()
    {
        CloseFlyouts();
        HideTaskView();
        _lock.Show();
    }

    public async void SignOut()
    {
        CloseFlyouts();
        HideTaskView();
        if (!await WM.CloseAllAsync()) return;
        await _boot.ShowMessageAsync("Abmelden", 1200);
        Notifications.Clear();
        _lock.ShowLogin();
        _boot.Hide();
    }

    public async void Shutdown(bool restart)
    {
        CloseFlyouts();
        HideTaskView();
        if (!await WM.CloseAllAsync()) return;
        await _boot.ShowMessageAsync(restart ? "Wird neu gestartet" : "Wird heruntergefahren", 1800);
        if (restart)
        {
            Notifications.Clear();
            await BootAsync(autoLogin: false);
        }
        else
        {
            _allowClose = true;
            if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop) desktop.Shutdown();
            else Close();
        }
    }

    /// <summary>Dialog „Was soll der Computer tun?“ (Alt+F4 auf dem Desktop).</summary>
    public async void ShowPowerDialog()
    {
        var choice = await Dialogs.MessageAsync("Windows 12 beenden",
            "Was soll der Computer tun?", "Herunterfahren", "Neu starten", "Abmelden", "Abbrechen");
        switch (choice)
        {
            case "Herunterfahren": Shutdown(false); break;
            case "Neu starten": Shutdown(true); break;
            case "Abmelden": SignOut(); break;
        }
    }

    void OnClosing(object? sender, WindowClosingEventArgs e)
    {
        // Echtes Herunterfahren/Abmelden des Systems nie blockieren.
        if (_allowClose || e.CloseReason == WindowCloseReason.OSShutdown) return;
        e.Cancel = true;
        if ((DateTime.Now - _lastAltF4).TotalMilliseconds < 400) return; // bereits per Tastendruck behandelt
        if (WM.Active != null) WM.Close(WM.Active);
        else ShowPowerDialog();
    }

    // ------------------------------------------------------------ Apps & Dateien

    /// <summary>Startet eine App (bei Einzelinstanz-Apps wird das vorhandene Fenster aktiviert).</summary>
    public AppWindow? Launch(string appId, string? argument = null)
    {
        var app = AppRegistry.Get(appId);
        if (app == null) return null;
        CloseFlyouts();
        HideTaskView();

        if (app.SingleInstance && WM.Windows.FirstOrDefault(w => w.App.Id == appId) is { } existing)
        {
            WM.Activate(existing);
            existing.View.OnArgument(argument);
            return existing;
        }

        try
        {
            return WM.Open(app, app.Create(argument));
        }
        catch (Exception ex)
        {
            Notify(app.Name, $"Die App konnte nicht gestartet werden: {ex.Message}", app.Id);
            return null;
        }
    }

    /// <summary>Öffnet eine Datei oder einen Ordner mit der passenden App.</summary>
    public void OpenPath(string path)
    {
        if (path == ExplorerPaths.ThisPc || Directory.Exists(path))
        {
            Launch("explorer", path);
            return;
        }
        if (!File.Exists(path))
        {
            _ = Dialogs.MessageAsync("Nicht gefunden", $"„{path}“ wurde nicht gefunden.", "OK");
            return;
        }

        Sys.AddRecentFile(path);
        if (AppRegistry.ForFile(path) is { } app)
        {
            Launch(app.Id, path);
            return;
        }

        try
        {
            // Unbekannter Dateityp → an das echte Betriebssystem weitergeben.
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            _ = Dialogs.MessageAsync("Datei öffnen", $"Für „{Path.GetFileName(path)}“ ist keine App installiert.\n\n{ex.Message}", "OK");
        }
    }

    /// <summary>Dialog „Ausführen“ (Strg+Alt+R).</summary>
    public async void ShowRunDialog()
    {
        var input = await Dialogs.PromptAsync("Ausführen",
            "Gib den Namen eines Programms, Ordners oder Dokuments ein.", "", "OK");
        if (string.IsNullOrWhiteSpace(input)) return;
        input = input.Trim();

        var app = AppRegistry.All.FirstOrDefault(a =>
            a.Id.Equals(input, StringComparison.OrdinalIgnoreCase) || a.Name.Equals(input, StringComparison.OrdinalIgnoreCase));
        if (app != null) { Launch(app.Id); return; }
        if (input is "cmd" or "powershell" or "bash") { Launch("terminal"); return; }
        if (File.Exists(input) || Directory.Exists(input)) { OpenPath(input); return; }

        try
        {
            Process.Start(new ProcessStartInfo(input) { UseShellExecute = true });
        }
        catch
        {
            await Dialogs.MessageAsync("Ausführen", $"„{input}“ wurde nicht gefunden. Vergewissere dich, dass der Name richtig geschrieben ist.", "OK");
        }
    }

    // ------------------------------------------------------------ Benachrichtigungen

    public void Notify(string title, string message, string? appId = null)
    {
        var n = new Notification(title, message, appId, DateTime.Now);
        Notifications.Insert(0, n);
        if (Sys.Settings.DoNotDisturb || _lock.IsLocked) return;
        ShowToast(n);
    }

    void ShowToast(Notification n)
    {
        var app = n.AppId != null ? AppRegistry.Get(n.AppId) : null;
        Border? toast = null;
        var close = UI.IconButton("close", () => RemoveToast(toast!), "Schließen", 12, 26);
        close.VerticalAlignment = VerticalAlignment.Top;

        var body = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Children =
            {
                (app != null ? Icons.Tile(app, 32) : Icons.Logo(28)).Margin(0, 2, 12, 0).Col(0),
                UI.V(3, UI.Text(n.Title, 14, FontWeight.SemiBold), UI.Sub(n.Message, 13, wrap: true)).Col(1),
                close.Col(2),
            },
        };
        toast = new Border
        {
            Child = body,
            Padding = new Thickness(16, 14, 8, 14),
            CornerRadius = new CornerRadius(10),
            BorderThickness = new Thickness(1),
            BoxShadow = BoxShadows.Parse("0 8 28 0 #55000000"),
            Opacity = 0,
            RenderTransform = TransformOperations.Parse("translateX(380px)"),
            Transitions =
            [
                new DoubleTransition { Property = OpacityProperty, Duration = TimeSpan.FromMilliseconds(220) },
                new TransformOperationsTransition { Property = RenderTransformProperty, Duration = TimeSpan.FromMilliseconds(260), Easing = new Avalonia.Animation.Easings.CubicEaseOut() },
            ],
            Cursor = new Cursor(StandardCursorType.Hand),
        }.Res(Border.BackgroundProperty, "W12.Glass").Res(Border.BorderBrushProperty, "W12.PanelBorder");

        toast.PointerPressed += (_, e) =>
        {
            if (e.Handled) return;
            RemoveToast(toast);
            if (n.AppId != null) Launch(n.AppId);
        };

        _toasts.Children.Add(toast);
        while (_toasts.Children.Count > 3) _toasts.Children.RemoveAt(0);
        Dispatcher.UIThread.Post(() =>
        {
            toast.Opacity = 1;
            toast.RenderTransform = TransformOperations.Parse("translateX(0px)");
        }, DispatcherPriority.Background);
        DispatcherTimer.RunOnce(() => RemoveToast(toast), TimeSpan.FromSeconds(6));
    }

    void RemoveToast(Border toast)
    {
        if (!_toasts.Children.Contains(toast)) return;
        toast.Opacity = 0;
        toast.RenderTransform = TransformOperations.Parse("translateX(380px)");
        DispatcherTimer.RunOnce(() => _toasts.Children.Remove(toast), TimeSpan.FromMilliseconds(260));
    }

    // ------------------------------------------------------------ Flyouts

    public void ToggleFlyout(Flyout flyout)
    {
        var wasOpen = flyout.IsOpen;
        CloseFlyouts();
        HideTaskView();
        if (wasOpen) return;
        flyout.Open();
        _dismissLayer.IsVisible = true;
    }

    public void CloseFlyouts()
    {
        foreach (var f in _flyouts.Where(f => f.IsOpen)) f.Close();
        _dismissLayer.IsVisible = false;
    }

    public void ToggleTaskView()
    {
        CloseFlyouts();
        if (TaskView.IsOpen) TaskView.Close();
        else TaskView.Open();
    }

    public void HideTaskView()
    {
        if (TaskView.IsOpen) TaskView.Close();
    }

    // ------------------------------------------------------------ Einstellungen anwenden

    void OnSettingChanged(string what)
    {
        switch (what)
        {
            case "theme":
                Appearance.Apply();
                break;
            case "wallpaper":
                ApplyWallpaper();
                break;
            case "display":
                ApplyDisplay();
                break;
            case "layout":
                ApplyLayout();
                break;
        }
    }

    void ApplyWallpaper()
    {
        _wallpaperHost.Child = Appearance.CreateWallpaper(Sys.Settings.Wallpaper, Sys.Settings.WallpaperImage);
        _lock.UpdateWallpaper();
    }

    void ApplyLayout()
    {
        var top = Sys.Settings.ShowTopBar ? TopBarHeight : 0;
        _topBar.IsVisible = Sys.Settings.ShowTopBar;
        _windowLayer.Margin = new Thickness(0, top, 0, TaskbarReserve);
        _desktop.Margin = new Thickness(0, top, 0, TaskbarReserve);
        foreach (var f in _flyouts) f.UpdatePlacement();
        _taskbar.UpdatePlacement();
    }

    void ApplyDisplay()
    {
        var s = Sys.Settings;
        _brightness.Opacity = Math.Clamp((1 - s.Brightness) * 0.75, 0, 0.75);
        _nightLight.Opacity = s.NightLight ? 0.13 : 0;
    }

    // ------------------------------------------------------------ Tastatur

    void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (_boot.IsVisible)
        {
            e.Handled = true;
            return;
        }
        if (_lock.IsLocked)
        {
            _lock.HandleKey(e);
            return;
        }
        if (Dialogs.IsOpen) return;

        var ctrl = e.KeyModifiers.HasFlag(KeyModifiers.Control);
        var alt = e.KeyModifiers.HasFlag(KeyModifiers.Alt);
        var shift = e.KeyModifiers.HasFlag(KeyModifiers.Shift);

        void Do(Action a)
        {
            e.Handled = true;
            a();
        }

        switch (e.Key)
        {
            case Key.Escape when ctrl && shift: Do(() => Launch("taskmgr")); break;
            case Key.Escape when ctrl: Do(() => ToggleFlyout(StartMenu)); break;
            case Key.Escape when _flyouts.Any(f => f.IsOpen): Do(CloseFlyouts); break;
            case Key.Escape when TaskView.IsOpen: Do(HideTaskView); break;
            case Key.Tab when ctrl: Do(ToggleTaskView); break;
            case Key.Tab when alt: Do(SwitchToNextWindow); break;
            case Key.F4 when alt:
                _lastAltF4 = DateTime.Now;
                Do(() =>
                {
                    if (WM.Active != null) WM.Close(WM.Active);
                    else ShowPowerDialog();
                });
                break;
            case Key.T when ctrl && alt: Do(() => Launch("terminal")); break;
            case Key.E when ctrl && alt: Do(() => Launch("explorer")); break;
            case Key.L when ctrl && alt: Do(Lock); break;
            case Key.D when ctrl && alt: Do(WM.ToggleShowDesktop); break;
            case Key.R when ctrl && alt: Do(ShowRunDialog); break;
            case Key.I when ctrl && alt: Do(() => Launch("settings")); break;
            case Key.Left when ctrl && alt: Do(() => WM.SwitchDesktop(WM.CurrentDesktop - 1)); break;
            case Key.Right when ctrl && alt: Do(() => WM.SwitchDesktop(WM.CurrentDesktop + 1)); break;
            case Key.Up when ctrl && alt && WM.Active != null: Do(() => WM.Active!.SetSnap(SnapMode.Maximized)); break;
            case Key.Down when ctrl && alt && WM.Active != null: Do(() => WM.Minimize(WM.Active!)); break;
        }
    }

    void OnKeyUp(object? sender, KeyEventArgs e)
    {
        if ((e.Key is Key.LWin or Key.RWin) && !_lock.IsLocked && !_boot.IsVisible)
        {
            e.Handled = true;
            ToggleFlyout(StartMenu);
        }
    }

    void SwitchToNextWindow()
    {
        var ordered = WM.OnCurrentDesktop.OrderByDescending(w => w.IsMinimized ? -1 : w.ZIndex).ToList();
        if (ordered.Count < 2) return;
        WM.Activate(ordered[1]);
    }
}
