using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Schwebende Taskleiste mit Start, Task-Ansicht, angehefteten und laufenden Apps.</summary>
public sealed class Taskbar : Border
{
    readonly StackPanel _apps = new() { Orientation = Orientation.Horizontal, Spacing = 2 };
    readonly StackPanel _extras = new() { Orientation = Orientation.Horizontal, Spacing = 2 };
    readonly StackPanel _tray = new() { Orientation = Orientation.Horizontal, Spacing = 2, VerticalAlignment = VerticalAlignment.Center };

    public Taskbar()
    {
        var shell = ShellWindow.Current;
        Height = 54;
        VerticalAlignment = VerticalAlignment.Bottom;
        CornerRadius = new CornerRadius(14);
        BorderThickness = new Thickness(1);
        Padding = new Thickness(6, 0);
        BoxShadow = BoxShadows.Parse("0 8 30 0 #55000000");
        Transitions = [new ThicknessTransition { Property = MarginProperty, Duration = TimeSpan.FromMilliseconds(200) }];
        this.Res(BackgroundProperty, "W12.Bar").Res(BorderBrushProperty, "W12.PanelBorder");

        var start = TaskbarButton(Icons.Logo(24), () => shell.ToggleFlyout(shell.StartMenu), "Start");
        var taskView = TaskbarButton(Icons.Glyph("taskview", 22), shell.ToggleTaskView, "Task-Ansicht");

        Child = UI.H(2, start, _extras, taskView, Separator(), _apps, _tray).VCenter();

        ContextMenu = new ContextMenu
        {
            ItemsSource = new Control[]
            {
                MenuItem("Task-Manager", "taskmgr", () => shell.Launch("taskmgr")),
                MenuItem("Desktop anzeigen", "desktop", shell.WM.ToggleShowDesktop),
                new Separator(),
                MenuItem("Taskleisteneinstellungen", "settings", () => shell.Launch("settings", "personalisierung")),
            },
        };

        shell.WM.Changed += Refresh;
        Sys.Changed += what =>
        {
            if (what is "pinned" or "layout") Refresh();
        };
        Refresh();
    }

    static Border Separator() => new Border { Width = 1, Height = 26, Margin = new Thickness(6, 0) }
        .Res(BackgroundProperty, "W12.Divider");

    static MenuItem MenuItem(string header, string icon, Action click)
    {
        var item = new MenuItem { Header = header, Icon = Icons.Glyph(icon, 14) };
        item.Click += (_, _) => click();
        return item;
    }

    static Button TaskbarButton(Control content, Action click, string? tip)
    {
        var b = new Button
        {
            Content = content,
            Width = 46,
            Height = 44,
            Padding = new Thickness(0),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        b.Classes.Add("flat");
        b.Click += (_, _) => click();
        return b.Tip(tip);
    }

    public void UpdatePlacement()
    {
        var centered = Sys.Settings.TaskbarCentered;
        HorizontalAlignment = centered ? HorizontalAlignment.Center : HorizontalAlignment.Left;
        Margin = new Thickness(centered ? 0 : 8, 0, 0, 8);
    }

    /// <summary>Baut die App-Schaltflächen neu auf (angeheftet + laufend).</summary>
    public void Refresh()
    {
        var shell = ShellWindow.Current;
        var wm = shell.WM;
        var s = Sys.Settings;

        var ids = s.PinnedApps.Where(id => AppRegistry.Get(id) != null).ToList();
        foreach (var w in wm.OnCurrentDesktop)
            if (!ids.Contains(w.App.Id)) ids.Add(w.App.Id);

        _apps.Children.Clear();
        foreach (var id in ids)
            _apps.Children.Add(AppButton(AppRegistry.Get(id)!));

        // Ohne obere Leiste wandern Suche, Widgets, Systemsymbole und Uhr in die Taskleiste.
        if (!s.ShowTopBar && _extras.Children.Count == 0)
        {
            _extras.Children.Add(TaskbarButton(Icons.Glyph("search", 20), () => shell.StartMenu.OpenWithSearch(), "Suchen"));
            _extras.Children.Add(TaskbarButton(Icons.Glyph("widgets", 20), () => shell.ToggleFlyout(shell.Widgets), "Widgets"));
            _tray.Children.Add(Separator());
            _tray.Children.Add(_trayButtons ??= TopBar.CreateTray());
            _tray.Children.Add(_bellButton ??= TopBar.CreateBell());
            _tray.Children.Add(_clockButton ??= TopBar.CreateClock(twoLines: true));
        }
        else if (s.ShowTopBar && _extras.Children.Count > 0)
        {
            _extras.Children.Clear();
            _tray.Children.Clear();
        }
    }

    Button? _trayButtons, _bellButton, _clockButton;

    Button AppButton(AppInfo app)
    {
        var shell = ShellWindow.Current;
        var wm = shell.WM;
        var windows = wm.WindowsOf(app.Id).ToList();
        var isActive = wm.Active != null && wm.Active.App.Id == app.Id;

        var indicator = new Border
        {
            Height = 3,
            Width = isActive ? 16 : 6,
            CornerRadius = new CornerRadius(2),
            VerticalAlignment = VerticalAlignment.Bottom,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, 1),
            IsVisible = windows.Count > 0,
        }.Res(BackgroundProperty, isActive ? "W12.Accent" : "W12.SubText");

        var content = new Panel
        {
            Width = 46,
            Height = 44,
            Children = { Icons.Tile(app, 28).Center(), indicator },
        };

        var b = TaskbarButton(content, () => OnAppClicked(app), null);
        if (isActive) b.Classes.Add("selected");
        ToolTip.SetTip(b, windows.Count == 0 ? app.Name : string.Join("\n", windows.Select(w => w.Title)));

        var menu = new ContextMenu();
        menu.Opening += (_, _) =>
        {
            var items = new List<Control>
            {
                new MenuItem { Header = app.Name, IsEnabled = false, Icon = Icons.Tile(app, 16) },
                new Separator(),
            };
            if (!app.SingleInstance || windows.Count == 0)
                items.Add(MenuItem("Neues Fenster", "plus", () => shell.Launch(app.Id)));
            var pinned = Sys.Settings.PinnedApps.Contains(app.Id);
            items.Add(MenuItem(pinned ? "Von Taskleiste lösen" : "An Taskleiste anheften", "pin", () =>
                Sys.Set("pinned", st =>
                {
                    if (pinned) st.PinnedApps.Remove(app.Id);
                    else st.PinnedApps.Add(app.Id);
                })));
            if (windows.Count > 0)
                items.Add(MenuItem(windows.Count == 1 ? "Fenster schließen" : "Alle Fenster schließen", "close", () =>
                {
                    foreach (var w in wm.WindowsOf(app.Id).ToList()) wm.Close(w);
                }));
            menu.ItemsSource = items;
        };
        b.ContextMenu = menu;
        return b;
    }

    static void OnAppClicked(AppInfo app)
    {
        var shell = ShellWindow.Current;
        var wm = shell.WM;
        shell.CloseFlyouts();
        shell.HideTaskView();
        var windows = wm.WindowsOf(app.Id).OrderBy(w => w.OpenedAt).ToList();
        if (windows.Count == 0)
        {
            shell.Launch(app.Id);
            return;
        }

        var active = wm.Active;
        if (active != null && windows.Contains(active))
        {
            if (windows.Count == 1) wm.Minimize(active);
            else wm.Activate(windows[(windows.IndexOf(active) + 1) % windows.Count]);
            return;
        }
        wm.Activate(windows.MaxBy(w => w.IsMinimized ? -1 : w.ZIndex)!);
    }
}
