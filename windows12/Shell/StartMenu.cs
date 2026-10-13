using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Startmenü: Suche, angeheftete Apps, alle Apps, zuletzt verwendete Dateien, Benutzer & Energie.</summary>
public sealed class StartMenu : Flyout
{
    readonly TextBox _search;
    readonly ContentControl _body = new();
    readonly ContentControl _footerUser = new();
    bool _showAllApps;
    Action? _firstResult;

    static readonly (string Name, string Page, string Keywords)[] SettingsPages =
    [
        ("Hintergrund ändern", "personalisierung", "wallpaper hintergrundbild desktop"),
        ("Dunkelmodus / Hellmodus", "personalisierung", "dunkel hell farbe theme design"),
        ("Akzentfarbe", "personalisierung", "farbe akzent"),
        ("Taskleiste", "personalisierung", "taskleiste ausrichtung"),
        ("Anzeige & Helligkeit", "system", "bildschirm helligkeit nachtmodus"),
        ("Sound & Lautstärke", "system", "ton audio lautstärke"),
        ("WLAN & Netzwerk", "netzwerk", "internet wifi wlan bluetooth flugmodus"),
        ("Konto & Kennwort", "konten", "benutzer passwort kennwort name"),
        ("Datum & Uhrzeit", "zeit", "uhr zeit datum format"),
        ("Windows Update", "update", "update aktualisieren"),
        ("Info über dieses Gerät", "info", "system info pc hardware"),
    ];

    public StartMenu() : base(660)
    {
        Height = 700;
        VerticalAlignment = VerticalAlignment.Bottom;

        _search = new TextBox
        {
            PlaceholderText = "Apps, Einstellungen und Dateien suchen",
            Height = 36,
            CornerRadius = new CornerRadius(18),
            Padding = new Thickness(40, 8, 12, 8),
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        _search.TextChanged += (_, _) => Render();
        _search.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter)
            {
                e.Handled = true;
                _firstResult?.Invoke();
            }
        };
        var searchBox = new Panel
        {
            Children = { _search, Icons.Glyph("search", 15).VCenter().Margin(15, 0, 0, 0) },
        };
        ((Control)searchBox.Children[1]).HorizontalAlignment = HorizontalAlignment.Left;
        ((Control)searchBox.Children[1]).IsHitTestVisible = false;

        var footer = new Border
        {
            Height = 64,
            Padding = new Thickness(36, 0),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Child = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Children = { _footerUser.VCenter().Col(0), PowerButton().Col(1) },
            },
        }.Res(BackgroundProperty, "W12.Hover").Res(BorderBrushProperty, "W12.Divider");
        DockPanel.SetDock(footer, Avalonia.Controls.Dock.Bottom);
        DockPanel.SetDock(searchBox, Avalonia.Controls.Dock.Top);
        searchBox.Margin = new Thickness(32, 28, 32, 16);

        Child = new DockPanel { Children = { footer, searchBox, _body.Margin(32, 0, 32, 12) } };
        Sys.Changed += what =>
        {
            if (IsOpen && what is "recent" or "user") Render();
        };
    }

    public override void UpdatePlacement()
    {
        var centered = Sys.Settings.TaskbarCentered;
        HorizontalAlignment = centered ? HorizontalAlignment.Center : HorizontalAlignment.Left;
        Margin = new Thickness(centered ? 0 : 8, 0, 0, ShellWindow.TaskbarReserve + 4);
        var available = (Parent as Control)?.Bounds.Height ?? 900;
        Height = Math.Min(700, Math.Max(420, available - ShellWindow.TaskbarReserve - TopOffset - 8));
    }

    protected override void OnOpening()
    {
        _showAllApps = false;
        _search.Text = "";
        Render();
    }

    protected override void OnOpened() => _search.Focus();

    public void OpenWithSearch()
    {
        var shell = ShellWindow.Current;
        if (!IsOpen) shell.ToggleFlyout(this);
        Dispatcher.UIThread.Post(() => _search.Focus(), DispatcherPriority.Background);
    }

    void Render()
    {
        var s = Sys.Settings;
        _footerUser.Content = UserButton();
        var query = _search.Text?.Trim() ?? "";
        _firstResult = null;
        _body.Content = query.Length > 0 ? SearchResults(query) : _showAllApps ? AllApps() : Home();
    }

    // ------------------------------------------------------------ Startseite

    Control Home()
    {
        var shell = ShellWindow.Current;
        var pinnedHeader = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Children =
            {
                UI.Text("Angeheftet", 14, FontWeight.SemiBold).VCenter().Col(0),
                SmallButton("Alle Apps", "chevron-right", () => { _showAllApps = true; Render(); }).Col(1),
            },
        };

        var grid = new UniformGrid { Columns = 6 };
        foreach (var app in AppRegistry.All)
            grid.Children.Add(AppTile(app));

        var recentHeader = UI.Text("Empfohlen", 14, FontWeight.SemiBold).Margin(0, 8, 0, 0);
        var recent = new UniformGrid { Columns = 2 };
        var files = Sys.Settings.RecentFiles.Where(File.Exists).Take(6).ToList();
        foreach (var file in files)
        {
            var info = new FileInfo(file);
            recent.Children.Add(ListEntry(Icons.ForFile(file, 28), info.Name, Ago(info.LastWriteTime), () => shell.OpenPath(file)));
        }

        Control recentContent = files.Count > 0
            ? recent
            : UI.Sub("Wenn du Dateien öffnest, erscheinen sie hier. Tipp: Probiere den Editor oder Paint aus!", 13, wrap: true).Margin(8, 8, 8, 0);

        return UI.V(10, pinnedHeader, grid, recentHeader, recentContent);
    }

    Control AllApps()
    {
        var shell = ShellWindow.Current;
        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Children =
            {
                UI.Text("Alle Apps", 14, FontWeight.SemiBold).VCenter().Col(0),
                SmallButton("Zurück", "chevron-left", () => { _showAllApps = false; Render(); }).Col(1),
            },
        };
        var list = UI.V(2);
        char? letter = null;
        foreach (var app in AppRegistry.All.OrderBy(a => a.Name, StringComparer.CurrentCulture))
        {
            var first = char.ToUpper(app.Name[0]);
            if (first != letter)
            {
                letter = first;
                list.Children.Add(UI.Text(first.ToString(), 13, FontWeight.SemiBold, "W12.Accent").Margin(12, 8, 0, 2));
            }
            var a = app;
            list.Children.Add(ListEntry(Icons.Tile(app, 28), app.Name, app.Description, () => shell.Launch(a.Id)));
        }
        var dock = new DockPanel { Children = { header.Dock(Avalonia.Controls.Dock.Top).Margin(0, 0, 0, 8), UI.Scroll(list) } };
        return dock;
    }

    // ------------------------------------------------------------ Suche

    Control SearchResults(string query)
    {
        var shell = ShellWindow.Current;
        var q = query.ToLowerInvariant();
        var list = UI.V(2);

        void Section(string title) => list.Children.Add(UI.Text(title, 13, FontWeight.SemiBold, "W12.SubText").Margin(8, 10, 0, 4));

        void Add(Control icon, string title, string subtitle, Action action)
        {
            _firstResult ??= action;
            list.Children.Add(ListEntry(icon, title, subtitle, action));
        }

        // Rechner direkt im Suchfeld
        if (query.Any(char.IsDigit) && MathEval.TryEvaluate(query, out var value))
        {
            Section("Rechner");
            var text = MathEval.Format(value);
            Add(Icons.Tile(AppRegistry.Get("calc")!, 28), $"= {text}", query, () => shell.Launch("calc"));
        }

        var apps = AppRegistry.All.Where(a =>
            a.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            a.Keywords.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            a.Description.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
        if (apps.Count > 0)
        {
            Section("Apps");
            foreach (var app in apps)
            {
                var a = app;
                Add(Icons.Tile(app, 28), app.Name, app.Description, () => shell.Launch(a.Id));
            }
        }

        var pages = SettingsPages.Where(p =>
            p.Name.Contains(q, StringComparison.OrdinalIgnoreCase) || p.Keywords.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
        if (pages.Count > 0)
        {
            Section("Einstellungen");
            foreach (var page in pages)
            {
                var p = page;
                Add(Icons.Glyph("settings", 22), page.Name, "Einstellungen", () => shell.Launch("settings", p.Page));
            }
        }

        var files = SearchFiles(q).Take(8).ToList();
        if (files.Count > 0)
        {
            Section("Dateien und Ordner");
            foreach (var file in files)
            {
                var f = file;
                Add(Icons.ForFile(file, 26), Path.GetFileName(file), Path.GetDirectoryName(file) ?? "", () => shell.OpenPath(f));
            }
        }

        Section("Assistent");
        Add(Icons.Tile(AppRegistry.Get("assistant")!, 28), $"„{query}“ den Assistenten fragen", "Antworten und Aktionen", () =>
        {
            if (shell.Launch("assistant") is { View: Apps.AssistantApp assistant }) assistant.Ask(query);
        });

        return UI.Scroll(list);
    }

    static IEnumerable<string> SearchFiles(string query)
    {
        IEnumerable<string> entries;
        try
        {
            entries = Directory.EnumerateFileSystemEntries(UserFolders.Root, "*", new EnumerationOptions
            {
                RecurseSubdirectories = true,
                IgnoreInaccessible = true,
                MaxRecursionDepth = 5,
                AttributesToSkip = FileAttributes.Hidden | FileAttributes.System,
            });
        }
        catch
        {
            yield break;
        }

        foreach (var entry in entries)
        {
            if (entry.Contains(Path.DirectorySeparatorChar + ".")) continue;
            if (Path.GetFileName(entry).Contains(query, StringComparison.OrdinalIgnoreCase)) yield return entry;
        }
    }

    // ------------------------------------------------------------ Bausteine

    static Button AppTile(AppInfo app)
    {
        var shell = ShellWindow.Current;
        var content = UI.V(6, Icons.Tile(app, 40), UI.Text(app.Name, 12));
        foreach (var c in content.Children) c.HorizontalAlignment = HorizontalAlignment.Center;
        var b = UI.Flat(content, () => shell.Launch(app.Id), app.Description);
        b.Height = 86;
        b.HorizontalContentAlignment = HorizontalAlignment.Center;

        var pinned = Sys.Settings.PinnedApps.Contains(app.Id);
        var pin = new MenuItem { Header = pinned ? "Von Taskleiste lösen" : "An Taskleiste anheften", Icon = Icons.Glyph("pin", 14) };
        pin.Click += (_, _) => Sys.Set("pinned", s =>
        {
            if (pinned) s.PinnedApps.Remove(app.Id);
            else s.PinnedApps.Add(app.Id);
        });
        var open = new MenuItem { Header = "Öffnen", Icon = Icons.Glyph("open", 14) };
        open.Click += (_, _) => shell.Launch(app.Id);
        b.ContextMenu = new ContextMenu { ItemsSource = new[] { open, pin } };
        return b;
    }

    static Button ListEntry(Control icon, string title, string subtitle, Action click)
    {
        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            Children =
            {
                new Border { Width = 32, Child = icon.Center() }.Margin(0, 0, 12, 0).Col(0),
                UI.V(1, UI.Text(title, 13), UI.Sub(subtitle, 12)).VCenter().Col(1),
            },
        };
        var b = UI.Flat(grid, click);
        b.Padding = new Thickness(10, 8);
        b.HorizontalContentAlignment = HorizontalAlignment.Stretch;
        b.HorizontalAlignment = HorizontalAlignment.Stretch;
        return b;
    }

    static Button SmallButton(string text, string icon, Action click)
    {
        var b = UI.Flat(UI.H(6, UI.Text(text, 12).VCenter(), Icons.Glyph(icon, 12)), click);
        b.Padding = new Thickness(10, 4);
        b.Res(BackgroundProperty, "W12.Hover");
        return b;
    }

    Control UserButton()
    {
        var shell = ShellWindow.Current;
        var s = Sys.Settings;
        var b = UI.Flat(UI.H(12, Icons.Avatar(s.UserName, s.AvatarColor, 32), UI.Text(s.UserName, 13).VCenter()), () => { });
        b.Padding = new Thickness(10, 6);
        b.HorizontalAlignment = HorizontalAlignment.Left;
        b.Flyout = new MenuFlyout
        {
            ItemsSource = new Control[]
            {
                Item("Kontoeinstellungen ändern", "user", () => shell.Launch("settings", "konten")),
                new Separator(),
                Item("Sperren", "lock", shell.Lock),
                Item("Abmelden", "logout", shell.SignOut),
            },
        };
        return b;
    }

    Button PowerButton()
    {
        var shell = ShellWindow.Current;
        var b = UI.IconButton("power", () => { }, "Ein/Aus", 18, 40);
        b.Flyout = new MenuFlyout
        {
            ItemsSource = new Control[]
            {
                Item("Sperren", "lock", shell.Lock),
                Item("Herunterfahren", "power", () => shell.Shutdown(false)),
                Item("Neu starten", "restart", () => shell.Shutdown(true)),
            },
        };
        return b;
    }

    static MenuItem Item(string header, string icon, Action click)
    {
        var item = new MenuItem { Header = header, Icon = Icons.Glyph(icon, 14) };
        item.Click += (_, _) => click();
        return item;
    }

    public static string Ago(DateTime time)
    {
        var span = DateTime.Now - time;
        if (span.TotalMinutes < 1) return "Gerade eben";
        if (span.TotalHours < 1) return $"Vor {(int)span.TotalMinutes} Min.";
        if (span.TotalDays < 1) return $"Vor {(int)span.TotalHours} Std.";
        if (span.TotalDays < 2) return "Gestern";
        return time.ToString("d. MMMM", Sys.German);
    }
}
