using Avalonia.Media;
using Windows12.Apps;

namespace Windows12.Core;

/// <summary>Beschreibung einer installierten App.</summary>
public sealed class AppInfo
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Icon { get; init; }
    public required Color Color1 { get; init; }
    public required Color Color2 { get; init; }
    /// <summary>Erzeugt die App-Oberfläche. Parameter: optionales Argument (z. B. Dateipfad).</summary>
    public required Func<string?, AppView> Create { get; init; }
    public double Width { get; init; } = 900;
    public double Height { get; init; } = 600;
    /// <summary>Nur ein Fenster gleichzeitig (z. B. Einstellungen).</summary>
    public bool SingleInstance { get; init; }
    public string Description { get; init; } = "";
    public string Keywords { get; init; } = "";
}

public static class AppRegistry
{
    static Color C(string hex) => Color.Parse(hex);

    public static readonly IReadOnlyList<AppInfo> All =
    [
        new() { Id = "explorer", Name = "Explorer", Icon = "folder", Color1 = C("#FFD45C"), Color2 = C("#F29D1F"),
                Create = arg => new ExplorerApp(arg), Width = 980, Height = 620,
                Description = "Dateien und Ordner durchsuchen", Keywords = "dateien ordner dateimanager dieser pc" },
        new() { Id = "notepad", Name = "Editor", Icon = "notepad", Color1 = C("#5FC9F8"), Color2 = C("#1877D6"),
                Create = arg => new NotepadApp(arg), Width = 820, Height = 560,
                Description = "Textdateien bearbeiten", Keywords = "notepad text schreiben notizen" },
        new() { Id = "calc", Name = "Rechner", Icon = "calc", Color1 = C("#7C8CF8"), Color2 = C("#3F4BC9"),
                Create = _ => new CalculatorApp(), Width = 340, Height = 540,
                Description = "Taschenrechner mit Verlauf", Keywords = "rechnen calculator mathe" },
        new() { Id = "terminal", Name = "Terminal", Icon = "terminal", Color1 = C("#4B5563"), Color2 = C("#111827"),
                Create = arg => new TerminalApp(arg), Width = 820, Height = 500,
                Description = "Befehlszeile", Keywords = "cmd konsole shell eingabeaufforderung powershell" },
        new() { Id = "settings", Name = "Einstellungen", Icon = "settings", Color1 = C("#9CA9B8"), Color2 = C("#4B5868"),
                Create = arg => new SettingsApp(arg), Width = 1000, Height = 680, SingleInstance = true,
                Description = "System anpassen", Keywords = "optionen hintergrund design konto wlan systemsteuerung" },
        new() { Id = "taskmgr", Name = "Task-Manager", Icon = "taskmgr", Color1 = C("#5EDB8A"), Color2 = C("#1E8F4E"),
                Create = _ => new TaskManagerApp(), Width = 860, Height = 580, SingleInstance = true,
                Description = "Apps, Prozesse und Leistung", Keywords = "prozesse leistung cpu speicher beenden" },
        new() { Id = "paint", Name = "Paint", Icon = "paint", Color1 = C("#FF9EC4"), Color2 = C("#B04AE0"),
                Create = arg => new PaintApp(arg), Width = 960, Height = 640,
                Description = "Zeichnen und malen", Keywords = "zeichnen malen bild" },
        new() { Id = "photos", Name = "Fotos", Icon = "image", Color1 = C("#4FC3F7"), Color2 = C("#7E57C2"),
                Create = arg => new PhotosApp(arg), Width = 900, Height = 620,
                Description = "Bilder ansehen", Keywords = "bilder galerie foto viewer" },
        new() { Id = "clock", Name = "Uhr", Icon = "clock", Color1 = C("#3DD6E0"), Color2 = C("#0E7C86"),
                Create = _ => new ClockApp(), Width = 720, Height = 520, SingleInstance = true,
                Description = "Weltzeit, Stoppuhr und Timer", Keywords = "wecker timer stoppuhr zeit" },
        new() { Id = "assistant", Name = "Assistent", Icon = "sparkle", Color1 = C("#A78BFA"), Color2 = C("#EC4899"),
                Create = _ => new AssistantApp(), Width = 460, Height = 620, SingleInstance = true,
                Description = "Frag mich etwas oder gib mir einen Befehl", Keywords = "ki hilfe copilot chat" },
        new() { Id = "winver", Name = "Info", Icon = "info", Color1 = C("#38BDF8"), Color2 = C("#2563EB"),
                Create = _ => new AboutApp(), Width = 520, Height = 440, SingleInstance = true,
                Description = "Über Windows 12", Keywords = "winver version über system" },
        new() { Id = "recycle", Name = "Papierkorb", Icon = "trash", Color1 = C("#B0BEC5"), Color2 = C("#607D8B"),
                Create = _ => new ExplorerApp(UserFolders.RecycleBin), Width = 900, Height = 560,
                Description = "Gelöschte Dateien", Keywords = "gelöscht wiederherstellen" },
    ];

    public static AppInfo? Get(string id) => All.FirstOrDefault(a => a.Id == id);

    /// <summary>Welche App öffnet diese Datei?</summary>
    public static AppInfo? ForFile(string path)
    {
        if (FileOps.IsImage(path)) return Get("photos");
        if (FileOps.IsText(path) || Path.GetExtension(path).Length == 0) return Get("notepad");
        return null;
    }
}
