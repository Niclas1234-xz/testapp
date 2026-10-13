using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Styling;
using ShapePath = Avalonia.Controls.Shapes.Path;
using Ellipse = Avalonia.Controls.Shapes.Ellipse;

namespace Windows12.Core;

/// <summary>Farben, Hell/Dunkel-Modus und Hintergrundbilder.</summary>
public static class Appearance
{
    public static readonly (string Name, string Hex)[] AccentColors =
    [
        ("Blau", "#0078D4"), ("Marine", "#0063B1"), ("Türkis", "#0099BC"), ("Grün", "#10893E"),
        ("Lila", "#8764B8"), ("Violett", "#744DA9"), ("Pink", "#E3008C"), ("Rot", "#E81123"),
        ("Orange", "#CA5010"), ("Gold", "#C19C00"), ("Grau", "#5D5A58"), ("Schiefer", "#486860"),
    ];

    /// <summary>Wendet Hell/Dunkel und Akzentfarbe auf die ganze Anwendung an.</summary>
    public static void Apply()
    {
        var app = Application.Current!;
        var s = Sys.Settings;
        app.RequestedThemeVariant = s.DarkMode ? ThemeVariant.Dark : ThemeVariant.Light;

        Color accent;
        try { accent = Color.Parse(s.Accent); }
        catch { accent = Color.Parse("#0078D4"); }

        // Im Dunkelmodus eine hellere Variante verwenden – wie bei Windows.
        var shown = s.DarkMode ? UI.Lighten(accent, 0.15) : accent;
        app.Resources["W12.Accent"] = new SolidColorBrush(shown);
        app.Resources["W12.AccentSoft"] = new SolidColorBrush(UI.WithAlpha(accent, 0x40));

        // „Glas“ für Taskleiste, Startmenü & Co. – mit oder ohne Transparenzeffekt.
        app.Resources["W12.Glass"] = UI.Brush(s.Transparency
            ? (s.DarkMode ? "#F01C1C21" : "#F2F3F4F7")
            : (s.DarkMode ? "#FF202020" : "#FFF3F3F3"));
        app.Resources["W12.Bar"] = UI.Brush(s.Transparency
            ? (s.DarkMode ? "#B8141418" : "#C8F5F6F8")
            : (s.DarkMode ? "#FF1C1C1C" : "#FFF0F0F0"));

        app.Resources["SystemAccentColor"] = accent;
        app.Resources["SystemAccentColorLight1"] = UI.Lighten(accent, 0.15);
        app.Resources["SystemAccentColorLight2"] = UI.Lighten(accent, 0.30);
        app.Resources["SystemAccentColorLight3"] = UI.Lighten(accent, 0.45);
        app.Resources["SystemAccentColorDark1"] = UI.Darken(accent, 0.15);
        app.Resources["SystemAccentColorDark2"] = UI.Darken(accent, 0.30);
        app.Resources["SystemAccentColorDark3"] = UI.Darken(accent, 0.45);
    }

    // ---------------------------------------------------------------- Hintergründe

    public sealed record Blob(double X, double Y, double W, double H, string Color, double Opacity);
    public sealed record Ribbon(string Data, string From, string To, double Thickness, double Opacity);
    public sealed record WallpaperDef(string Id, string Name, string[] Base, Blob[] Blobs, Ribbon[] Ribbons);

    public static readonly WallpaperDef[] Wallpapers =
    [
        new("bloom", "Bloom",
            ["#0A1230", "#0F2A6B", "#1B3E99"],
            [new(900, 350, 900, 700, "#3B82F6", 0.55), new(1100, 500, 600, 500, "#A855F7", 0.45), new(300, 900, 700, 400, "#06B6D4", 0.35)],
            [new("M-100,900 C350,500 700,950 1100,520 C1350,250 1550,300 1800,150", "#60A5FA", "#C084FC", 140, 0.75),
             new("M-100,1000 C400,700 800,1050 1250,700 C1500,500 1650,520 1800,420", "#22D3EE", "#3B82F6", 70, 0.6)]),
        new("aurora", "Polarlicht",
            ["#02111B", "#06303A", "#0B3D2E"],
            [new(400, 250, 1000, 400, "#10B981", 0.45), new(1100, 300, 700, 500, "#22D3EE", 0.35), new(800, 800, 900, 300, "#6366F1", 0.3)],
            [new("M-100,450 C300,200 700,500 1000,300 C1300,100 1500,250 1800,100", "#34D399", "#22D3EE", 120, 0.55)]),
        new("sunset", "Sonnenuntergang",
            ["#1E1B4B", "#7C2D5A", "#F97316"],
            [new(800, 750, 1100, 500, "#FB923C", 0.6), new(300, 300, 700, 500, "#DB2777", 0.4), new(1300, 250, 600, 400, "#7C3AED", 0.4)],
            [new("M-100,800 C400,600 900,850 1300,600 C1500,480 1650,500 1800,420", "#FDBA74", "#F472B6", 110, 0.6)]),
        new("dune", "Düne",
            ["#F5E6D3", "#E8C9A0", "#C98B5B"],
            [new(1100, 300, 900, 500, "#FFFFFF", 0.5), new(400, 800, 900, 400, "#B45309", 0.3)],
            [new("M-100,700 C400,500 900,800 1300,550 C1500,430 1650,450 1800,380", "#FDE68A", "#F59E0B", 160, 0.45),
             new("M-100,950 C500,750 900,1000 1800,700", "#D97706", "#92400E", 120, 0.35)]),
        new("night", "Nacht",
            ["#000000", "#05070F", "#0B1023"],
            [new(800, 500, 900, 600, "#1D4ED8", 0.35), new(1200, 300, 500, 400, "#7C3AED", 0.25)],
            [new("M-100,750 C400,550 800,800 1200,550 C1450,400 1600,420 1800,300", "#1E3A8A", "#4C1D95", 100, 0.7)]),
        new("lavender", "Lavendel",
            ["#EEF2FF", "#E0E7FF", "#FCE7F3"],
            [new(1000, 400, 900, 600, "#C4B5FD", 0.6), new(400, 700, 700, 500, "#F9A8D4", 0.5)],
            [new("M-100,850 C350,550 750,900 1150,600 C1400,420 1600,430 1800,300", "#A5B4FC", "#F0ABFC", 150, 0.6)]),
    ];

    public static bool IsLightWallpaper(string id) => id is "dune" or "lavender";

    /// <summary>Erzeugt den Desktop-Hintergrund (skaliert auf jede Bildschirmgröße).</summary>
    public static Control CreateWallpaper(string id, string? imagePath)
    {
        if (id == "image" && imagePath != null && File.Exists(imagePath))
        {
            try
            {
                return new Image { Source = new Bitmap(imagePath), Stretch = Stretch.UniformToFill };
            }
            catch
            {
                // Ungültiges Bild → Standardhintergrund.
            }
        }

        var def = Wallpapers.FirstOrDefault(w => w.Id == id) ?? Wallpapers[0];
        var canvas = new Canvas
        {
            Width = 1600,
            Height = 1000,
            ClipToBounds = true,
            Background = new LinearGradientBrush
            {
                StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
                EndPoint = new RelativePoint(1, 1, RelativeUnit.Relative),
                GradientStops =
                {
                    new GradientStop(Color.Parse(def.Base[0]), 0),
                    new GradientStop(Color.Parse(def.Base[1]), 0.55),
                    new GradientStop(Color.Parse(def.Base[2]), 1),
                },
            },
        };

        foreach (var blob in def.Blobs)
        {
            var c = Color.Parse(blob.Color);
            var e = new Ellipse
            {
                Width = blob.W,
                Height = blob.H,
                Opacity = blob.Opacity,
                Fill = new RadialGradientBrush
                {
                    GradientStops = { new GradientStop(c, 0), new GradientStop(UI.WithAlpha(c, 0), 1) },
                },
            };
            Canvas.SetLeft(e, blob.X - blob.W / 2);
            Canvas.SetTop(e, blob.Y - blob.H / 2);
            canvas.Children.Add(e);
        }

        foreach (var ribbon in def.Ribbons)
        {
            var path = new ShapePath
            {
                Data = StreamGeometry.Parse(ribbon.Data),
                StrokeThickness = ribbon.Thickness,
                StrokeLineCap = PenLineCap.Round,
                Opacity = ribbon.Opacity,
                Stroke = new LinearGradientBrush
                {
                    StartPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
                    EndPoint = new RelativePoint(1, 0, RelativeUnit.Relative),
                    GradientStops =
                    {
                        new GradientStop(UI.WithAlpha(Color.Parse(ribbon.From), 0), 0),
                        new GradientStop(Color.Parse(ribbon.From), 0.3),
                        new GradientStop(Color.Parse(ribbon.To), 0.75),
                        new GradientStop(UI.WithAlpha(Color.Parse(ribbon.To), 0x40), 1),
                    },
                },
                Effect = new BlurEffect { Radius = ribbon.Thickness / 5 },
            };
            canvas.Children.Add(path);
        }

        return new Viewbox { Stretch = Stretch.UniformToFill, Child = canvas };
    }
}
