namespace Windows12.Core;

/// <summary>
/// Benutzerordner von Windows 12. Alles liegt in einem eigenen Stammordner
/// (Standard: ~/Windows12, überschreibbar mit der Umgebungsvariable W12_HOME),
/// damit die Simulation keine echten Benutzerdateien durcheinanderbringt.
/// Über „Dieser PC“ im Explorer sind trotzdem alle echten Laufwerke erreichbar.
/// </summary>
public static class UserFolders
{
    public static string Root { get; } =
        Environment.GetEnvironmentVariable("W12_HOME") is { Length: > 0 } custom
            ? custom
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Windows12");

    public static string Desktop => Path.Combine(Root, "Desktop");
    public static string Documents => Path.Combine(Root, "Dokumente");
    public static string Pictures => Path.Combine(Root, "Bilder");
    public static string Downloads => Path.Combine(Root, "Downloads");
    public static string Music => Path.Combine(Root, "Musik");
    public static string Videos => Path.Combine(Root, "Videos");
    public static string RecycleBin => Path.Combine(Root, "Papierkorb");
    public static string SystemDir => Path.Combine(Root, ".system");
    public static string SettingsFile => Path.Combine(SystemDir, "einstellungen.json");
    public static string RecycleIndex => Path.Combine(SystemDir, "papierkorb.json");

    public static IReadOnlyList<(string Name, string Path, string Icon)> QuickAccess =>
    [
        ("Desktop", Desktop, "desktop"),
        ("Dokumente", Documents, "document"),
        ("Bilder", Pictures, "image"),
        ("Downloads", Downloads, "download"),
        ("Musik", Music, "music"),
        ("Videos", Videos, "video"),
    ];

    public static void EnsureCreated()
    {
        var firstRun = !Directory.Exists(Root);
        foreach (var dir in new[] { Root, Desktop, Documents, Pictures, Downloads, Music, Videos, RecycleBin, SystemDir })
            Directory.CreateDirectory(dir);

        if (!firstRun) return;

        File.WriteAllText(Path.Combine(Desktop, "Willkommen.txt"),
            """
            Willkommen bei Windows 12!

            Ein paar Tipps für den Anfang:
            • Klicke unten auf das Windows-Logo, um das Startmenü zu öffnen.
            • Fenster kannst du verschieben, an den Rändern vergrößern und an die
              Bildschirmränder ziehen, um sie anzudocken.
            • Rechts oben findest du WLAN, Lautstärke und die Schnelleinstellungen.
            • Der Assistent (Funkel-Symbol) öffnet Apps und ändert Einstellungen
              per Texteingabe, z. B. „öffne Rechner“ oder „dunkelmodus aus“.

            Tastenkürzel:
              Strg+Esc            Startmenü
              Strg+Tab            Task-Ansicht
              Alt+F4              Aktives Fenster schließen
              Strg+Alt+T          Terminal
              Strg+Alt+E          Explorer
              Strg+Alt+L          Sperren
              Strg+Umschalt+Esc   Task-Manager

            Viel Spaß!
            """);

        File.WriteAllText(Path.Combine(Documents, "Einkaufsliste.txt"), "Milch\nBrot\nKäse\nÄpfel\n");
    }
}
