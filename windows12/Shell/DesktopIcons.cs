using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Apps;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Desktop-Symbole (Dieser PC, Papierkorb und alle Dateien im Desktop-Ordner).</summary>
public sealed class DesktopIcons : Panel
{
    readonly WrapPanel _icons = new() { Orientation = Orientation.Vertical, Margin = new Thickness(8, 10) };
    FileSystemWatcher? _watcher;
    Border? _selected;
    IBrush _foreground = Brushes.White;

    public DesktopIcons()
    {
        Background = Brushes.Transparent;
        Children.Add(_icons);

        PointerPressed += (_, e) =>
        {
            if (e.Handled) return;
            Select(null);
            ShellWindow.Current.WM.Deactivate();
        };
        ContextMenu = BuildDesktopMenu();

        try
        {
            _watcher = new FileSystemWatcher(UserFolders.Desktop) { EnableRaisingEvents = true };
            FileSystemEventHandler changed = (_, _) => Dispatcher.UIThread.Post(Refresh);
            _watcher.Created += changed;
            _watcher.Deleted += changed;
            _watcher.Renamed += (_, _) => Dispatcher.UIThread.Post(Refresh);
        }
        catch
        {
            // Ohne Überwachung wird nur bei Aktionen aktualisiert.
        }

        RecycleBin.Changed += () => Dispatcher.UIThread.Post(Refresh);
        Sys.Changed += what =>
        {
            if (what is "layout" or "wallpaper") Refresh();
        };
        Refresh();
    }

    public void Refresh()
    {
        _icons.Children.Clear();
        _selected = null;
        if (!Sys.Settings.ShowDesktopIcons) return;

        var shell = ShellWindow.Current;
        var light = Appearance.IsLightWallpaper(Sys.Settings.Wallpaper);
        _foreground = light ? new SolidColorBrush(Color.Parse("#1B1B1B")) : Brushes.White;
        _icons.Children.Add(Item(Icons.Glyph("pc", 40, _foreground, 1.5), "Dieser PC", () => shell.OpenPath(ExplorerPaths.ThisPc), null));
        var recycle = AppRegistry.Get("recycle")!;
        _icons.Children.Add(Item(Icons.Glyph("trash", 40, _foreground, 1.5), RecycleBin.Count > 0 ? "Papierkorb (voll)" : "Papierkorb", () => shell.Launch(recycle.Id), null));

        try
        {
            var entries = new DirectoryInfo(UserFolders.Desktop).EnumerateFileSystemInfos()
                .Where(e => !e.Name.StartsWith('.'))
                .OrderBy(e => e is FileInfo)
                .ThenBy(e => e.Name, StringComparer.CurrentCultureIgnoreCase);
            foreach (var entry in entries)
            {
                var path = entry.FullName;
                _icons.Children.Add(Item(Icons.ForFile(path, 42), entry.Name, () => shell.OpenPath(path), path));
            }
        }
        catch
        {
            // Desktop-Ordner nicht lesbar.
        }
    }

    void Select(Border? item)
    {
        if (_selected != null)
        {
            _selected.Background = Brushes.Transparent;
            _selected.BorderBrush = Brushes.Transparent;
        }
        _selected = item;
        if (item != null)
        {
            item.Background = new SolidColorBrush(Color.Parse("#40FFFFFF"));
            item.BorderBrush = new SolidColorBrush(Color.Parse("#60FFFFFF"));
        }
    }

    Border Item(Control icon, string label, Action open, string? path)
    {
        var text = new TextBlock
        {
            Text = label,
            FontSize = 12,
            Foreground = _foreground,
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            TextTrimming = TextTrimming.CharacterEllipsis,
            MaxLines = 2,
            Effect = _foreground == Brushes.White ? new DropShadowEffect { BlurRadius = 4, OffsetX = 0, OffsetY = 1, Color = Colors.Black, Opacity = 0.9 } : null,
        };
        var item = new Border
        {
            Width = 86,
            Height = 92,
            Margin = new Thickness(2),
            Padding = new Thickness(4, 6),
            CornerRadius = new CornerRadius(6),
            BorderThickness = new Thickness(1),
            Background = Brushes.Transparent,
            BorderBrush = Brushes.Transparent,
            Child = UI.V(6, icon.Center(), text),
        };
        icon.HorizontalAlignment = HorizontalAlignment.Center;
        ToolTip.SetTip(item, path ?? label);

        item.PointerEntered += (_, _) =>
        {
            if (_selected != item) item.Background = new SolidColorBrush(Color.Parse("#22FFFFFF"));
        };
        item.PointerExited += (_, _) =>
        {
            if (_selected != item) item.Background = Brushes.Transparent;
        };
        item.PointerPressed += (_, e) =>
        {
            e.Handled = true;
            Select(item);
            if (e.ClickCount == 2 && e.GetCurrentPoint(item).Properties.IsLeftButtonPressed) open();
        };

        var menu = new List<Control> { MenuItem("Öffnen", "open", open) };
        if (path != null)
        {
            menu.Add(MenuItem("Umbenennen", "rename", () => Rename(path)));
            menu.Add(MenuItem("Löschen", "trash", () => Delete(path)));
            menu.Add(new Separator());
            menu.Add(MenuItem("Eigenschaften", "info", () => ExplorerApp.ShowProperties(path)));
        }
        else if (label.StartsWith("Papierkorb"))
        {
            menu.Add(MenuItem("Papierkorb leeren", "trash", async () =>
            {
                if (await ShellWindow.Current.Dialogs.MessageAsync("Papierkorb leeren", "Sollen alle Elemente endgültig gelöscht werden?", "Ja", "Nein") == "Ja")
                    RecycleBin.Empty();
            }));
        }
        item.ContextMenu = new ContextMenu { ItemsSource = menu };
        return item;
    }

    static async void Rename(string path)
    {
        var shell = ShellWindow.Current;
        var name = await shell.Dialogs.PromptAsync("Umbenennen", "Neuer Name:", Path.GetFileName(path), "Umbenennen");
        if (string.IsNullOrWhiteSpace(name) || name == Path.GetFileName(path)) return;
        try
        {
            FileOps.Move(path, Path.Combine(Path.GetDirectoryName(path)!, name));
        }
        catch (Exception ex)
        {
            await shell.Dialogs.MessageAsync("Umbenennen nicht möglich", ex.Message, "OK");
        }
    }

    static async void Delete(string path)
    {
        try
        {
            RecycleBin.Delete(path);
        }
        catch (Exception ex)
        {
            await ShellWindow.Current.Dialogs.MessageAsync("Löschen nicht möglich", ex.Message, "OK");
        }
    }

    ContextMenu BuildDesktopMenu()
    {
        var shell = ShellWindow.Current;
        var menu = new ContextMenu();
        menu.Opening += (_, _) =>
        {
            var newMenu = new MenuItem { Header = "Neu", Icon = Icons.Glyph("plus", 14) };
            newMenu.Items.Add(MenuItem("Ordner", "folder-plus", async () =>
            {
                var name = await shell.Dialogs.PromptAsync("Neuer Ordner", "Name des Ordners:", "Neuer Ordner", "Erstellen");
                if (!string.IsNullOrWhiteSpace(name)) Directory.CreateDirectory(FileOps.UniquePath(Path.Combine(UserFolders.Desktop, name)));
            }));
            newMenu.Items.Add(MenuItem("Textdokument", "file-plus", () =>
            {
                File.WriteAllText(FileOps.UniquePath(Path.Combine(UserFolders.Desktop, "Neues Textdokument.txt")), "");
                Refresh();
            }));

            menu.ItemsSource = new Control[]
            {
                MenuItem(Sys.Settings.ShowDesktopIcons ? "Desktopsymbole ausblenden" : "Desktopsymbole anzeigen", "desktop",
                    () => Sys.Set("layout", s => s.ShowDesktopIcons = !s.ShowDesktopIcons)),
                MenuItem("Aktualisieren", "refresh", Refresh),
                new Separator(),
                newMenu,
                MenuItem("Im Terminal öffnen", "terminal", () => shell.Launch("terminal", UserFolders.Desktop)),
                new Separator(),
                MenuItem("Anzeigeeinstellungen", "pc", () => shell.Launch("settings", "system")),
                MenuItem("Anpassen", "palette", () => shell.Launch("settings", "personalisierung")),
            };
        };
        return menu;
    }

    static MenuItem MenuItem(string header, string icon, Action click)
    {
        var item = new MenuItem { Header = header, Icon = Icons.Glyph(icon, 14) };
        item.Click += (_, _) => click();
        return item;
    }
}
