using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Controls.Templates;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Transformation;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Modale Dialoge der Shell (Meldungen, Eingaben, Datei öffnen/speichern).</summary>
public sealed class DialogHost : Panel
{
    public bool IsOpen => Children.Count > 0;

    public DialogHost()
    {
        IsVisible = false;
    }

    /// <summary>Zeigt eine Dialogkarte über allem an. Escape ruft <paramref name="onCancel"/> auf.</summary>
    public Border Present(Control card, Action onCancel, Action? onEnter = null)
    {
        card.HorizontalAlignment = HorizontalAlignment.Center;
        card.VerticalAlignment = VerticalAlignment.Center;
        card.Opacity = 0;
        card.RenderTransform = TransformOperations.Parse("scale(0.95)");
        card.Transitions =
        [
            new DoubleTransition { Property = OpacityProperty, Duration = TimeSpan.FromMilliseconds(150) },
            new TransformOperationsTransition { Property = RenderTransformProperty, Duration = TimeSpan.FromMilliseconds(180), Easing = new CubicEaseOut() },
        ];

        var overlay = new Border { Child = card, Background = new SolidColorBrush(Color.Parse("#66000000")) };
        overlay.AddHandler(KeyDownEvent, (_, e) =>
        {
            if (e.Key == Key.Escape)
            {
                e.Handled = true;
                onCancel();
            }
            else if (e.Key == Key.Enter && onEnter != null && e.Source is not TextBox { AcceptsReturn: true } && e.Source is not Button)
            {
                e.Handled = true;
                onEnter();
            }
        }, RoutingStrategies.Tunnel);

        Children.Add(overlay);
        IsVisible = true;
        Dispatcher.UIThread.Post(() =>
        {
            card.Opacity = 1;
            card.RenderTransform = TransformOperations.Parse("scale(1)");
        }, DispatcherPriority.Background);
        return overlay;
    }

    public void Dismiss(Border overlay)
    {
        Children.Remove(overlay);
        IsVisible = Children.Count > 0;
    }

    public static Border DialogCard(Control content, Control? footer, double width)
    {
        var dock = new DockPanel();
        if (footer != null)
        {
            var footerBorder = new Border { Child = footer, Padding = new Thickness(24, 16) }
                .Res(Border.BackgroundProperty, "W12.CardAlt");
            DockPanel.SetDock(footerBorder, Avalonia.Controls.Dock.Bottom);
            dock.Children.Add(footerBorder);
        }
        dock.Children.Add(new Border { Child = content, Padding = new Thickness(24, 22, 24, 22) });

        return new Border
        {
            Width = width,
            CornerRadius = new CornerRadius(10),
            BorderThickness = new Thickness(1),
            ClipToBounds = true,
            BoxShadow = BoxShadows.Parse("0 20 60 0 #80000000"),
            Child = dock,
        }.Res(Border.BackgroundProperty, "W12.PanelSolid").Res(Border.BorderBrushProperty, "W12.PanelBorder");
    }

    /// <summary>Allgemeiner Dialog. Gibt die Beschriftung der gedrückten Schaltfläche zurück (null = abgebrochen).</summary>
    public Task<string?> ShowAsync(string title, Control? body, string[] buttons, Control? focus = null, double width = 460)
    {
        var tcs = new TaskCompletionSource<string?>();
        Border overlay = null!;

        void Finish(string? result)
        {
            if (tcs.Task.IsCompleted) return;
            Dismiss(overlay);
            tcs.SetResult(result);
        }

        var buttonRow = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right };
        Button? first = null;
        for (var i = 0; i < buttons.Length; i++)
        {
            var label = buttons[i];
            var b = UI.Btn(label, () => Finish(label), accent: i == 0);
            first ??= b;
            buttonRow.Children.Add(b);
        }

        var content = UI.V(14, UI.Heading(title, 20));
        if (body != null) content.Children.Add(body);

        // Breite so wählen, dass alle Schaltflächen nebeneinander Platz haben.
        var buttonsWidth = 48 + buttons.Sum(b => Math.Max(90, b.Length * 8.5 + 36) + 8);
        width = Math.Max(width, buttonsWidth);

        overlay = Present(DialogCard(content, buttonRow, width), () => Finish(null), () => Finish(buttons[0]));
        Dispatcher.UIThread.Post(() =>
        {
            if (focus != null) focus.Focus();
            else first?.Focus();
        }, DispatcherPriority.Background);
        return tcs.Task;
    }

    public Task<string?> MessageAsync(string title, string message, params string[] buttons) =>
        ShowAsync(title, UI.Text(message, 14, wrap: true), buttons.Length == 0 ? ["OK"] : buttons);

    /// <summary>Texteingabe. Gibt null zurück, wenn abgebrochen wurde.</summary>
    public async Task<string?> PromptAsync(string title, string label, string initial = "", string ok = "OK", bool password = false)
    {
        var box = new TextBox { Text = initial };
        if (password) box.PasswordChar = '•';
        box.AttachedToVisualTree += (_, _) => Dispatcher.UIThread.Post(box.SelectAll, DispatcherPriority.Background);
        var result = await ShowAsync(title, UI.V(10, UI.Sub(label, 13, wrap: true), box), [ok, "Abbrechen"], box);
        return result == ok ? box.Text ?? "" : null;
    }

    // ------------------------------------------------------------ Datei öffnen / speichern

    public Task<string?> OpenFileAsync(string? startDir = null, string[]? extensions = null, string title = "Öffnen") =>
        FileDialog(false, title, startDir, null, extensions);

    public Task<string?> SaveFileAsync(string? startDir, string defaultName, string title = "Speichern unter") =>
        FileDialog(true, title, startDir, defaultName, null);

    Task<string?> FileDialog(bool save, string title, string? startDir, string? defaultName, string[]? extensions)
    {
        var tcs = new TaskCompletionSource<string?>();
        var dir = startDir != null && Directory.Exists(startDir) ? startDir : UserFolders.Documents;
        Border overlay = null!;

        var pathText = UI.Sub(dir, 12);
        var nameBox = new TextBox { Text = defaultName ?? "", PlaceholderText = "Dateiname" };
        var list = new ListBox
        {
            Height = 290,
            ItemTemplate = new FuncDataTemplate<FileSystemInfo>((fi, _) =>
                fi == null ? new TextBlock() : UI.H(10, Icons.ForFile(fi.FullName, 18), UI.Text(fi.Name, 13).VCenter())),
        };

        void Load(string d)
        {
            try
            {
                var info = new DirectoryInfo(d);
                var dirs = info.EnumerateDirectories().Where(x => !x.Name.StartsWith('.')).OrderBy(x => x.Name).Cast<FileSystemInfo>();
                var files = info.EnumerateFiles().Where(x => !x.Name.StartsWith('.'))
                    .Where(f => extensions == null || extensions.Contains(f.Extension.ToLowerInvariant()))
                    .OrderBy(x => x.Name);
                list.ItemsSource = dirs.Concat(files).ToList();
                dir = d;
                pathText.Text = d;
            }
            catch (Exception ex)
            {
                pathText.Text = $"Kein Zugriff: {ex.Message}";
            }
        }

        void Finish(string? result)
        {
            if (tcs.Task.IsCompleted) return;
            Dismiss(overlay);
            tcs.SetResult(result);
        }

        async void Confirm()
        {
            if (list.SelectedItem is DirectoryInfo di && (!save || string.IsNullOrWhiteSpace(nameBox.Text)))
            {
                Load(di.FullName);
                return;
            }
            var name = nameBox.Text?.Trim() ?? "";
            if (name.Length == 0) return;
            var path = Path.IsPathRooted(name) ? name : Path.Combine(dir, name);
            if (save)
            {
                if (Path.GetExtension(path).Length == 0) path += ".txt";
                if (File.Exists(path) &&
                    await MessageAsync("Speichern bestätigen", $"„{Path.GetFileName(path)}“ ist bereits vorhanden. Möchtest du die Datei ersetzen?", "Ja", "Nein") != "Ja")
                    return;
                Finish(path);
            }
            else if (File.Exists(path))
            {
                Finish(path);
            }
            else if (Directory.Exists(path))
            {
                Load(path);
            }
        }

        list.SelectionChanged += (_, _) =>
        {
            if (list.SelectedItem is FileInfo fi) nameBox.Text = fi.Name;
        };
        list.DoubleTapped += (_, _) =>
        {
            if (list.SelectedItem is DirectoryInfo di) Load(di.FullName);
            else if (list.SelectedItem is FileInfo) Confirm();
        };

        var sidebar = UI.V(2);
        foreach (var (name, path, icon) in UserFolders.QuickAccess)
            sidebar.Children.Add(UI.IconTextButton(icon, name, () => Load(path)));
        sidebar.Children.Add(UI.Divider(4));
        foreach (var drive in SafeDrives())
            sidebar.Children.Add(UI.IconTextButton("drive", drive, () => Load(drive)));

        var up = UI.IconButton("arrow-up", () =>
        {
            if (Directory.GetParent(dir) is { } parent) Load(parent.FullName);
        }, "Übergeordneter Ordner");
        var newFolder = UI.IconButton("folder-plus", async () =>
        {
            var n = await PromptAsync("Neuer Ordner", "Name des Ordners:", "Neuer Ordner", "Erstellen");
            if (string.IsNullOrWhiteSpace(n)) return;
            try
            {
                Directory.CreateDirectory(FileOps.UniquePath(Path.Combine(dir, n)));
                Load(dir);
            }
            catch (Exception ex)
            {
                await MessageAsync("Fehler", ex.Message, "OK");
            }
        }, "Neuer Ordner");

        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*"),
            Children = { up.Col(0), newFolder.Col(1), pathText.VCenter().Margin(8, 0, 0, 0).Col(2) },
        };
        var main = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("170,*"),
            Children =
            {
                UI.Scroll(sidebar).Margin(0, 0, 12, 0).Col(0),
                new Border { Child = list, CornerRadius = new CornerRadius(6), BorderThickness = new Thickness(1) }
                    .Res(Border.BorderBrushProperty, "W12.Divider").Col(1),
            },
        };
        var content = UI.V(12, UI.Heading(title, 20), header, main);

        var footer = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Children =
            {
                nameBox.Margin(0, 0, 12, 0).Col(0),
                UI.H(8, UI.Btn(save ? "Speichern" : "Öffnen", Confirm, accent: true), UI.Btn("Abbrechen", () => Finish(null))).Col(1),
            },
        };

        Load(dir);
        overlay = Present(DialogCard(content, footer, 760), () => Finish(null), Confirm);
        Dispatcher.UIThread.Post(() => (save ? (Control)nameBox : list).Focus(), DispatcherPriority.Background);
        return tcs.Task;
    }

    public static IEnumerable<string> SafeDrives()
    {
        try
        {
            if (!OperatingSystem.IsWindows()) return ["/"];
            return DriveInfo.GetDrives().Where(d => d.IsReady).Select(d => d.Name).ToList();
        }
        catch
        {
            return [];
        }
    }
}
