using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Windows12.Core;

/// <summary>Alle dauerhaft gespeicherten Systemeinstellungen.</summary>
public sealed class Settings
{
    public string UserName { get; set; } = DefaultUserName();
    public string PasswordHash { get; set; } = "";
    public string AvatarColor { get; set; } = "#0078D4";

    public bool DarkMode { get; set; } = true;
    public string Accent { get; set; } = "#0078D4";
    public string Wallpaper { get; set; } = "bloom";
    public string? WallpaperImage { get; set; }
    public bool Transparency { get; set; } = true;
    public bool TaskbarCentered { get; set; } = true;
    public bool ShowTopBar { get; set; } = true;
    public bool ShowDesktopIcons { get; set; } = true;

    public double Brightness { get; set; } = 1.0;
    public double Volume { get; set; } = 0.6;
    public bool Muted { get; set; }
    public bool Wifi { get; set; } = true;
    public bool Bluetooth { get; set; } = true;
    public bool AirplaneMode { get; set; }
    public bool DoNotDisturb { get; set; }
    public bool NightLight { get; set; }
    public bool EnergySaver { get; set; }

    public bool Use24h { get; set; } = true;
    public bool ShowSeconds { get; set; }

    public List<string> PinnedApps { get; set; } = ["explorer", "notepad", "terminal", "calc", "settings", "assistant"];
    public List<string> RecentFiles { get; set; } = [];
    public string Notes { get; set; } = "Notizen hier eintippen …";

    public static string DefaultUserName()
    {
        var name = Environment.UserName;
        return string.IsNullOrWhiteSpace(name) || name == "root" ? "Benutzer" : char.ToUpper(name[0]) + name[1..];
    }
}

/// <summary>Zentraler Zugriff auf Einstellungen und Systemzustand.</summary>
public static class Sys
{
    static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static Settings Settings { get; private set; } = new();
    public static DateTime BootTime { get; set; } = DateTime.Now;

    /// <summary>Wird ausgelöst, wenn sich eine Einstellung geändert hat (Parameter: Name der Einstellung).</summary>
    public static event Action<string>? Changed;

    public static void Load()
    {
        try
        {
            if (File.Exists(UserFolders.SettingsFile))
                Settings = JsonSerializer.Deserialize<Settings>(File.ReadAllText(UserFolders.SettingsFile), JsonOptions) ?? new();
        }
        catch
        {
            Settings = new();
        }
    }

    public static void Save()
    {
        try
        {
            Directory.CreateDirectory(UserFolders.SystemDir);
            File.WriteAllText(UserFolders.SettingsFile, JsonSerializer.Serialize(Settings, JsonOptions));
        }
        catch
        {
            // Einstellungen sind nicht kritisch – Fehler beim Speichern ignorieren.
        }
    }

    /// <summary>Ändert eine Einstellung, speichert sie und benachrichtigt alle Beobachter.</summary>
    public static void Set(string what, Action<Settings> change)
    {
        change(Settings);
        Save();
        Changed?.Invoke(what);
    }

    public static bool HasPassword => Settings.PasswordHash.Length > 0;

    public static string HashPassword(string password) =>
        password.Length == 0 ? "" : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("w12:" + password)));

    public static bool CheckPassword(string password) => !HasPassword || HashPassword(password) == Settings.PasswordHash;

    public static void AddRecentFile(string path)
    {
        Set("recent", s =>
        {
            s.RecentFiles.Remove(path);
            s.RecentFiles.Insert(0, path);
            if (s.RecentFiles.Count > 12) s.RecentFiles.RemoveRange(12, s.RecentFiles.Count - 12);
        });
    }

    public static string FormatTime(DateTime t, bool? seconds = null)
    {
        var withSeconds = seconds ?? Settings.ShowSeconds;
        var fmt = Settings.Use24h ? (withSeconds ? "HH:mm:ss" : "HH:mm") : (withSeconds ? "h:mm:ss tt" : "h:mm tt");
        return t.ToString(fmt, German);
    }

    public static readonly System.Globalization.CultureInfo German = new("de-DE");

    public static string FormatSize(long bytes)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double value = bytes;
        var unit = 0;
        while (value >= 1024 && unit < units.Length - 1) { value /= 1024; unit++; }
        return unit == 0 ? $"{bytes} B" : $"{value.ToString("0.#", German)} {units[unit]}";
    }
}
