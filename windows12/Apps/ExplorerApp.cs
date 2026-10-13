using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Controls.Templates;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Apps;

public static class ExplorerPaths
{
    /// <summary>Virtueller Pfad für „Dieser PC“ (Laufwerksübersicht).</summary>
    public const string ThisPc = "::pc";
}

/// <summary>Datei-Explorer: Navigation, Ordner/Dateien anlegen, kopieren, verschieben, umbenennen, löschen.</summary>
public sealed class ExplorerApp : AppView
{
    /// <summary>Ein Eintrag in der Liste (Klasse statt record: die Auswahl soll per Referenz vergleichen).</summary>
    sealed class Entry(string name, string path, bool isDirectory, DateTime modified, long size, string type)
    {
        public string Name { get; } = name;
        public string Path { get; } = path;
        public bool IsDirectory { get; } = isDirectory;
        public DateTime Modified { get; } = modified;
        public long Size { get; } = size;
        public string Type { get; } = type;
    }

    // Explorer-weite Zwischenablage für Dateien.
    static readonly List<string> ClipboardPaths = [];
    static bool _clipboardCut;

    readonly Stack<string> _back = new();
    readonly Stack<string> _forward = new();
    readonly TextBox _address = new() { VerticalContentAlignment = VerticalAlignment.Center };
    readonly TextBox _filter = new() { PlaceholderText = "Durchsuchen", Width = 220, VerticalContentAlignment = VerticalAlignment.Center };
    readonly ListBox _list;
    readonly ContentControl _main = new();
    readonly TextBlock _status = UI.Sub("", 12);
    readonly StackPanel _commands = new() { Orientation = Orientation.Horizontal, Spacing = 2 };
    readonly Button _backButton;
    readonly Button _forwardButton;
    readonly Control _listView;
    FileSystemWatcher? _watcher;
    string _path = ExplorerPaths.ThisPc;
    string _sort = "name";
    bool _sortDescending;
    IDisposable? _pendingRefresh;

    public ExplorerApp(string? start)
    {
        _backButton = UI.IconButton("arrow-left", GoBack, "Zurück (Alt+←)");
        _forwardButton = UI.IconButton("arrow-right", GoForward, "Vorwärts (Alt+→)");
        var up = UI.IconButton("arrow-up", GoUp, "Übergeordneter Ordner");
        var refresh = UI.IconButton("refresh", Refresh, "Aktualisieren (F5)");

        _address.KeyDown += (_, e) =>
        {
            if (e.Key != Key.Enter) return;
            e.Handled = true;
            var target = _address.Text?.Trim() ?? "";
            if (target.Equals("Dieser PC", StringComparison.OrdinalIgnoreCase)) target = ExplorerPaths.ThisPc;
            Navigate(target);
        };
        _filter.TextChanged += (_, _) => Refresh();

        var navBar = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,Auto,Auto,*,Auto"),
            Margin = new Thickness(8, 6),
            Children =
            {
                _backButton.Col(0), _forwardButton.Col(1), up.Col(2), refresh.Col(3),
                _address.Margin(8, 0, 8, 0).Col(4),
                _filter.Col(5),
            },
        };

        var commandBar = new Border
        {
            Padding = new Thickness(8, 4),
            BorderThickness = new Thickness(0, 1, 0, 1),
            Child = _commands,
        }.Res(Border.BorderBrushProperty, "W12.Divider");

        _list = new ListBox
        {
            SelectionMode = SelectionMode.Multiple,
            ItemTemplate = new FuncDataTemplate<Entry>((e, _) => e == null ? new Border() : Row(e)),
        };
        _list.DoubleTapped += (_, _) => OpenSelected();
        _list.SelectionChanged += (_, _) => UpdateStatus();
        _list.KeyDown += ListKeyDown;
        _list.ContextMenu = new ContextMenu();
        _list.ContextMenu.Opening += (_, _) => _list.ContextMenu.ItemsSource = BuildContextMenu();

        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,150,150,90"),
            Margin = new Thickness(12, 4, 24, 4),
            Children =
            {
                HeaderButton("Name", "name").Col(0),
                HeaderButton("Geändert am", "date").Col(1),
                HeaderButton("Typ", "type").Col(2),
                HeaderButton("Größe", "size").Col(3),
            },
        };
        _listView = new DockPanel { Children = { header.Dock(Avalonia.Controls.Dock.Top), _list } };

        var body = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("210,*"),
            Children =
            {
                new Border { Child = UI.Scroll(Sidebar()), BorderThickness = new Thickness(0, 0, 1, 0), Padding = new Thickness(6, 8) }
                    .Res(Border.BorderBrushProperty, "W12.Divider").Col(0),
                _main.Col(1),
            },
        };

        var statusBar = new Border { Child = _status, Padding = new Thickness(14, 5) };

        Content = new DockPanel
        {
            Children =
            {
                navBar.Dock(Avalonia.Controls.Dock.Top),
                commandBar.Dock(Avalonia.Controls.Dock.Top),
                statusBar.Dock(Avalonia.Controls.Dock.Bottom),
                body,
            },
        };

        AddHandler(KeyDownEvent, (_, e) =>
        {
            if (e.KeyModifiers == KeyModifiers.Alt && e.Key == Key.Left) { GoBack(); e.Handled = true; }
            else if (e.KeyModifiers == KeyModifiers.Alt && e.Key == Key.Right) { GoForward(); e.Handled = true; }
            else if (e.Key == Key.F5) { Refresh(); e.Handled = true; }
        }, Avalonia.Interactivity.RoutingStrategies.Tunnel);

        RecycleBin.Changed += OnRecycleChanged;
        Navigate(string.IsNullOrEmpty(start) ? ExplorerPaths.ThisPc : start, addToHistory: false);
    }

    void OnRecycleChanged()
    {
        if (_path == UserFolders.RecycleBin) Dispatcher.UIThread.Post(Refresh);
    }

    public override void OnArgument(string? argument)
    {
        if (!string.IsNullOrEmpty(argument)) Navigate(argument);
    }

    public override void OnActivated() => _list.Focus();

    public override void OnClosed()
    {
        _watcher?.Dispose();
        RecycleBin.Changed -= OnRecycleChanged;
    }

    bool IsRecycleBin => _path == UserFolders.RecycleBin;

    // ------------------------------------------------------------ Navigation

    void Navigate(string path, bool addToHistory = true)
    {
        if (path != ExplorerPaths.ThisPc)
        {
            try
            {
                path = Path.GetFullPath(path);
            }
            catch
            {
                // Ungültiger Pfad – unten abgefangen.
            }
            if (!Directory.Exists(path))
            {
                _ = Shell.Dialogs.MessageAsync("Explorer", $"„{path}“ wurde nicht gefunden.", "OK");
                _address.Text = DisplayPath(_path);
                return;
            }
        }

        if (addToHistory && path != _path)
        {
            _back.Push(_path);
            _forward.Clear();
        }
        _path = path;
        _filter.Text = "";
        Watch();
        Refresh();
    }

    void GoBack()
    {
        if (_back.Count == 0) return;
        _forward.Push(_path);
        Navigate(_back.Pop(), addToHistory: false);
    }

    void GoForward()
    {
        if (_forward.Count == 0) return;
        _back.Push(_path);
        Navigate(_forward.Pop(), addToHistory: false);
    }

    void GoUp()
    {
        if (_path == ExplorerPaths.ThisPc) return;
        var parent = Directory.GetParent(_path);
        Navigate(parent?.FullName ?? ExplorerPaths.ThisPc);
    }

    static string DisplayPath(string path) => path == ExplorerPaths.ThisPc ? "Dieser PC" : path;

    void Watch()
    {
        _watcher?.Dispose();
        _watcher = null;
        if (_path == ExplorerPaths.ThisPc) return;
        try
        {
            _watcher = new FileSystemWatcher(_path) { EnableRaisingEvents = true };
            FileSystemEventHandler changed = (_, _) => ScheduleRefresh();
            _watcher.Created += changed;
            _watcher.Deleted += changed;
            _watcher.Changed += changed;
            _watcher.Renamed += (_, _) => ScheduleRefresh();
        }
        catch
        {
            // Manche Ordner lassen sich nicht überwachen – dann nur manuell aktualisieren.
        }
    }

    void ScheduleRefresh() => Dispatcher.UIThread.Post(() =>
    {
        _pendingRefresh?.Dispose();
        _pendingRefresh = DispatcherTimer.RunOnce(Refresh, TimeSpan.FromMilliseconds(250));
    });

    // ------------------------------------------------------------ Anzeige

    void Refresh()
    {
        _address.Text = DisplayPath(_path);
        _backButton.IsEnabled = _back.Count > 0;
        _forwardButton.IsEnabled = _forward.Count > 0;
        SetTitle(_path == ExplorerPaths.ThisPc ? "Dieser PC" : IsRecycleBin ? "Papierkorb" : Path.GetFileName(_path.TrimEnd(Path.DirectorySeparatorChar)) is { Length: > 0 } n ? n : _path);
        BuildCommands();

        if (_path == ExplorerPaths.ThisPc)
        {
            _main.Content = ThisPcView();
            _status.Text = "";
            return;
        }

        _main.Content = _listView;
        var selected = Selected().Select(e => e.Path).ToHashSet();
        var entries = LoadEntries();
        _list.SelectedItems?.Clear();
        _list.ItemsSource = entries;
        foreach (var e in entries.Where(e => selected.Contains(e.Path))) _list.SelectedItems?.Add(e);
        UpdateStatus();
    }

    List<Entry> LoadEntries()
    {
        var filter = _filter.Text?.Trim() ?? "";
        var result = new List<Entry>();
        try
        {
            foreach (var info in new DirectoryInfo(_path).EnumerateFileSystemInfos())
            {
                if (info.Name.StartsWith('.') && _path != UserFolders.Root) continue;
                if (filter.Length > 0 && !info.Name.Contains(filter, StringComparison.OrdinalIgnoreCase)) continue;
                var isDir = info is DirectoryInfo;
                var type = IsRecycleBin
                    ? "Aus: " + (Path.GetDirectoryName(RecycleBin.OriginalPath(info.FullName) ?? "") ?? "?")
                    : isDir ? "Dateiordner" : FileOps.TypeName(info.FullName);
                result.Add(new Entry(info.Name, info.FullName, isDir, info.LastWriteTime, isDir ? -1 : ((FileInfo)info).Length, type));
            }
        }
        catch (Exception ex)
        {
            _status.Text = $"Kein Zugriff: {ex.Message}";
        }

        IEnumerable<Entry> sorted = _sort switch
        {
            "date" => result.OrderBy(e => e.Modified),
            "type" => result.OrderBy(e => e.Type),
            "size" => result.OrderBy(e => e.Size),
            _ => result.OrderBy(e => e.Name, StringComparer.CurrentCultureIgnoreCase),
        };
        if (_sortDescending) sorted = sorted.Reverse();
        return sorted.OrderBy(e => e.IsDirectory ? 0 : 1).ToList();
    }

    void UpdateStatus()
    {
        if (_path == ExplorerPaths.ThisPc) return;
        var count = (_list.ItemsSource as List<Entry>)?.Count ?? 0;
        var selected = Selected();
        var text = count == 1 ? "1 Element" : $"{count} Elemente";
        if (selected.Count > 0)
        {
            text += $"   |   {selected.Count} ausgewählt";
            var bytes = selected.Where(e => !e.IsDirectory).Sum(e => e.Size);
            if (bytes > 0) text += $"   {Sys.FormatSize(bytes)}";
        }
        _status.Text = text;
    }

    Control Row(Entry e)
    {
        var name = UI.H(10, Icons.ForFile(e.Path, 18), UI.Text(e.Name, 13).VCenter());
        return new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,150,150,90"),
            Background = Brushes.Transparent,
            Children =
            {
                name.Col(0),
                UI.Sub(e.Modified.ToString("dd.MM.yyyy HH:mm", Sys.German), 12).VCenter().Col(1),
                UI.Sub(e.Type, 12).VCenter().Col(2),
                UI.Sub(e.IsDirectory ? "" : Sys.FormatSize(e.Size), 12).VCenter().Col(3),
            },
        };
    }

    Button HeaderButton(string text, string key)
    {
        var b = UI.Flat(UI.Sub(text, 12), () =>
        {
            if (_sort == key) _sortDescending = !_sortDescending;
            else
            {
                _sort = key;
                _sortDescending = false;
            }
            Refresh();
        });
        b.Padding = new Thickness(4, 2);
        b.HorizontalAlignment = HorizontalAlignment.Left;
        return b;
    }

    Control Sidebar()
    {
        var panel = UI.V(1);
        panel.Children.Add(UI.Sub("Schnellzugriff", 11).Margin(10, 4, 0, 4));
        foreach (var (name, path, icon) in UserFolders.QuickAccess)
            panel.Children.Add(UI.IconTextButton(icon, name, () => Navigate(path)));
        panel.Children.Add(UI.Divider());
        panel.Children.Add(UI.IconTextButton("pc", "Dieser PC", () => Navigate(ExplorerPaths.ThisPc)));
        foreach (var drive in Shell_SafeDrives())
            panel.Children.Add(UI.IconTextButton("drive", DriveLabel(drive), () => Navigate(drive)).Margin(14, 0, 0, 0));
        panel.Children.Add(UI.IconTextButton("home", "Windows 12-Ordner", () => Navigate(UserFolders.Root)));
        panel.Children.Add(UI.Divider());
        panel.Children.Add(UI.IconTextButton("trash", "Papierkorb", () => Navigate(UserFolders.RecycleBin)));
        foreach (var c in panel.Children.OfType<Button>()) c.HorizontalAlignment = HorizontalAlignment.Stretch;
        return panel;
    }

    static IEnumerable<string> Shell_SafeDrives() => Windows12.Shell.DialogHost.SafeDrives();

    static string DriveLabel(string drive) => drive == "/" ? "Dateisystem (/)" : $"Lokaler Datenträger ({drive.TrimEnd('\\')})";

    Control ThisPcView()
    {
        var folders = new WrapPanel();
        foreach (var (name, path, icon) in UserFolders.QuickAccess)
        {
            var p = path;
            var b = UI.Flat(UI.H(12, Icons.Filled("folder", 40, Icons.Gradient(Color.Parse("#FFD86B"), Color.Parse("#F2A93B"))),
                UI.V(2, UI.Text(name, 13), UI.Sub(Count(path), 12)).VCenter()), () => Navigate(p));
            b.Width = 220;
            b.Margin = new Thickness(0, 0, 8, 8);
            folders.Children.Add(b);
        }

        var drives = new WrapPanel();
        foreach (var drive in Shell_SafeDrives())
        {
            var d = drive;
            var info = SafeDriveInfo(drive);
            var bar = new ProgressBar { Minimum = 0, Maximum = 100, Height = 6, Width = 200 };
            var details = UI.Sub("", 12);
            if (info != null)
            {
                bar.Value = 100.0 * (info.TotalSize - info.AvailableFreeSpace) / Math.Max(1, info.TotalSize);
                details.Text = $"{Sys.FormatSize(info.AvailableFreeSpace)} frei von {Sys.FormatSize(info.TotalSize)}";
            }
            var b = UI.Flat(UI.H(12, Icons.Glyph("drive", 40), UI.V(4, UI.Text(DriveLabel(drive), 13), bar, details).VCenter()), () => Navigate(d));
            b.Width = 300;
            b.Margin = new Thickness(0, 0, 8, 8);
            drives.Children.Add(b);
        }

        return UI.Scroll(UI.V(10,
            UI.Text("Ordner", 14, FontWeight.SemiBold), folders,
            UI.Text("Geräte und Laufwerke", 14, FontWeight.SemiBold), drives).Margin(20, 16, 20, 16));
    }

    static DriveInfo? SafeDriveInfo(string drive)
    {
        try
        {
            var info = new DriveInfo(drive);
            return info.IsReady ? info : null;
        }
        catch
        {
            return null;
        }
    }

    static string Count(string path)
    {
        try
        {
            var n = Directory.EnumerateFileSystemEntries(path).Count();
            return n == 1 ? "1 Element" : $"{n} Elemente";
        }
        catch
        {
            return "";
        }
    }

    // ------------------------------------------------------------ Befehle

    void BuildCommands()
    {
        _commands.Children.Clear();
        if (_path == ExplorerPaths.ThisPc)
        {
            _commands.Children.Add(UI.IconTextButton("settings", "Einstellungen öffnen", () => Shell.Launch("settings", "info")));
            return;
        }

        if (IsRecycleBin)
        {
            _commands.Children.Add(UI.IconTextButton("restart", "Wiederherstellen", RestoreSelected));
            _commands.Children.Add(UI.IconTextButton("trash", "Papierkorb leeren", EmptyBin));
            _commands.Children.Add(UI.IconTextButton("close", "Endgültig löschen", DeleteSelected));
            return;
        }

        var newButton = UI.IconTextButton("plus", "Neu", () => { });
        newButton.Flyout = new MenuFlyout { ItemsSource = new[] { MenuItem("Ordner", "folder-plus", NewFolder), MenuItem("Textdokument", "file-plus", NewTextFile) } };
        _commands.Children.Add(newButton);
        _commands.Children.Add(Separator());
        _commands.Children.Add(UI.IconButton("cut", () => CopySelected(cut: true), "Ausschneiden (Strg+X)"));
        _commands.Children.Add(UI.IconButton("copy", () => CopySelected(cut: false), "Kopieren (Strg+C)"));
        _commands.Children.Add(UI.IconButton("paste", Paste, "Einfügen (Strg+V)"));
        _commands.Children.Add(UI.IconButton("rename", RenameSelected, "Umbenennen (F2)"));
        _commands.Children.Add(UI.IconButton("trash", DeleteSelected, "Löschen (Entf)"));
        _commands.Children.Add(Separator());
        _commands.Children.Add(UI.IconTextButton("terminal", "Terminal", () => Shell.Launch("terminal", _path)));
        _commands.Children.Add(UI.IconTextButton("info", "Eigenschaften", () =>
        {
            if (Selected().FirstOrDefault() is { } e) ShowProperties(e.Path);
            else ShowProperties(_path);
        }));
    }

    static Border Separator() => new Border { Width = 1, Margin = new Thickness(6, 6) }.Res(Border.BackgroundProperty, "W12.Divider");

    static MenuItem MenuItem(string header, string icon, Action click, bool enabled = true)
    {
        var item = new MenuItem { Header = header, Icon = Icons.Glyph(icon, 14), IsEnabled = enabled };
        item.Click += (_, _) => click();
        return item;
    }

    List<Control> BuildContextMenu()
    {
        var selected = Selected();
        var items = new List<Control>();
        if (_path == ExplorerPaths.ThisPc) return items;

        if (IsRecycleBin)
        {
            if (selected.Count > 0)
            {
                items.Add(MenuItem("Wiederherstellen", "restart", RestoreSelected));
                items.Add(MenuItem("Endgültig löschen", "trash", DeleteSelected));
            }
            items.Add(MenuItem("Papierkorb leeren", "trash", EmptyBin, RecycleBin.Count > 0));
            return items;
        }

        if (selected.Count > 0)
        {
            items.Add(MenuItem("Öffnen", "open", OpenSelected));
            if (selected.Count == 1 && !selected[0].IsDirectory)
            {
                var path = selected[0].Path;
                var openWith = new MenuItem { Header = "Öffnen mit", Icon = Icons.Glyph("apps", 14) };
                openWith.Items.Add(MenuItem("Editor", "notepad", () => Shell.Launch("notepad", path)));
                openWith.Items.Add(MenuItem("Fotos", "image", () => Shell.Launch("photos", path), FileOps.IsImage(path)));
                openWith.Items.Add(MenuItem("Paint", "paint", () => Shell.Launch("paint", path), FileOps.IsImage(path)));
                openWith.Items.Add(MenuItem("Standard-App des Systems", "pc", () => OpenWithSystem(path)));
                items.Add(openWith);
            }
            items.Add(new Separator());
            items.Add(MenuItem("Ausschneiden", "cut", () => CopySelected(true)));
            items.Add(MenuItem("Kopieren", "copy", () => CopySelected(false)));
        }
        items.Add(MenuItem("Einfügen", "paste", Paste, ClipboardPaths.Count > 0));
        if (selected.Count > 0)
        {
            items.Add(MenuItem("Umbenennen", "rename", RenameSelected, selected.Count == 1));
            items.Add(MenuItem("Löschen", "trash", DeleteSelected));
            items.Add(new Separator());
            items.Add(MenuItem("Eigenschaften", "info", () => ShowProperties(selected[0].Path)));
        }
        else
        {
            items.Add(new Separator());
            items.Add(MenuItem("Neuer Ordner", "folder-plus", NewFolder));
            items.Add(MenuItem("Neues Textdokument", "file-plus", NewTextFile));
            items.Add(MenuItem("Aktualisieren", "refresh", Refresh));
            items.Add(MenuItem("Im Terminal öffnen", "terminal", () => Shell.Launch("terminal", _path)));
        }
        return items;
    }

    void ListKeyDown(object? sender, KeyEventArgs e)
    {
        var ctrl = e.KeyModifiers.HasFlag(KeyModifiers.Control);
        switch (e.Key)
        {
            case Key.Enter: OpenSelected(); break;
            case Key.Delete: DeleteSelected(); break;
            case Key.F2: RenameSelected(); break;
            case Key.Back: GoUp(); break;
            case Key.C when ctrl: CopySelected(false); break;
            case Key.X when ctrl: CopySelected(true); break;
            case Key.V when ctrl: Paste(); break;
            case Key.A when ctrl: _list.SelectAll(); break;
            default: return;
        }
        e.Handled = true;
    }

    List<Entry> Selected() => _list.SelectedItems?.OfType<Entry>()
        .Where(e => File.Exists(e.Path) || Directory.Exists(e.Path))
        .DistinctBy(e => e.Path)
        .ToList() ?? [];

    void OpenSelected()
    {
        var selected = Selected();
        if (selected.Count == 0) return;
        if (IsRecycleBin)
        {
            ShowProperties(selected[0].Path);
            return;
        }
        if (selected[0].IsDirectory)
        {
            Navigate(selected[0].Path);
            return;
        }
        foreach (var e in selected.Where(e => !e.IsDirectory)) Shell.OpenPath(e.Path);
    }

    static void OpenWithSystem(string path)
    {
        try
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            _ = Windows12.Shell.ShellWindow.Current.Dialogs.MessageAsync("Öffnen nicht möglich", ex.Message, "OK");
        }
    }

    async void NewFolder()
    {
        var name = await Shell.Dialogs.PromptAsync("Neuer Ordner", "Name des Ordners:", "Neuer Ordner", "Erstellen");
        if (string.IsNullOrWhiteSpace(name)) return;
        await Run(() => Directory.CreateDirectory(FileOps.UniquePath(Path.Combine(_path, name.Trim()))));
    }

    async void NewTextFile()
    {
        var name = await Shell.Dialogs.PromptAsync("Neues Textdokument", "Dateiname:", "Neues Textdokument.txt", "Erstellen");
        if (string.IsNullOrWhiteSpace(name)) return;
        name = name.Trim();
        if (Path.GetExtension(name).Length == 0) name += ".txt";
        await Run(() => File.WriteAllText(FileOps.UniquePath(Path.Combine(_path, name)), ""));
    }

    void CopySelected(bool cut)
    {
        var selected = Selected();
        if (selected.Count == 0) return;
        ClipboardPaths.Clear();
        ClipboardPaths.AddRange(selected.Select(e => e.Path));
        _clipboardCut = cut;
        _status.Text = $"{selected.Count} Element(e) {(cut ? "ausgeschnitten" : "kopiert")}";
    }

    async void Paste()
    {
        if (ClipboardPaths.Count == 0 || IsRecycleBin) return;
        await Run(() =>
        {
            foreach (var source in ClipboardPaths.ToList())
            {
                if (!File.Exists(source) && !Directory.Exists(source)) continue;
                var target = FileOps.UniquePath(Path.Combine(_path, Path.GetFileName(source)));
                if (Directory.Exists(source) && (_path + Path.DirectorySeparatorChar).StartsWith(source + Path.DirectorySeparatorChar))
                    throw new IOException("Ein Ordner kann nicht in sich selbst eingefügt werden.");
                if (_clipboardCut) FileOps.Move(source, target);
                else FileOps.Copy(source, target);
            }
            if (_clipboardCut) ClipboardPaths.Clear();
        });
    }

    async void RenameSelected()
    {
        var selected = Selected();
        if (selected.Count != 1) return;
        var entry = selected[0];
        var name = await Shell.Dialogs.PromptAsync("Umbenennen", "Neuer Name:", entry.Name, "Umbenennen");
        if (string.IsNullOrWhiteSpace(name) || name == entry.Name) return;
        await Run(() => FileOps.Move(entry.Path, Path.Combine(_path, name.Trim())));
    }

    async void DeleteSelected()
    {
        var selected = Selected();
        if (selected.Count == 0) return;
        if (IsRecycleBin)
        {
            var what = selected.Count == 1 ? $"„{selected[0].Name}“" : $"diese {selected.Count} Elemente";
            if (await Shell.Dialogs.MessageAsync("Endgültig löschen", $"Möchtest du {what} endgültig löschen?", "Ja", "Nein") != "Ja") return;
            await Run(() =>
            {
                foreach (var e in selected) RecycleBin.DeletePermanently(e.Path);
            });
            return;
        }
        await Run(() =>
        {
            foreach (var e in selected) RecycleBin.Delete(e.Path);
        });
        _status.Text = $"{selected.Count} Element(e) in den Papierkorb verschoben";
    }

    async void RestoreSelected()
    {
        var selected = Selected();
        await Run(() =>
        {
            foreach (var e in selected) RecycleBin.Restore(e.Path);
        });
    }

    async void EmptyBin()
    {
        if (RecycleBin.Count == 0) return;
        if (await Shell.Dialogs.MessageAsync("Papierkorb leeren", "Sollen alle Elemente endgültig gelöscht werden?", "Ja", "Nein") != "Ja") return;
        await Run(RecycleBin.Empty);
    }

    /// <summary>Führt eine Dateioperation aus und zeigt Fehler als Dialog an.</summary>
    async Task Run(Action action)
    {
        try
        {
            action();
        }
        catch (Exception ex)
        {
            await Shell.Dialogs.MessageAsync("Vorgang nicht möglich", ex.Message, "OK");
        }
        Refresh();
    }

    /// <summary>Eigenschaften-Dialog für eine Datei oder einen Ordner.</summary>
    public static async void ShowProperties(string path)
    {
        var shell = Windows12.Shell.ShellWindow.Current;
        var isDir = Directory.Exists(path);
        FileSystemInfo info = isDir ? new DirectoryInfo(path) : new FileInfo(path);
        if (!info.Exists) return;

        string size;
        if (isDir)
        {
            long total = 0;
            int files = 0, dirs = 0;
            try
            {
                foreach (var f in new DirectoryInfo(path).EnumerateFiles("*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true }).Take(20000))
                {
                    total += f.Length;
                    files++;
                }
                dirs = new DirectoryInfo(path).EnumerateDirectories("*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true }).Take(20000).Count();
            }
            catch
            {
                // Teilweise unzugänglich – Zwischenstand anzeigen.
            }
            size = $"{Sys.FormatSize(total)}  ({files} Dateien, {dirs} Ordner)";
        }
        else
        {
            var len = ((FileInfo)info).Length;
            size = $"{Sys.FormatSize(len)}  ({len:N0} Bytes)";
        }

        Control Row(string label, string value) => new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("120,*"),
            Children = { UI.Sub(label, 13).Col(0), new SelectableTextBlock { Text = value, FontSize = 13, TextWrapping = TextWrapping.Wrap }.Col(1) },
        };

        var body = UI.V(10,
            UI.H(14, Icons.ForFile(path, 40), UI.Text(info.Name, 16, FontWeight.SemiBold).VCenter()),
            UI.Divider(),
            Row("Typ:", FileOps.TypeName(path)),
            Row("Ort:", Path.GetDirectoryName(path) ?? path),
            Row("Größe:", size),
            UI.Divider(),
            Row("Erstellt:", info.CreationTime.ToString("dddd, d. MMMM yyyy, HH:mm:ss", Sys.German)),
            Row("Geändert:", info.LastWriteTime.ToString("dddd, d. MMMM yyyy, HH:mm:ss", Sys.German)),
            Row("Attribute:", info.Attributes.HasFlag(FileAttributes.ReadOnly) ? "Schreibgeschützt" : "Normal"));
        if (RecycleBin.IsInBin(path))
            body.Children.Add(Row("Ursprung:", RecycleBin.OriginalPath(path) ?? "unbekannt"));

        await shell.Dialogs.ShowAsync($"Eigenschaften von {info.Name}", body, ["OK"], width: 520);
    }
}
