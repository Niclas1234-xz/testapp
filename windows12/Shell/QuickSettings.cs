using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Schnelleinstellungen: WLAN, Bluetooth, Flugmodus, Helligkeit, Lautstärke, …</summary>
public sealed class QuickSettings : Flyout
{
    bool _updating;
    readonly List<(ToggleButton Button, Func<Settings, bool> Get)> _tiles = [];
    readonly Slider _brightness;
    readonly Slider _volume;
    readonly TextBlock _volumeText;
    readonly Button _muteButton;

    public QuickSettings() : base(380)
    {
        var shell = ShellWindow.Current;

        var grid = new UniformGrid { Columns = 3 };
        grid.Children.Add(Tile("wifi", "WLAN", s => s.Wifi, (s, v) => { s.Wifi = v; if (v) s.AirplaneMode = false; }, "network"));
        grid.Children.Add(Tile("bluetooth", "Bluetooth", s => s.Bluetooth, (s, v) => { s.Bluetooth = v; if (v) s.AirplaneMode = false; }, "network"));
        grid.Children.Add(Tile("airplane", "Flugmodus", s => s.AirplaneMode, (s, v) =>
        {
            s.AirplaneMode = v;
            if (v) { s.Wifi = false; s.Bluetooth = false; }
            else s.Wifi = true;
        }, "network"));
        grid.Children.Add(Tile("leaf", "Energie sparen", s => s.EnergySaver, (s, v) => s.EnergySaver = v, "power"));
        grid.Children.Add(Tile("bell-off", "Nicht stören", s => s.DoNotDisturb, (s, v) => s.DoNotDisturb = v, "notifications"));
        grid.Children.Add(Tile("bulb", "Nachtmodus", s => s.NightLight, (s, v) => s.NightLight = v, "display"));
        grid.Children.Add(Tile("moon", "Dunkelmodus", s => s.DarkMode, (s, v) => s.DarkMode = v, "theme"));
        grid.Children.Add(Tile("sparkle", "Transparenz", s => s.Transparency, (s, v) => s.Transparency = v, "theme"));
        grid.Children.Add(Tile("widgets", "Obere Leiste", s => s.ShowTopBar, (s, v) => s.ShowTopBar = v, "layout"));

        _brightness = new Slider { Minimum = 0.2, Maximum = 1, Value = Sys.Settings.Brightness };
        _brightness.ValueChanged += (_, e) =>
        {
            if (!_updating) Sys.Set("display", s => s.Brightness = e.NewValue);
        };

        _volume = new Slider { Minimum = 0, Maximum = 100, Value = Sys.Settings.Volume * 100 };
        _volumeText = UI.Text("", 12).VCenter();
        _volume.ValueChanged += (_, e) =>
        {
            _volumeText.Text = $"{(int)e.NewValue}";
            if (!_updating) Sys.Set("volume", s => { s.Volume = e.NewValue / 100; s.Muted = false; });
        };
        _muteButton = UI.IconButton("volume", () => Sys.Set("volume", s => s.Muted = !s.Muted), "Stummschalten", 18, 36);

        var sliders = UI.V(8,
            new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,36"),
                Children = { Icons.Glyph("sun", 18).VCenter().Margin(9, 0, 9, 0).Col(0), _brightness.Col(1) },
            },
            new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,36"),
                Children = { _muteButton.Col(0), _volume.Col(1), _volumeText.Margin(8, 0, 0, 0).Col(2) },
            });

        var footer = new Border
        {
            Padding = new Thickness(20, 0, 12, 0),
            Height = 52,
            BorderThickness = new Thickness(0, 1, 0, 0),
            Child = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Children =
                {
                    UI.H(8, Icons.Glyph("plug", 16), UI.Text("100 %  ·  Netzbetrieb", 12).VCenter()).VCenter().Col(0),
                    UI.IconButton("settings", () => shell.Launch("settings"), "Alle Einstellungen", 16, 36).Col(1),
                },
            },
        }.Res(BackgroundProperty, "W12.Hover").Res(BorderBrushProperty, "W12.Divider");
        DockPanel.SetDock(footer, Avalonia.Controls.Dock.Bottom);

        Child = new DockPanel
        {
            Children = { footer, UI.V(18, grid, sliders).Margin(16, 18, 16, 18) },
        };

        Sys.Changed += _ =>
        {
            if (IsOpen) Sync();
        };
    }

    Control Tile(string icon, string label, Func<Settings, bool> get, Action<Settings, bool> set, string what)
    {
        var button = new ToggleButton
        {
            Height = 48,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Content = Icons.Glyph(icon, 18),
        };
        button.Classes.Add("tile");
        button.IsCheckedChanged += (_, _) =>
        {
            if (_updating) return;
            var v = button.IsChecked == true;
            Sys.Set(what, s => set(s, v));
        };
        _tiles.Add((button, get));
        var text = UI.Text(label, 11).Center();
        text.TextAlignment = TextAlignment.Center;
        return UI.V(6, button, text).Margin(4, 0, 4, 6);
    }

    protected override void OnOpening() => Sync();

    void Sync()
    {
        _updating = true;
        var s = Sys.Settings;
        foreach (var (button, get) in _tiles) button.IsChecked = get(s);
        _brightness.Value = s.Brightness;
        _volume.Value = s.Volume * 100;
        _volumeText.Text = $"{(int)(s.Volume * 100)}";
        _muteButton.Content = Icons.Glyph(s.Muted || s.Volume == 0 ? "mute" : "volume", 18);
        _updating = false;
    }

    public override void UpdatePlacement()
    {
        HorizontalAlignment = HorizontalAlignment.Right;
        if (Sys.Settings.ShowTopBar)
        {
            VerticalAlignment = VerticalAlignment.Top;
            Margin = new Thickness(0, TopOffset, 8, 0);
        }
        else
        {
            VerticalAlignment = VerticalAlignment.Bottom;
            Margin = new Thickness(0, 0, 8, ShellWindow.TaskbarReserve + 4);
        }
    }
}
