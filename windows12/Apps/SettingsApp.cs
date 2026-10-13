using System.Net.NetworkInformation;
using System.Reflection;
using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>Einstellungen: System, Personalisierung, Netzwerk, Konten, Zeit, Apps, Update und Info.</summary>
public sealed class SettingsApp : AppView
{
    sealed record Page(string Id, string Name, string Icon, Func<Control> Build);

    readonly List<Page> _pages;
    readonly StackPanel _nav = new() { Spacing = 2 };
    readonly ContentControl _content = new();
    readonly TextBlock _pageTitle = UI.Heading("", 28);
    readonly ContentControl _profile = new();
    string _current = "system";

    public SettingsApp(string? page)
    {
        _pages =
        [
            new("system", "System", "pc", SystemPage),
            new("personalisierung", "Personalisierung", "palette", PersonalizationPage),
            new("netzwerk", "Netzwerk und Internet", "wifi", NetworkPage),
            new("konten", "Konten", "user", AccountsPage),
            new("zeit", "Zeit und Sprache", "globe", TimePage),
            new("apps", "Apps", "apps", AppsPage),
            new("update", "Windows Update", "update", UpdatePage),
            new("info", "Info", "info", InfoPage),
        ];

        var profileButton = UI.Flat(_profile, () => Show("konten"));
        profileButton.Padding = new Thickness(8);

        var search = new TextBox { PlaceholderText = "Einstellung suchen" };
        search.TextChanged += (_, _) => FilterNav(search.Text ?? "");

        var sidebar = UI.V(10, profileButton, search, _nav);
        sidebar.Margin = new Thickness(12, 16, 8, 16);

        Content = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("280,*"),
            Children =
            {
                UI.Scroll(sidebar).Col(0),
                new DockPanel
                {
                    Margin = new Thickness(24, 20, 24, 0),
                    Children = { _pageTitle.Margin(0, 0, 0, 16).Dock(Avalonia.Controls.Dock.Top), UI.Scroll(_content.Margin(0, 0, 12, 24)) },
                }.Col(1),
            },
        };

        Show(page ?? "system");
    }

    public override void OnArgument(string? argument)
    {
        if (argument != null) Show(argument);
    }

    void FilterNav(string query)
    {
        BuildNav(query);
    }

    void BuildNav(string filter = "")
    {
        _nav.Children.Clear();
        foreach (var page in _pages.Where(p => filter.Length == 0 || p.Name.Contains(filter, StringComparison.OrdinalIgnoreCase)))
        {
            var p = page;
            var button = UI.IconTextButton(page.Icon, page.Name, () => Show(p.Id));
            button.HorizontalAlignment = HorizontalAlignment.Stretch;
            button.Height = 38;
            if (page.Id == _current)
            {
                button.Classes.Add("selected");
                var accent = new Border { Width = 3, Height = 16, CornerRadius = new CornerRadius(2), HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(-4, 0, 0, 0) }
                    .Res(Border.BackgroundProperty, "W12.Accent");
                _nav.Children.Add(new Panel { Children = { button, accent } });
            }
            else
            {
                _nav.Children.Add(button);
            }
        }
    }

    void Show(string id)
    {
        var page = _pages.FirstOrDefault(p => p.Id == id) ?? _pages[0];
        _current = page.Id;
        _pageTitle.Text = page.Name;
        SetTitle($"Einstellungen – {page.Name}");
        _content.Content = page.Build();
        var s = Sys.Settings;
        _profile.Content = UI.H(12, Icons.Avatar(s.UserName, s.AvatarColor, 56),
            UI.V(2, UI.Text(s.UserName, 15, FontWeight.SemiBold), UI.Sub("Lokales Konto", 12)).VCenter());
        BuildNav();
    }

    static TextBlock Section(string title) => UI.Text(title, 14, FontWeight.SemiBold).Margin(0, 14, 0, 4);

    // ------------------------------------------------------------ System

    Control SystemPage()
    {
        var s = Sys.Settings;
        var brightness = new Slider { Minimum = 20, Maximum = 100, Value = s.Brightness * 100, Width = 220 };
        brightness.ValueChanged += (_, e) => Sys.Set("display", st => st.Brightness = e.NewValue / 100);
        var volume = new Slider { Minimum = 0, Maximum = 100, Value = s.Volume * 100, Width = 220 };
        volume.ValueChanged += (_, e) => Sys.Set("volume", st => st.Volume = e.NewValue / 100);

        var storageText = UI.Sub("Wird berechnet …", 12);
        _ = Task.Run(() =>
        {
            long size = 0;
            try
            {
                size = new DirectoryInfo(UserFolders.Root)
                    .EnumerateFiles("*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true })
                    .Sum(f => f.Length);
            }
            catch
            {
                // Ignorieren
            }
            Dispatcher.UIThread.Post(() => storageText.Text = $"{Sys.FormatSize(size)} belegt · {RecycleBin.Count} Elemente im Papierkorb");
        });

        return UI.V(4,
            Section("Anzeige"),
            UI.SettingRow("sun", "Helligkeit", "Bildschirmhelligkeit anpassen", brightness),
            UI.SettingRow("bulb", "Nachtmodus", "Wärmere Farben, um nachts besser zu schlafen", UI.Toggle(s.NightLight, v => Sys.Set("display", st => st.NightLight = v))),
            Section("Sound"),
            UI.SettingRow("volume", "Lautstärke", null, volume),
            UI.SettingRow("mute", "Stummschalten", null, UI.Toggle(s.Muted, v => Sys.Set("volume", st => st.Muted = v))),
            Section("Benachrichtigungen"),
            UI.SettingRow("bell-off", "Nicht stören", "Benachrichtigungen landen nur im Benachrichtigungscenter", UI.Toggle(s.DoNotDisturb, v => Sys.Set("notifications", st => st.DoNotDisturb = v))),
            UI.SettingRow("bell", "Testbenachrichtigung", "Zeigt eine Beispiel-Benachrichtigung an",
                UI.Btn("Senden", () => Shell.Notify("Testbenachrichtigung", "So sehen Benachrichtigungen in Windows 12 aus.", "settings"))),
            Section("Energie und Speicher"),
            UI.SettingRow("leaf", "Energiesparmodus", "Reduziert Hintergrundaktivität", UI.Toggle(s.EnergySaver, v => Sys.Set("power", st => st.EnergySaver = v))),
            UI.SettingRow("drive", "Speicher", null, UI.H(12, storageText.VCenter(), UI.Btn("Papierkorb leeren", async () =>
            {
                if (await Shell.Dialogs.MessageAsync("Papierkorb leeren", "Sollen alle Elemente endgültig gelöscht werden?", "Ja", "Nein") == "Ja")
                {
                    RecycleBin.Empty();
                    Show("system");
                }
            }))));
    }

    // ------------------------------------------------------------ Personalisierung

    Control PersonalizationPage()
    {
        var s = Sys.Settings;

        var wallpapers = new WrapPanel();
        foreach (var wp in Appearance.Wallpapers)
        {
            var id = wp.Id;
            var selected = s.Wallpaper == id;
            var preview = new Border
            {
                Width = 150,
                Height = 94,
                CornerRadius = new CornerRadius(8),
                ClipToBounds = true,
                BorderThickness = new Thickness(selected ? 3 : 0),
                Child = Appearance.CreateWallpaper(id, null),
            };
            if (selected) preview.Res(Border.BorderBrushProperty, "W12.Accent");
            var button = UI.Flat(UI.V(4, preview, UI.Sub(wp.Name, 12).Center()), () =>
            {
                Sys.Set("wallpaper", st => st.Wallpaper = id);
                Show("personalisierung");
            });
            button.Padding = new Thickness(4);
            wallpapers.Children.Add(button);
        }
        var pick = UI.Btn("Bild auswählen …", async () =>
        {
            var path = await Shell.Dialogs.OpenFileAsync(UserFolders.Pictures, FileOps.ImageExtensions, "Hintergrundbild auswählen");
            if (path == null) return;
            Sys.Set("wallpaper", st => { st.Wallpaper = "image"; st.WallpaperImage = path; });
            Show("personalisierung");
        });

        var mode = new ComboBox { ItemsSource = new[] { "Dunkel", "Hell" }, SelectedIndex = s.DarkMode ? 0 : 1, Width = 160 };
        mode.SelectionChanged += (_, _) => Sys.Set("theme", st => st.DarkMode = mode.SelectedIndex == 0);

        var accents = new WrapPanel { MaxWidth = 460 };
        foreach (var (name, hex) in Appearance.AccentColors)
        {
            var color = hex;
            var swatch = new Button
            {
                Width = 38,
                Height = 38,
                Margin = new Thickness(3),
                CornerRadius = new CornerRadius(6),
                Background = UI.Brush(hex),
                BorderThickness = new Thickness(s.Accent.Equals(hex, StringComparison.OrdinalIgnoreCase) ? 3 : 0),
                Content = s.Accent.Equals(hex, StringComparison.OrdinalIgnoreCase) ? Icons.Glyph("check", 16, Brushes.White, 2.5) : null,
                HorizontalContentAlignment = HorizontalAlignment.Center,
                VerticalContentAlignment = VerticalAlignment.Center,
            }.Res(BorderBrushProperty, "W12.Text").Tip(name);
            swatch.Click += (_, _) =>
            {
                Sys.Set("theme", st => st.Accent = color);
                Show("personalisierung");
            };
            accents.Children.Add(swatch);
        }

        var align = new ComboBox { ItemsSource = new[] { "Zentriert", "Links" }, SelectedIndex = s.TaskbarCentered ? 0 : 1, Width = 160 };
        align.SelectionChanged += (_, _) => Sys.Set("layout", st => st.TaskbarCentered = align.SelectedIndex == 0);

        return UI.V(4,
            Section("Hintergrund"),
            UI.Card(UI.V(12, wallpapers, UI.H(12, pick, UI.Sub(s.Wallpaper == "image" ? $"Aktuell: {Path.GetFileName(s.WallpaperImage)}" : "", 12).VCenter())), 12),
            Section("Farben"),
            UI.SettingRow("moon", "Modus auswählen", "Hell oder dunkel für Fenster und Apps", mode),
            UI.SettingRow("sparkle", "Transparenzeffekte", "Taskleiste und Menüs leicht durchscheinend", UI.Toggle(s.Transparency, v => Sys.Set("theme", st => st.Transparency = v))),
            UI.Card(UI.V(10, UI.H(16, Icons.Glyph("palette", 20), UI.V(2, UI.Text("Akzentfarbe", 14), UI.Sub("Für Schaltflächen, Hervorhebungen und Symbole", 12))), accents), 16),
            Section("Taskleiste und Desktop"),
            UI.SettingRow("taskview", "Ausrichtung der Taskleiste", null, align),
            UI.SettingRow("widgets", "Obere Leiste anzeigen", "Widgets, Suche, Systemsymbole und Uhr oben am Bildschirm", UI.Toggle(s.ShowTopBar, v => Sys.Set("layout", st => st.ShowTopBar = v))),
            UI.SettingRow("desktop", "Desktopsymbole anzeigen", null, UI.Toggle(s.ShowDesktopIcons, v => Sys.Set("layout", st => st.ShowDesktopIcons = v))));
    }

    // ------------------------------------------------------------ Netzwerk

    Control NetworkPage()
    {
        var s = Sys.Settings;
        var adapters = UI.V(6);
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces().Where(n => n.NetworkInterfaceType != NetworkInterfaceType.Loopback))
            {
                var ips = string.Join(", ", nic.GetIPProperties().UnicastAddresses
                    .Where(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    .Select(a => a.Address.ToString()));
                var up = nic.OperationalStatus == OperationalStatus.Up;
                adapters.Children.Add(UI.SettingRow(nic.NetworkInterfaceType.ToString().Contains("Wireless") ? "wifi" : "network",
                    nic.Name, $"{(up ? "Verbunden" : "Getrennt")}{(ips.Length > 0 ? " · " + ips : "")} · {nic.NetworkInterfaceType}", null));
            }
        }
        catch (Exception ex)
        {
            adapters.Children.Add(UI.Sub($"Netzwerkadapter konnten nicht gelesen werden: {ex.Message}", 12, wrap: true));
        }

        var online = NetworkInterface.GetIsNetworkAvailable() && !s.AirplaneMode && s.Wifi;
        var status = UI.Card(UI.H(16, Icons.Glyph(online ? "globe" : "wifi-off", 40),
            UI.V(2, UI.Text(online ? "Verbunden" : "Nicht verbunden", 18, FontWeight.SemiBold), UI.Sub(online ? "Du bist mit dem Internet verbunden." : "Aktiviere WLAN, um dich zu verbinden.", 13))), 20);

        return UI.V(4,
            status,
            Section("Verbindungen"),
            UI.SettingRow("wifi", "WLAN", null, UI.Toggle(s.Wifi, v => { Sys.Set("network", st => { st.Wifi = v; if (v) st.AirplaneMode = false; }); Show("netzwerk"); })),
            UI.SettingRow("bluetooth", "Bluetooth", null, UI.Toggle(s.Bluetooth, v => Sys.Set("network", st => { st.Bluetooth = v; if (v) st.AirplaneMode = false; }))),
            UI.SettingRow("airplane", "Flugmodus", "Alle Funkverbindungen deaktivieren", UI.Toggle(s.AirplaneMode, v =>
            {
                Sys.Set("network", st =>
                {
                    st.AirplaneMode = v;
                    if (v) { st.Wifi = false; st.Bluetooth = false; }
                    else st.Wifi = true;
                });
                Show("netzwerk");
            })),
            Section("Netzwerkadapter dieses Geräts"),
            adapters);
    }

    // ------------------------------------------------------------ Konten

    Control AccountsPage()
    {
        var s = Sys.Settings;
        var nameBox = new TextBox { Text = s.UserName, Width = 220 };
        var saveName = UI.Btn("Übernehmen", () =>
        {
            var name = nameBox.Text?.Trim() ?? "";
            if (name.Length == 0) return;
            Sys.Set("user", st => st.UserName = name);
            Shell.Notify("Konto", $"Dein Name lautet jetzt „{name}“.", "settings");
            Show("konten");
        }, accent: true);

        var colors = new WrapPanel();
        foreach (var (name, hex) in Appearance.AccentColors)
        {
            var c = hex;
            var b = new Button { Width = 30, Height = 30, Margin = new Thickness(3), CornerRadius = new CornerRadius(15), Background = UI.Brush(hex) }.Tip(name);
            b.Click += (_, _) =>
            {
                Sys.Set("user", st => st.AvatarColor = c);
                Show("konten");
            };
            colors.Children.Add(b);
        }

        var current = new TextBox { PasswordChar = '•', PlaceholderText = "Aktuelles Kennwort", Width = 260, IsVisible = Sys.HasPassword };
        var newPw = new TextBox { PasswordChar = '•', PlaceholderText = "Neues Kennwort", Width = 260 };
        var repeat = new TextBox { PasswordChar = '•', PlaceholderText = "Kennwort bestätigen", Width = 260 };
        var message = UI.Sub("", 12);
        var savePw = UI.Btn(Sys.HasPassword ? "Kennwort ändern" : "Kennwort festlegen", () =>
        {
            if (!Sys.CheckPassword(current.Text ?? "")) { message.Text = "Das aktuelle Kennwort ist falsch."; return; }
            if ((newPw.Text ?? "") != (repeat.Text ?? "")) { message.Text = "Die Kennwörter stimmen nicht überein."; return; }
            if (string.IsNullOrEmpty(newPw.Text)) { message.Text = "Bitte ein neues Kennwort eingeben."; return; }
            Sys.Set("user", st => st.PasswordHash = Sys.HashPassword(newPw.Text!));
            Shell.Notify("Kennwort", "Dein Kennwort wurde gespeichert. Es wird ab der nächsten Anmeldung abgefragt.", "settings");
            Show("konten");
        }, accent: true);
        var removePw = UI.Btn("Kennwort entfernen", () =>
        {
            if (!Sys.CheckPassword(current.Text ?? "")) { message.Text = "Das aktuelle Kennwort ist falsch."; return; }
            Sys.Set("user", st => st.PasswordHash = "");
            Show("konten");
        });
        removePw.IsVisible = Sys.HasPassword;

        return UI.V(4,
            UI.Card(UI.H(20, Icons.Avatar(s.UserName, s.AvatarColor, 88),
                UI.V(4, UI.Text(s.UserName, 22, FontWeight.SemiBold), UI.Sub("Lokales Konto · Administrator", 13),
                    UI.Sub(Sys.HasPassword ? "Mit Kennwort geschützt" : "Kein Kennwort festgelegt", 12)).VCenter()), 20),
            Section("Kontoinformationen"),
            UI.SettingRow("user", "Anzeigename", null, UI.H(8, nameBox, saveName)),
            UI.Card(UI.V(8, UI.Text("Farbe des Profilbilds", 14), colors), 16),
            Section("Anmeldeoptionen"),
            UI.Card(UI.V(10,
                UI.H(16, Icons.Glyph("lock", 20), UI.V(2, UI.Text("Kennwort", 14), UI.Sub("Wird auf dem Sperrbildschirm abgefragt", 12))),
                current, newPw, repeat, UI.H(8, savePw, removePw), message), 16),
            UI.SettingRow("lock", "Jetzt sperren", "Tastenkürzel: Strg+Alt+L", UI.Btn("Sperren", Shell.Lock)));
    }

    // ------------------------------------------------------------ Zeit und Sprache

    Control TimePage()
    {
        var s = Sys.Settings;
        var now = UI.Text("", 32, FontWeight.SemiBold);
        var date = UI.Sub("", 14);
        void Update()
        {
            now.Text = Sys.FormatTime(DateTime.Now, true);
            date.Text = DateTime.Now.ToString("dddd, d. MMMM yyyy", Sys.German);
        }
        Update();
        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        timer.Tick += (_, _) => Update();
        now.AttachedToVisualTree += (_, _) => timer.Start();
        now.DetachedFromVisualTree += (_, _) => timer.Stop();

        return UI.V(4,
            UI.Card(UI.V(2, now, date), 20),
            Section("Datum und Uhrzeit"),
            UI.SettingRow("clock", "24-Stunden-Format", null, UI.Toggle(s.Use24h, v => Sys.Set("time", st => st.Use24h = v))),
            UI.SettingRow("timer", "Sekunden in der Uhr anzeigen", null, UI.Toggle(s.ShowSeconds, v => Sys.Set("time", st => st.ShowSeconds = v))),
            UI.SettingRow("globe", "Zeitzone", TimeZoneInfo.Local.DisplayName, null),
            Section("Sprache und Region"),
            UI.SettingRow("keyboard", "Anzeigesprache", "Deutsch", null),
            UI.SettingRow("globe", "Regionales Format", "Deutsch (Deutschland) – z. B. 1.234,56", null));
    }

    // ------------------------------------------------------------ Apps

    Control AppsPage()
    {
        var list = UI.V(4);
        foreach (var app in AppRegistry.All)
        {
            var a = app;
            var pinned = Sys.Settings.PinnedApps.Contains(app.Id);
            var pin = new CheckBox { Content = "An Taskleiste", IsChecked = pinned };
            pin.IsCheckedChanged += (_, _) => Sys.Set("pinned", st =>
            {
                if (pin.IsChecked == true) { if (!st.PinnedApps.Contains(a.Id)) st.PinnedApps.Add(a.Id); }
                else st.PinnedApps.Remove(a.Id);
            });
            var row = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto"),
                Children =
                {
                    Icons.Tile(app, 36).Margin(0, 0, 14, 0).Col(0),
                    UI.V(2, UI.Text(app.Name, 14), UI.Sub(app.Description, 12)).VCenter().Col(1),
                    pin.VCenter().Margin(0, 0, 12, 0).Col(2),
                    UI.Btn("Öffnen", () => Shell.Launch(a.Id)).VCenter().Col(3),
                },
            };
            list.Children.Add(UI.Card(row, 12));
        }
        return UI.V(4, Section($"Installierte Apps ({AppRegistry.All.Count})"), list);
    }

    // ------------------------------------------------------------ Update

    Control UpdatePage()
    {
        var title = UI.Text("Du bist auf dem neuesten Stand", 20, FontWeight.SemiBold);
        var subtitle = UI.Sub($"Letzte Überprüfung: heute, {DateTime.Now.AddMinutes(-42):HH:mm}", 13);
        var progress = new ProgressBar { IsIndeterminate = true, IsVisible = false, Width = 280, HorizontalAlignment = HorizontalAlignment.Left };
        Button? check = null;
        check = UI.Btn("Nach Updates suchen", async () =>
        {
            check!.IsEnabled = false;
            progress.IsVisible = true;
            title.Text = "Es wird nach Updates gesucht …";
            await Task.Delay(2500);
            progress.IsVisible = false;
            title.Text = "Du bist auf dem neuesten Stand";
            subtitle.Text = $"Letzte Überprüfung: heute, {DateTime.Now:HH:mm}";
            check.IsEnabled = true;
            Shell.Notify("Windows Update", "Keine neuen Updates verfügbar. Windows 12 ist aktuell.", "settings");
        }, accent: true);

        return UI.V(4,
            UI.Card(new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                Children =
                {
                    Icons.Glyph("update", 56).Margin(0, 0, 20, 0).Col(0),
                    UI.V(6, title, subtitle, progress).VCenter().Col(1),
                    check.VCenter().Col(2),
                },
            }, 24),
            Section("Weitere Optionen"),
            UI.SettingRow("pause", "Updates aussetzen", "Für 1 Woche pausieren", UI.Btn("Pausieren", () => Shell.Notify("Windows Update", "Updates wurden für 1 Woche ausgesetzt.", "settings"))),
            UI.SettingRow("clock", "Updateverlauf", "Windows 12 Version 25H2 · installiert", null),
            UI.SettingRow("shield", "Windows-Insider-Programm", "Erhalte Vorabversionen von Windows 12", UI.Toggle(false, _ => { })));
    }

    // ------------------------------------------------------------ Info

    Control InfoPage()
    {
        var mem = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
        var installed = Directory.GetCreationTime(UserFolders.Root);
        var avalonia = typeof(Application).Assembly.GetName().Version;

        Control Row(string label, string value) => new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("220,*"),
            Margin = new Thickness(0, 4),
            Children = { UI.Sub(label, 13).Col(0), new SelectableTextBlock { Text = value, FontSize = 13, TextWrapping = TextWrapping.Wrap }.Col(1) },
        };

        var rename = UI.Btn("Diesen PC umbenennen", () => Shell.Dialogs.MessageAsync("Diesen PC umbenennen",
            $"Der Gerätename „{Environment.MachineName}“ stammt vom echten Betriebssystem und kann hier nicht geändert werden.", "OK"));

        return UI.V(4,
            UI.Card(new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                Children =
                {
                    Icons.Glyph("pc", 48).Margin(0, 0, 18, 0).Col(0),
                    UI.V(2, UI.Text(Environment.MachineName, 20, FontWeight.SemiBold), UI.Sub("Windows 12 Pro", 13)).VCenter().Col(1),
                    rename.VCenter().Col(2),
                },
            }, 20),
            Section("Gerätespezifikationen"),
            UI.Card(UI.V(0,
                Row("Gerätename", Environment.MachineName),
                Row("Prozessor", $"{Environment.ProcessorCount} logische Prozessoren ({RuntimeInformation.ProcessArchitecture})"),
                Row("Installierter RAM", Sys.FormatSize(mem)),
                Row("Systemtyp", $"{(Environment.Is64BitOperatingSystem ? "64" : "32")}-Bit-Betriebssystem, {RuntimeInformation.OSArchitecture}-basierter Prozessor"),
                Row("Läuft auf", RuntimeInformation.OSDescription)), 16),
            Section("Windows-Spezifikationen"),
            UI.Card(UI.V(0,
                Row("Edition", "Windows 12 Pro"),
                Row("Version", "25H2"),
                Row("Installiert am", installed.ToString("dd.MM.yyyy", Sys.German)),
                Row("Betriebssystembuild", "30000.1"),
                Row("Leistung", $"{RuntimeInformation.FrameworkDescription} · Avalonia {avalonia}"),
                Row("Benutzerordner", UserFolders.Root)), 16),
            UI.Sub("Windows 12 ist ein Fan-Projekt und kein Produkt der Microsoft Corporation.", 12, wrap: true).Margin(0, 12, 0, 0));
    }
}
