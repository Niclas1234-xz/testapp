using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>Fotos: Galerie, Bildbetrachter mit Zoom, Drehen, Vor/Zurück und „Als Hintergrund festlegen“.</summary>
public sealed class PhotosApp : AppView
{
    readonly ContentControl _content = new();
    readonly Image _image = new() { Stretch = Stretch.Uniform };
    readonly ScaleTransform _scale = new();
    readonly RotateTransform _rotate = new();
    readonly TranslateTransform _translate = new();
    readonly TextBlock _info = UI.Sub("", 12);
    readonly TextBlock _zoomText = UI.Sub("", 12);
    readonly Control _viewer;
    List<string> _files = [];
    int _index = -1;
    double _zoom = 1;
    Point? _panStart;
    Vector _panOrigin;

    public PhotosApp(string? path)
    {
        _image.RenderTransform = new TransformGroup { Children = { _scale, _rotate, _translate } };
        _image.RenderTransformOrigin = new RelativePoint(0.5, 0.5, RelativeUnit.Relative);

        var stage = new Border
        {
            ClipToBounds = true,
            Background = new SolidColorBrush(Color.Parse("#101010")),
            Child = _image,
            Cursor = new Cursor(StandardCursorType.SizeAll),
        };
        stage.PointerWheelChanged += (_, e) =>
        {
            Zoom(e.Delta.Y > 0 ? 1.15 : 1 / 1.15);
            e.Handled = true;
        };
        stage.PointerPressed += (_, e) =>
        {
            if (e.ClickCount == 2) { ResetView(); return; }
            _panStart = e.GetPosition(stage);
            _panOrigin = new Vector(_translate.X, _translate.Y);
            e.Pointer.Capture(stage);
        };
        stage.PointerMoved += (_, e) =>
        {
            if (_panStart is not { } start) return;
            var delta = e.GetPosition(stage) - start;
            _translate.X = _panOrigin.X + delta.X;
            _translate.Y = _panOrigin.Y + delta.Y;
        };
        stage.PointerReleased += (_, e) =>
        {
            _panStart = null;
            e.Pointer.Capture(null);
        };

        var toolbar = new Border
        {
            Padding = new Thickness(8, 6),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                Children =
                {
                    UI.H(2,
                        UI.IconButton("apps", ShowGallery, "Galerie"),
                        UI.IconButton("arrow-left", () => Step(-1), "Vorheriges Bild (←)"),
                        UI.IconButton("arrow-right", () => Step(1), "Nächstes Bild (→)")).Col(0),
                    _info.VCenter().Margin(12, 0, 12, 0).Col(1),
                    UI.H(2,
                        UI.IconButton("zoom-out", () => Zoom(1 / 1.25), "Verkleinern (-)"),
                        _zoomText.VCenter().Margin(4, 0, 4, 0),
                        UI.IconButton("zoom-in", () => Zoom(1.25), "Vergrößern (+)"),
                        UI.IconButton("rotate", () => _rotate.Angle = (_rotate.Angle + 90) % 360, "Drehen (R)"),
                        UI.IconButton("desktop", SetAsWallpaper, "Als Hintergrund festlegen"),
                        UI.IconButton("paint", () => { if (Current != null) Shell.Launch("paint", Current); }, "In Paint bearbeiten"),
                        UI.IconButton("info", () => { if (Current != null) ExplorerApp.ShowProperties(Current); }, "Dateiinformationen"),
                        UI.IconButton("trash", Delete, "Löschen (Entf)")).Col(2),
                },
            },
        }.Res(Border.BorderBrushProperty, "W12.Divider");

        _viewer = new DockPanel { Children = { toolbar.Dock(Avalonia.Controls.Dock.Top), stage } };
        Content = _content;

        AddHandler(KeyDownEvent, OnKey, RoutingStrategies.Tunnel);
        Focusable = true;

        if (path != null && File.Exists(path)) Open(path);
        else ShowGallery();
    }

    string? Current => _index >= 0 && _index < _files.Count ? _files[_index] : null;

    public override void OnArgument(string? argument)
    {
        if (argument != null && File.Exists(argument)) Open(argument);
    }

    public override void OnActivated() => Focus();

    void OnKey(object? sender, KeyEventArgs e)
    {
        if (_content.Content != _viewer) return;
        switch (e.Key)
        {
            case Key.Left: Step(-1); break;
            case Key.Right: Step(1); break;
            case Key.OemPlus or Key.Add: Zoom(1.25); break;
            case Key.OemMinus or Key.Subtract: Zoom(1 / 1.25); break;
            case Key.D0 or Key.NumPad0: ResetView(); break;
            case Key.R: _rotate.Angle = (_rotate.Angle + 90) % 360; break;
            case Key.Delete: Delete(); break;
            case Key.Escape: ShowGallery(); break;
            default: return;
        }
        e.Handled = true;
    }

    // ------------------------------------------------------------ Galerie

    void ShowGallery()
    {
        SetTitle("Fotos");
        var images = SafeImages(UserFolders.Pictures).Concat(SafeImages(UserFolders.Desktop)).Concat(SafeImages(UserFolders.Downloads)).ToList();
        var grid = new WrapPanel();
        foreach (var file in images)
        {
            var f = file;
            Control thumb;
            try
            {
                using var stream = File.OpenRead(file);
                thumb = new Image { Source = Bitmap.DecodeToWidth(stream, 220), Stretch = Stretch.UniformToFill };
            }
            catch
            {
                thumb = Icons.Glyph("image", 40).Center();
            }
            var tile = new Border { Width = 200, Height = 140, CornerRadius = new CornerRadius(8), ClipToBounds = true, Child = thumb }
                .Res(Border.BackgroundProperty, "W12.Card");
            var button = UI.Flat(UI.V(4, tile, UI.Sub(Path.GetFileName(file), 12)), () => Open(f));
            button.Padding = new Thickness(6);
            button.Width = 214;
            grid.Children.Add(button);
        }

        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Children =
            {
                UI.V(2, UI.Heading("Galerie", 24), UI.Sub($"{images.Count} Bilder aus Bilder, Desktop und Downloads", 12)).Col(0),
                UI.Btn("Bild öffnen …", async () =>
                {
                    var p = await Shell.Dialogs.OpenFileAsync(UserFolders.Pictures, FileOps.ImageExtensions, "Bild öffnen");
                    if (p != null) Open(p);
                }, accent: true).VCenter().Col(1),
            },
        };

        Control body = images.Count > 0
            ? UI.Scroll(grid)
            : UI.V(12, Icons.Glyph("image", 64).Center(), UI.Sub("Noch keine Bilder vorhanden. Speichere eine Zeichnung aus Paint im Ordner „Bilder“ oder öffne ein Bild.", 13, wrap: true).Center()).Center();

        _content.Content = new DockPanel { Margin = new Thickness(20, 16), Children = { header.Margin(0, 0, 0, 16).Dock(Avalonia.Controls.Dock.Top), body } };
    }

    static IEnumerable<string> SafeImages(string dir)
    {
        try
        {
            return Directory.EnumerateFiles(dir).Where(FileOps.IsImage).OrderBy(f => f).ToList();
        }
        catch
        {
            return [];
        }
    }

    // ------------------------------------------------------------ Betrachter

    void Open(string path)
    {
        var dir = Path.GetDirectoryName(path)!;
        _files = SafeImages(dir).ToList();
        _index = _files.IndexOf(path);
        if (_index < 0)
        {
            _files.Insert(0, path);
            _index = 0;
        }
        _content.Content = _viewer;
        Sys.AddRecentFile(path);
        ShowCurrent();
    }

    void ShowCurrent()
    {
        if (Current is not { } path) { ShowGallery(); return; }
        ResetView();
        try
        {
            var old = _image.Source as IDisposable;
            var bitmap = new Bitmap(path);
            _image.Source = bitmap;
            old?.Dispose();
            var size = new FileInfo(path).Length;
            _info.Text = $"{Path.GetFileName(path)}  ·  {bitmap.PixelSize.Width} × {bitmap.PixelSize.Height}  ·  {Sys.FormatSize(size)}  ·  {_index + 1} von {_files.Count}";
            SetTitle($"{Path.GetFileName(path)} – Fotos");
        }
        catch (Exception ex)
        {
            _image.Source = null;
            _info.Text = $"Bild kann nicht angezeigt werden: {ex.Message}";
        }
    }

    void Step(int delta)
    {
        if (_files.Count == 0) return;
        _index = (_index + delta + _files.Count) % _files.Count;
        ShowCurrent();
    }

    void Zoom(double factor)
    {
        _zoom = Math.Clamp(_zoom * factor, 0.1, 10);
        _scale.ScaleX = _scale.ScaleY = _zoom;
        _zoomText.Text = $"{(int)Math.Round(_zoom * 100)} %";
    }

    void ResetView()
    {
        _zoom = 1;
        _scale.ScaleX = _scale.ScaleY = 1;
        _rotate.Angle = 0;
        _translate.X = _translate.Y = 0;
        _zoomText.Text = "100 %";
    }

    void SetAsWallpaper()
    {
        if (Current is not { } path) return;
        Sys.Set("wallpaper", s => { s.Wallpaper = "image"; s.WallpaperImage = path; });
        Shell.Notify("Fotos", $"„{Path.GetFileName(path)}“ ist jetzt dein Desktophintergrund.", "photos");
    }

    async void Delete()
    {
        if (Current is not { } path) return;
        if (await Shell.Dialogs.MessageAsync("Löschen", $"„{Path.GetFileName(path)}“ in den Papierkorb verschieben?", "Löschen", "Abbrechen") != "Löschen") return;
        try
        {
            (_image.Source as IDisposable)?.Dispose();
            _image.Source = null;
            RecycleBin.Delete(path);
            _files.RemoveAt(_index);
            if (_index >= _files.Count) _index = _files.Count - 1;
            ShowCurrent();
        }
        catch (Exception ex)
        {
            await Shell.Dialogs.MessageAsync("Löschen nicht möglich", ex.Message, "OK");
        }
    }
}
