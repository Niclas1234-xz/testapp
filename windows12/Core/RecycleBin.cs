using System.Text.Json;

namespace Windows12.Core;

/// <summary>Papierkorb: gelöschte Dateien werden verschoben und können wiederhergestellt werden.</summary>
public static class RecycleBin
{
    static Dictionary<string, string>? _index;

    static Dictionary<string, string> Index
    {
        get
        {
            if (_index != null) return _index;
            try
            {
                _index = File.Exists(UserFolders.RecycleIndex)
                    ? JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(UserFolders.RecycleIndex)) ?? []
                    : [];
            }
            catch
            {
                _index = [];
            }
            return _index;
        }
    }

    static void SaveIndex() => File.WriteAllText(UserFolders.RecycleIndex, JsonSerializer.Serialize(Index));

    public static event Action? Changed;

    public static bool IsInBin(string path) =>
        Path.GetFullPath(path).StartsWith(Path.GetFullPath(UserFolders.RecycleBin) + Path.DirectorySeparatorChar, StringComparison.Ordinal);

    public static int Count => Directory.Exists(UserFolders.RecycleBin) ? Directory.EnumerateFileSystemEntries(UserFolders.RecycleBin).Count() : 0;

    public static string? OriginalPath(string pathInBin) => Index.GetValueOrDefault(Path.GetFileName(pathInBin));

    /// <summary>Verschiebt eine Datei oder einen Ordner in den Papierkorb.</summary>
    public static void Delete(string path)
    {
        if (IsInBin(path))
        {
            DeletePermanently(path);
            return;
        }

        var target = FileOps.UniquePath(Path.Combine(UserFolders.RecycleBin, Path.GetFileName(path)));
        FileOps.Move(path, target);
        Index[Path.GetFileName(target)] = Path.GetFullPath(path);
        SaveIndex();
        Changed?.Invoke();
    }

    public static void DeletePermanently(string path)
    {
        if (Directory.Exists(path)) Directory.Delete(path, true);
        else File.Delete(path);
        Index.Remove(Path.GetFileName(path));
        SaveIndex();
        Changed?.Invoke();
    }

    public static void Restore(string pathInBin)
    {
        var name = Path.GetFileName(pathInBin);
        var original = Index.GetValueOrDefault(name) ?? Path.Combine(UserFolders.Desktop, name);
        Directory.CreateDirectory(Path.GetDirectoryName(original)!);
        FileOps.Move(pathInBin, FileOps.UniquePath(original));
        Index.Remove(name);
        SaveIndex();
        Changed?.Invoke();
    }

    public static void Empty()
    {
        foreach (var entry in Directory.EnumerateFileSystemEntries(UserFolders.RecycleBin))
        {
            if (Directory.Exists(entry)) Directory.Delete(entry, true);
            else File.Delete(entry);
        }
        Index.Clear();
        SaveIndex();
        Changed?.Invoke();
    }
}

/// <summary>Hilfsfunktionen für Dateioperationen.</summary>
public static class FileOps
{
    public static readonly string[] TextExtensions =
        [".txt", ".md", ".log", ".json", ".xml", ".csv", ".ini", ".cfg", ".cs", ".js", ".ts", ".tsx", ".py", ".html", ".css", ".yml", ".yaml", ".sh", ".bat", ".ps1", ".axaml", ".xaml", ".csproj", ".sln", ".gitignore", ".toml"];

    public static readonly string[] ImageExtensions = [".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".ico"];

    public static bool IsText(string path) => TextExtensions.Contains(Path.GetExtension(path).ToLowerInvariant());
    public static bool IsImage(string path) => ImageExtensions.Contains(Path.GetExtension(path).ToLowerInvariant());

    public static string UniquePath(string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path)) return path;
        var dir = Path.GetDirectoryName(path)!;
        var name = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        if (Directory.Exists(path)) { name = Path.GetFileName(path); ext = ""; }
        for (var i = 2; ; i++)
        {
            var candidate = Path.Combine(dir, $"{name} ({i}){ext}");
            if (!File.Exists(candidate) && !Directory.Exists(candidate)) return candidate;
        }
    }

    public static void Move(string source, string target)
    {
        if (Directory.Exists(source))
        {
            try
            {
                Directory.Move(source, target);
            }
            catch (IOException)
            {
                // Über Laufwerksgrenzen hinweg: kopieren und löschen.
                CopyDirectory(source, target);
                Directory.Delete(source, true);
            }
        }
        else
        {
            File.Move(source, target);
        }
    }

    public static void Copy(string source, string target)
    {
        if (Directory.Exists(source)) CopyDirectory(source, target);
        else File.Copy(source, target);
    }

    public static void CopyDirectory(string source, string target)
    {
        Directory.CreateDirectory(target);
        foreach (var file in Directory.GetFiles(source))
            File.Copy(file, Path.Combine(target, Path.GetFileName(file)));
        foreach (var dir in Directory.GetDirectories(source))
            CopyDirectory(dir, Path.Combine(target, Path.GetFileName(dir)));
    }

    public static string TypeName(string path)
    {
        if (Directory.Exists(path)) return "Dateiordner";
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".txt" => "Textdokument",
            ".md" => "Markdown-Dokument",
            ".png" or ".jpg" or ".jpeg" or ".bmp" or ".gif" or ".webp" => $"{ext[1..].ToUpperInvariant()}-Bild",
            ".exe" => "Anwendung",
            ".zip" => "ZIP-komprimierter Ordner",
            ".pdf" => "PDF-Dokument",
            ".mp3" or ".wav" or ".flac" => "Audiodatei",
            ".mp4" or ".mkv" or ".avi" => "Videodatei",
            "" => "Datei",
            _ => $"{ext[1..].ToUpperInvariant()}-Datei",
        };
    }

    public static string IconFor(string path)
    {
        if (Directory.Exists(path)) return "folder";
        if (IsImage(path)) return "image";
        if (IsText(path)) return "document";
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".mp3" or ".wav" or ".flac" or ".ogg" => "music",
            ".mp4" or ".mkv" or ".avi" or ".mov" => "video",
            ".zip" or ".7z" or ".rar" or ".gz" => "archive",
            ".exe" or ".msi" or ".dll" => "app",
            _ => "file",
        };
    }
}
