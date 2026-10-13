using System.Collections.Specialized;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>
/// Die obere Leiste von Windows 12: Widgets links, Suche in der Mitte,
/// Systemsymbole, Benachrichtigungen und Uhr rechts.
/// </summary>
public sealed class TopBar : Border
{
    readonly TextBlock _desktopLabel;

    public TopBar()
    {
        Height = ShellWindow.TopBarHeight;
        VerticalAlignment = VerticalAlignment.Top;
        this.Res(BackgroundProperty, "W12.Bar");

        var shell = ShellWindow.Current;

        // Links: Widgets + aktueller Desktop
        _desktopLabel = UI.Sub("", 12).VCenter();
        var widgets = UI.Flat(UI.H(8, Icons.Glyph("widgets", 15), UI.Text("Widgets", 13).VCenter()), () => shell.ToggleFlyout(shell.Widgets), "Widgets");
        widgets.Height = 28;
        var left = UI.H(8, widgets, _desktopLabel).VCenter().Margin(8, 0, 0, 0);

        // Mitte: Suche
        var searchContent = UI.H(10, Icons.Glyph("search", 14), UI.Sub("Apps, Dateien und Einstellungen suchen", 13).VCenter());
        var search = new Button
        {
            Content = searchContent,
            Width = 420,
            Height = 28,
            CornerRadius = new CornerRadius(14),
            Padding = new Thickness(14, 0),
            HorizontalContentAlignment = HorizontalAlignment.Left,
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        search.Classes.Add("flat");
        search.Res(BackgroundProperty, "W12.Hover");
        search.Click += (_, _) => shell.StartMenu.OpenWithSearch();

        // Rechts: Systemsymbole, Glocke, Uhr
        var right = UI.H(4, CreateTray(), CreateBell(), CreateClock()).VCenter().Margin(0, 0, 8, 0);
        right.HorizontalAlignment = HorizontalAlignment.Right;

        Child = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto,*"),
            Children = { left.Col(0), search.VCenter().Col(1), right.Col(2) },
        };

        shell.WM.Changed += UpdateDesktopLabel;
    }

    void UpdateDesktopLabel()
    {
        var wm = ShellWindow.Current.WM;
        _desktopLabel.Text = wm.DesktopCount > 1 ? $"Desktop {wm.CurrentDesktop + 1} von {wm.DesktopCount}" : "";
    }

    /// <summary>Netzwerk-, Lautstärke- und Akkusymbol – öffnet die Schnelleinstellungen.</summary>
    public static Button CreateTray()
    {
        var shell = ShellWindow.Current;
        var host = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10 };
        void Update()
        {
            var s = Sys.Settings;
            host.Children.Clear();
            host.Children.Add(Icons.Glyph(s.AirplaneMode ? "airplane" : s.Wifi ? "wifi" : "wifi-off", 15));
            host.Children.Add(Icons.Glyph(s.Muted || s.Volume == 0 ? "mute" : "volume", 15));
            host.Children.Add(Icons.Glyph(s.EnergySaver ? "leaf" : "battery", 15));
        }
        Update();
        Sys.Changed += _ => Update();

        var b = UI.Flat(host, () => shell.ToggleFlyout(shell.QuickSettings), "Netzwerk, Lautstärke, Akku");
        b.Height = 28;
        b.Padding = new Thickness(10, 0);
        return b;
    }

    /// <summary>Glocke mit Anzahl ungelesener Benachrichtigungen.</summary>
    public static Button CreateBell()
    {
        var shell = ShellWindow.Current;
        var badge = new Border
        {
            MinWidth = 16,
            Height = 16,
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(4, 0),
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, -2, -6, 0),
            Child = new TextBlock { FontSize = 10, Foreground = Brushes.White, FontWeight = FontWeight.SemiBold, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
        }.Res(BackgroundProperty, "W12.Accent");

        var icon = new Panel { Children = { Icons.Glyph("bell", 15), badge } };
        void Update()
        {
            var count = shell.Notifications.Count;
            badge.IsVisible = count > 0;
            ((TextBlock)badge.Child!).Text = count > 9 ? "9+" : count.ToString();
            ((Panel)icon).Children[0] = Icons.Glyph(Sys.Settings.DoNotDisturb ? "bell-off" : "bell", 15);
        }
        Update();
        shell.Notifications.CollectionChanged += (_, _) => Update();
        Sys.Changed += _ => Update();

        var b = UI.Flat(icon, () => shell.ToggleFlyout(shell.NotificationCenter), "Benachrichtigungen");
        b.Height = 28;
        b.Padding = new Thickness(10, 0);
        return b;
    }

    /// <summary>Uhrzeit und Datum – öffnet Kalender und Benachrichtigungen.</summary>
    public static Button CreateClock(bool twoLines = false)
    {
        var shell = ShellWindow.Current;
        var time = UI.Text("", twoLines ? 12 : 13);
        var date = UI.Text("", 12);
        time.HorizontalAlignment = HorizontalAlignment.Right;
        date.HorizontalAlignment = HorizontalAlignment.Right;
        void Update()
        {
            var now = DateTime.Now;
            time.Text = Sys.FormatTime(now);
            date.Text = twoLines ? now.ToString("dd.MM.yyyy", Sys.German) : now.ToString("ddd, d. MMM", Sys.German);
        }
        Update();
        shell.Tick += Update;
        Sys.Changed += _ => Update();

        Control content = twoLines ? UI.V(0, time, date) : UI.H(10, date, time);
        var b = UI.Flat(content, () => shell.ToggleFlyout(shell.NotificationCenter), null);
        b.Height = twoLines ? 42 : 28;
        b.Padding = new Thickness(10, 0);
        ToolTip.SetTip(b, DateTime.Now.ToString("dddd, d. MMMM yyyy", Sys.German));
        b.PointerEntered += (_, _) => ToolTip.SetTip(b, DateTime.Now.ToString("dddd, d. MMMM yyyy", Sys.German));
        return b;
    }
}
