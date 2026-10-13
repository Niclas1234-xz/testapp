using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Media;
using ShapePath = Avalonia.Controls.Shapes.Path;
using Shape = Avalonia.Controls.Shapes.Shape;

namespace Windows12.Core;

/// <summary>Vektor-Symbole (24×24-Raster, Linienstil) und App-Kacheln.</summary>
public static class Icons
{
    const string Folder = "M3,7.5 C3,6.1 4.1,5 5.5,5 L9.5,5 L11.5,7 L18.5,7 C19.9,7 21,8.1 21,9.5 L21,17.5 C21,18.9 19.9,20 18.5,20 L5.5,20 C4.1,20 3,18.9 3,17.5 Z";
    const string File = "M7,3 L14,3 L19,8 L19,19 C19,20.1 18.1,21 17,21 L7,21 C5.9,21 5,20.1 5,19 L5,5 C5,3.9 5.9,3 7,3 Z M14,3 L14,8 L19,8";
    const string Circle = "M3,12 A9,9 0 1 1 21,12 A9,9 0 1 1 3,12 Z";
    const string Lens = "M4,11 A7,7 0 1 1 18,11 A7,7 0 1 1 4,11 Z M16,16 L21,21";
    const string Refresh = "M21,12 A9,9 0 1 1 12,3 C14.52,3 16.93,4 18.74,5.74 L21,8 M21,3 L21,8 L16,8";
    const string Bell = "M6,8.5 A6,6 0 0 1 18,8.5 C18,14.5 20.5,16.5 20.5,16.5 L3.5,16.5 C3.5,16.5 6,14.5 6,8.5 Z M10,20 C10.4,21 11.1,21.5 12,21.5 C12.9,21.5 13.6,21 14,20";
    const string Wifi = "M2,8.5 C7.5,3.5 16.5,3.5 22,8.5 M5,12 C9,8.5 15,8.5 19,12 M8.5,15.5 C10.5,13.8 13.5,13.8 15.5,15.5 M12,19.5 L12.01,19.5";
    const string Sun = "M8,12 A4,4 0 1 1 16,12 A4,4 0 1 1 8,12 Z M12,2 L12,4 M12,20 L12,22 M2,12 L4,12 M20,12 L22,12 M4.9,4.9 L6.3,6.3 M17.7,17.7 L19.1,19.1 M4.9,19.1 L6.3,17.7 M17.7,6.3 L19.1,4.9";
    const string Monitor = "M4,4 L20,4 C21.1,4 22,4.9 22,6 L22,15 C22,16.1 21.1,17 20,17 L4,17 C2.9,17 2,16.1 2,15 L2,6 C2,4.9 2.9,4 4,4 Z M8,21 L16,21 M12,17 L12,21";
    const string Grid4 = "M4,4 L10,4 L10,10 L4,10 Z M14,4 L20,4 L20,10 L14,10 Z M4,14 L10,14 L10,20 L4,20 Z M14,14 L20,14 L20,20 L14,20 Z";
    const string Palette = "M12,3 C7,3 3,7 3,12 C3,17 7,21 12,21 C13.4,21 14,20.2 14,19.2 C14,18.1 13,17.6 13,16.6 C13,15.5 13.9,14.6 15,14.6 L17,14.6 C19.2,14.6 21,12.8 21,10.6 C21,6.4 17,3 12,3 Z M7.5,12 L7.51,12 M9.5,7.5 L9.51,7.5 M14.5,7.5 L14.51,7.5 M17,11 L17.01,11";
    const string Globe = "M2,12 A10,10 0 1 1 22,12 A10,10 0 1 1 2,12 Z M2,12 L22,12 M12,2 C14.5,4.7 16,8.2 16,12 C16,15.8 14.5,19.3 12,22 C9.5,19.3 8,15.8 8,12 C8,8.2 9.5,4.7 12,2 Z";

    static readonly Dictionary<string, string> Data = new()
    {
        ["folder"] = Folder,
        ["file"] = File,
        ["document"] = File + " M8.5,13 L15.5,13 M8.5,16.5 L13.5,16.5",
        ["notepad"] = "M6,3 L18,3 C19.1,3 20,3.9 20,5 L20,19 C20,20.1 19.1,21 18,21 L6,21 C4.9,21 4,20.1 4,19 L4,5 C4,3.9 4.9,3 6,3 Z M8,8 L16,8 M8,12 L16,12 M8,16 L13,16",
        ["calc"] = "M7,2.5 L17,2.5 C18.1,2.5 19,3.4 19,4.5 L19,19.5 C19,20.6 18.1,21.5 17,21.5 L7,21.5 C5.9,21.5 5,20.6 5,19.5 L5,4.5 C5,3.4 5.9,2.5 7,2.5 Z M8.5,6 L15.5,6 L15.5,9 L8.5,9 Z M8.5,13 L8.51,13 M12,13 L12.01,13 M15.5,13 L15.51,13 M8.5,17 L8.51,17 M12,17 L12.01,17 M15.5,17 L15.51,17",
        ["terminal"] = "M4,6 L10,12 L4,18 M12,18 L20,18",
        ["settings"] = "M12,2.5 L12,5 M12,19 L12,21.5 M2.5,12 L5,12 M19,12 L21.5,12 M5.3,5.3 L7.05,7.05 M16.95,16.95 L18.7,18.7 M5.3,18.7 L7.05,16.95 M16.95,7.05 L18.7,5.3 M7,12 A5,5 0 1 1 17,12 A5,5 0 1 1 7,12 Z M10,12 A2,2 0 1 1 14,12 A2,2 0 1 1 10,12 Z",
        ["taskmgr"] = "M3,12 L7,12 L10,4 L14,20 L17,12 L21,12",
        ["paint"] = Palette,
        ["image"] = "M5,4 L19,4 C20.1,4 21,4.9 21,6 L21,18 C21,19.1 20.1,20 19,20 L5,20 C3.9,20 3,19.1 3,18 L3,6 C3,4.9 3.9,4 5,4 Z M3,16 L8,11 L13,16 M12,15 L15,12 L21,18 M15.5,8.5 L15.51,8.5",
        ["clock"] = Circle + " M12,7 L12,12 L15.5,14",
        ["info"] = Circle + " M12,11 L12,16.5 M12,7.5 L12.01,7.5",
        ["sparkle"] = "M12,3 L13.9,9.1 L20,11 L13.9,12.9 L12,19 L10.1,12.9 L4,11 L10.1,9.1 Z M19,3 L19,7 M17,5 L21,5",
        ["trash"] = "M4,7 L20,7 M10,11 L10,17 M14,11 L14,17 M6,7 L7,19 C7.1,20.1 7.9,21 9,21 L15,21 C16.1,21 16.9,20.1 17,19 L18,7 M9,7 L9,4.5 C9,3.7 9.7,3 10.5,3 L13.5,3 C14.3,3 15,3.7 15,4.5 L15,7",
        ["search"] = Lens,
        ["power"] = "M12,3 L12,12 M6.3,6.6 A8.5,8.5 0 1 0 17.7,6.6",
        ["wifi"] = Wifi,
        ["wifi-off"] = Wifi + " M3,3 L21,21",
        ["volume"] = "M11,5 L6,9 L2,9 L2,15 L6,15 L11,19 Z M15.5,8.5 C16.8,10.5 16.8,13.5 15.5,15.5 M18.5,5.5 C21.5,9.5 21.5,14.5 18.5,18.5",
        ["mute"] = "M11,5 L6,9 L2,9 L2,15 L6,15 L11,19 Z M16,9 L22,15 M22,9 L16,15",
        ["battery"] = "M3,7 L17,7 C18.1,7 19,7.9 19,9 L19,15 C19,16.1 18.1,17 17,17 L3,17 C1.9,17 1,16.1 1,15 L1,9 C1,7.9 1.9,7 3,7 Z M22,10.5 L22,13.5 M4.5,10.5 L15.5,10.5 L15.5,13.5 L4.5,13.5 Z",
        ["bluetooth"] = "M7,7 L17,17 L12,22 L12,2 L17,7 L7,17",
        ["airplane"] = "M2,16 L10,13 L10,5.5 C10,4.1 10.9,3 12,3 C13.1,3 14,4.1 14,5.5 L14,13 L22,16 L22,18 L14,16 L14,19.5 L16.5,21 L16.5,22 L12,21 L7.5,22 L7.5,21 L10,19.5 L10,16 L2,18 Z",
        ["moon"] = "M20.5,14.5 A8.5,8.5 0 1 1 9.5,3.5 A6.5,6.5 0 0 0 20.5,14.5 Z",
        ["sun"] = Sun,
        ["bulb"] = "M9,18 L15,18 M10,21.5 L14,21.5 M12,2 C8.1,2 5,5.1 5,9 C5,11.4 6.2,13.5 8,14.7 L8,16 L16,16 L16,14.7 C17.8,13.5 19,11.4 19,9 C19,5.1 15.9,2 12,2 Z",
        ["bell"] = Bell,
        ["bell-off"] = Bell + " M3,3 L21,21",
        ["leaf"] = "M11,20 C6,20 3,16.5 3,12.5 C3,6 9,3.5 20,3 C19.5,14 16,20 11,20 Z M3,21 C7,15 11,12 15,9.5",
        ["lock"] = "M5,11 L19,11 L19,21 L5,21 Z M8,11 L8,7.5 A4,4 0 0 1 16,7.5 L16,11",
        ["user"] = "M4,21 C4,16.6 7.6,14 12,14 C16.4,14 20,16.6 20,21 M8,7.5 A4,4 0 1 1 16,7.5 A4,4 0 1 1 8,7.5 Z",
        ["restart"] = Refresh,
        ["refresh"] = Refresh,
        ["logout"] = "M9,21 L5,21 C3.9,21 3,20.1 3,19 L3,5 C3,3.9 3.9,3 5,3 L9,3 M16,17 L21,12 L16,7 M21,12 L9,12",
        ["arrow-left"] = "M19,12 L5,12 M12,19 L5,12 L12,5",
        ["arrow-right"] = "M5,12 L19,12 M12,5 L19,12 L12,19",
        ["arrow-up"] = "M12,19 L12,5 M5,12 L12,5 L19,12",
        ["plus"] = "M12,5 L12,19 M5,12 L19,12",
        ["minus"] = "M5,12 L19,12",
        ["folder-plus"] = Folder + " M12,10.5 L12,16.5 M9,13.5 L15,13.5",
        ["file-plus"] = File + " M12,11 L12,17 M9,14 L15,14",
        ["copy"] = "M9,9 L20,9 L20,20 L9,20 Z M5,15 L4,15 L4,4 L15,4 L15,5",
        ["cut"] = "M3,6 A3,3 0 1 1 9,6 A3,3 0 1 1 3,6 Z M3,18 A3,3 0 1 1 9,18 A3,3 0 1 1 3,18 Z M20,4 L8.1,15.9 M14.5,14.5 L20,20 M8.1,8.1 L12,12",
        ["paste"] = "M8,4 L6,4 C4.9,4 4,4.9 4,6 L4,20 C4,21.1 4.9,22 6,22 L18,22 C19.1,22 20,21.1 20,20 L20,6 C20,4.9 19.1,4 18,4 L16,4 M9,2 L15,2 L15,6 L9,6 Z",
        ["rename"] = "M17,3 L21,7 L8,20 L3,21 L4,16 Z M14,6 L18,10",
        ["home"] = "M3,10 L12,3 L21,10 L21,20 C21,20.6 20.6,21 20,21 L15,21 L15,14 L9,14 L9,21 L4,21 C3.4,21 3,20.6 3,20 Z",
        ["desktop"] = Monitor,
        ["pc"] = Monitor,
        ["drive"] = "M3,8 L21,8 L21,17 C21,18.1 20.1,19 19,19 L5,19 C3.9,19 3,18.1 3,17 Z M3,8 L6,4 L18,4 L21,8 M7,14.5 L7.01,14.5 M11,14.5 L11.01,14.5",
        ["download"] = "M12,3 L12,15 M7,10 L12,15 L17,10 M4,17 L4,20 L20,20 L20,17",
        ["music"] = "M9,18 L9,5 L21,3 L21,16 M6,18 A3,3 0 1 1 12,18 A3,3 0 1 1 6,18 Z M15,16 A3,3 0 1 1 21,16 A3,3 0 1 1 15,16 Z",
        ["video"] = "M3,6 L15,6 C16.1,6 17,6.9 17,8 L17,16 C17,17.1 16.1,18 15,18 L3,18 C1.9,18 1,17.1 1,16 L1,8 C1,6.9 1.9,6 3,6 Z M17,10 L23,7 L23,17 L17,14",
        ["archive"] = "M3,4 L21,4 L21,8 L3,8 Z M5,8 L5,20 L19,20 L19,8 M10,12 L14,12",
        ["app"] = Grid4,
        ["apps"] = Grid4,
        ["taskview"] = "M3,5 L14,5 L14,14 L3,14 Z M17,8 L21,8 L21,19 L10,19 L10,17",
        ["widgets"] = "M4,4 L11,4 L11,11 L4,11 Z M4,15 L11,15 L11,20 L4,20 Z M15,4 L20,4 L20,9 L15,9 Z M15,13 L20,13 L20,20 L15,20 Z",
        ["chevron-right"] = "M9,6 L15,12 L9,18",
        ["chevron-left"] = "M15,6 L9,12 L15,18",
        ["chevron-down"] = "M6,9 L12,15 L18,9",
        ["chevron-up"] = "M6,15 L12,9 L18,15",
        ["close"] = "M6,6 L18,18 M18,6 L6,18",
        ["check"] = "M5,12 L10,17 L19,7",
        ["save"] = "M5,3 L16,3 L21,8 L21,19 C21,20.1 20.1,21 19,21 L5,21 C3.9,21 3,20.1 3,19 L3,5 C3,3.9 3.9,3 5,3 Z M7,3 L7,8 L15,8 L15,3 M7,21 L7,14 L17,14 L17,21",
        ["open"] = Folder,
        ["zoom-in"] = Lens + " M11,8 L11,14 M8,11 L14,11",
        ["zoom-out"] = Lens + " M8,11 L14,11",
        ["rotate"] = Refresh,
        ["brush"] = "M18.4,2.6 C19.2,1.8 20.5,1.8 21.4,2.6 C22.2,3.5 22.2,4.8 21.4,5.6 L12,15 L9,12 Z M9,12 C7,12 5,13.5 5,16 C5,18 4,19 2.5,19.5 C4,21.5 6.5,22 9,21 C11.2,20 12,18 12,15",
        ["eraser"] = "M7,21 L3.5,17.5 C2.7,16.7 2.7,15.3 3.5,14.5 L14.5,3.5 C15.3,2.7 16.7,2.7 17.5,3.5 L20.5,6.5 C21.3,7.3 21.3,8.7 20.5,9.5 L9,21 Z M7,21 L21,21 M9,9 L15,15",
        ["line"] = "M5,19 L19,5",
        ["rect"] = "M4,6 L20,6 L20,18 L4,18 Z",
        ["ellipse"] = "M2,12 A10,7 0 1 1 22,12 A10,7 0 1 1 2,12 Z",
        ["undo"] = "M9,14 L4,9 L9,4 M4,9 L15,9 C18.3,9 21,11.7 21,15 C21,18.3 18.3,21 15,21 L11,21",
        ["play"] = "M6,4 L20,12 L6,20 Z",
        ["pause"] = "M6,4 L10,4 L10,20 L6,20 Z M14,4 L18,4 L18,20 L14,20 Z",
        ["stop"] = "M5,5 L19,5 L19,19 L5,19 Z",
        ["flag"] = "M4,22 L4,15 M4,15 C4,15 5,14 8,14 C11,14 13,16 16,16 C19,16 20,15 20,15 L20,3 C20,3 19,4 16,4 C13,4 11,2 8,2 C5,2 4,3 4,3 Z",
        ["timer"] = "M10,2 L14,2 M12,14 L15,11 M4,14 A8,8 0 1 1 20,14 A8,8 0 1 1 4,14 Z",
        ["globe"] = Globe,
        ["network"] = Globe,
        ["palette"] = Palette,
        ["update"] = Refresh,
        ["send"] = "M22,2 L11,13 M22,2 L15,22 L11,13 L2,9 Z",
        ["more"] = "M5,12 L5.01,12 M12,12 L12.01,12 M19,12 L19.01,12",
        ["calendar"] = "M5,4 L19,4 C20.1,4 21,4.9 21,6 L21,20 C21,21.1 20.1,22 19,22 L5,22 C3.9,22 3,21.1 3,20 L3,6 C3,4.9 3.9,4 5,4 Z M16,2 L16,6 M8,2 L8,6 M3,10 L21,10",
        ["cpu"] = "M6,6 L18,6 L18,18 L6,18 Z M9,9 L15,9 L15,15 L9,15 Z M9,2 L9,6 M15,2 L15,6 M9,18 L9,22 M15,18 L15,22 M2,9 L6,9 M2,15 L6,15 M18,9 L22,9 M18,15 L22,15",
        ["memory"] = "M3,7 L21,7 L21,17 L3,17 Z M7,17 L7,20 M11,17 L11,20 M15,17 L15,20 M19,17 L19,20 M7,10 L7,14 M11,10 L11,14 M15,10 L15,14",
        ["note"] = "M4,4 L20,4 L20,15 L15,20 L4,20 Z M15,20 L15,15 L20,15",
        ["shield"] = "M12,22 C12,22 20,18 20,12 L20,5 L12,2 L4,5 L4,12 C4,18 12,22 12,22 Z",
        ["plug"] = "M9,2 L9,7 M15,2 L15,7 M6,7 L18,7 L18,11 C18,14.3 15.3,17 12,17 C8.7,17 6,14.3 6,11 Z M12,17 L12,22",
        ["recycle"] = "M4,7 L20,7 M10,11 L10,17 M14,11 L14,17 M6,7 L7,19 C7.1,20.1 7.9,21 9,21 L15,21 C16.1,21 16.9,20.1 17,19 L18,7 M9,7 L9,4.5 C9,3.7 9.7,3 10.5,3 L13.5,3 C14.3,3 15,3.7 15,4.5 L15,7",
        ["pin"] = "M9,4 L15,4 M10,4 L10,10 L6,14 L18,14 L14,10 L14,4 M12,14 L12,21",
        ["star"] = "M12,2.5 L15,8.8 L21.5,9.6 L16.7,14.1 L18,20.6 L12,17.4 L6,20.6 L7.3,14.1 L2.5,9.6 L9,8.8 Z",
        ["keyboard"] = "M3,6 L21,6 C21.6,6 22,6.4 22,7 L22,17 C22,17.6 21.6,18 21,18 L3,18 C2.4,18 2,17.6 2,17 L2,7 C2,6.4 2.4,6 3,6 Z M6,10 L6.01,10 M10,10 L10.01,10 M14,10 L14.01,10 M18,10 L18.01,10 M7,14 L17,14",
    };

    static readonly Dictionary<string, Geometry> Cache = new();

    public static Geometry Geometry(string key)
    {
        if (Cache.TryGetValue(key, out var g)) return g;
        g = StreamGeometry.Parse(Data.GetValueOrDefault(key) ?? Data["app"]);
        Cache[key] = g;
        return g;
    }

    /// <summary>
    /// Linien-Symbol. Ohne Pinsel übernimmt das Symbol die (vererbte) Textfarbe seines Containers –
    /// so passt es sich automatisch an hell/dunkel und an Hover-Zustände an.
    /// </summary>
    public static Control Glyph(string key, double size = 16, IBrush? brush = null, double thickness = 1.8)
    {
        var path = new ShapePath
        {
            Data = Geometry(key),
            StrokeThickness = thickness,
            StrokeLineCap = PenLineCap.Round,
            StrokeJoin = PenLineJoin.Round,
        };
        if (brush != null) path.Stroke = brush;
        else path.Bind(Shape.StrokeProperty, path.GetObservable(TextElement.ForegroundProperty));

        return new Viewbox
        {
            Width = size,
            Height = size,
            Child = new Canvas { Width = 24, Height = 24, Children = { path } },
        };
    }

    /// <summary>Gefülltes Symbol (z. B. Ordner im Explorer).</summary>
    public static Control Filled(string key, double size, IBrush fill)
    {
        var path = new ShapePath { Data = Geometry(key), Fill = fill };
        return new Viewbox { Width = size, Height = size, Child = new Canvas { Width = 24, Height = 24, Children = { path } } };
    }

    public static LinearGradientBrush Gradient(Color a, Color b) => new()
    {
        StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
        EndPoint = new RelativePoint(1, 1, RelativeUnit.Relative),
        GradientStops = { new GradientStop(a, 0), new GradientStop(b, 1) },
    };

    /// <summary>Farbige App-Kachel mit weißem Symbol.</summary>
    public static Control Tile(AppInfo app, double size)
    {
        return new Border
        {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(size * 0.26),
            Background = Gradient(app.Color1, app.Color2),
            BoxShadow = BoxShadows.Parse("0 1 3 0 #40000000"),
            Child = Glyph(app.Icon, size * 0.56, Brushes.White, 2.1),
        };
    }

    /// <summary>Symbol für eine Datei oder einen Ordner.</summary>
    public static Control ForFile(string path, double size)
    {
        var key = FileOps.IconFor(path);
        if (key == "folder")
            return Filled("folder", size, Gradient(Color.Parse("#FFD86B"), Color.Parse("#F2A93B")));

        var color = key switch
        {
            "image" => "#3BA4F2",
            "document" => "#7FB2F0",
            "music" => "#EC4899",
            "video" => "#A855F7",
            "archive" => "#F59E0B",
            "app" => "#22C55E",
            _ => "#9CA3AF",
        };
        return Glyph(key, size, new SolidColorBrush(Color.Parse(color)), 1.6);
    }

    /// <summary>Windows-12-Logo: vier abgerundete Kacheln mit Verlauf.</summary>
    public static Control Logo(double size, bool colored = true)
    {
        var grid = new Grid
        {
            Width = size,
            Height = size,
            ColumnDefinitions = new ColumnDefinitions("*,*"),
            RowDefinitions = new RowDefinitions("*,*"),
        };
        var gap = size * 0.05;
        Color[] tops = [Color.Parse("#7DD3FC"), Color.Parse("#60A5FA"), Color.Parse("#60A5FA"), Color.Parse("#3B82F6")];
        Color[] bottoms = [Color.Parse("#38BDF8"), Color.Parse("#2563EB"), Color.Parse("#2563EB"), Color.Parse("#1D4ED8")];
        for (var i = 0; i < 4; i++)
        {
            var tile = new Border
            {
                Margin = new Thickness(gap),
                CornerRadius = new CornerRadius(size * 0.07),
                Background = colored ? Gradient(tops[i], bottoms[i]) : Brushes.White,
            };
            Grid.SetColumn(tile, i % 2);
            Grid.SetRow(tile, i / 2);
            grid.Children.Add(tile);
        }
        return grid;
    }

    /// <summary>Runder Avatar mit Initialen.</summary>
    public static Control Avatar(string name, string color, double size)
    {
        var initials = string.Concat(name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(2).Select(p => char.ToUpper(p[0])));
        if (initials.Length == 0) initials = "?";
        var c = Color.Parse(color);
        return new Border
        {
            Width = size,
            Height = size,
            CornerRadius = new CornerRadius(size / 2),
            Background = Gradient(UI.Lighten(c, 0.25), c),
            Child = new TextBlock
            {
                Text = initials,
                FontSize = size * 0.38,
                FontWeight = FontWeight.SemiBold,
                Foreground = Brushes.White,
                HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Center,
                VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center,
            },
        };
    }
}
