using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>Paint: Freihand, Radierer, Linie, Rechteck, Ellipse; Bilder öffnen und als PNG speichern.</summary>
public sealed class PaintApp : AppView
{
    enum Tool { Pen, Eraser, Line, Rectangle, Ellipse }

    static readonly string[] Palette =
    [
        "#000000", "#7F7F7F", "#880015", "#ED1C24", "#FF7F27", "#FFF200", "#22B14C", "#00A2E8",
        "#3F48CC", "#A349A4", "#FFFFFF", "#C3C3C3", "#B97A57", "#FFAEC9", "#FFC90E", "#B5E61D",
    ];

    readonly Surface _surface = new();
    readonly Border _currentColor;
    readonly TextBlock _position = UI.Sub("", 12);
    readonly TextBlock _sizeText = UI.Sub("", 12);
    readonly Dictionary<Tool, ToggleButton> _toolButtons = [];
    string? _path;
    bool _dirty;

    public PaintApp(string? path)
    {
        // Werkzeuge
        var tools = UI.H(2,
            ToolButton(Tool.Pen, "brush", "Stift"),
            ToolButton(Tool.Eraser, "eraser", "Radierer"),
            ToolButton(Tool.Line, "line", "Linie"),
            ToolButton(Tool.Rectangle, "rect", "Rechteck"),
            ToolButton(Tool.Ellipse, "ellipse", "Ellipse"));
        SelectTool(Tool.Pen);

        var width = new Slider { Minimum = 1, Maximum = 40, Value = 4, Width = 110 };
        var widthText = UI.Sub("4 px", 12).VCenter();
        width.ValueChanged += (_, e) =>
        {
            _surface.StrokeWidth = e.NewValue;
            widthText.Text = $"{(int)e.NewValue} px";
        };
        var fill = new CheckBox { Content = "Füllen" };
        fill.IsCheckedChanged += (_, _) => _surface.Fill = fill.IsChecked == true;

        _currentColor = new Border
        {
            Width = 34,
            Height = 34,
            CornerRadius = new CornerRadius(17),
            BorderThickness = new Thickness(2),
            Background = Brushes.Black,
        }.Res(Border.BorderBrushProperty, "W12.Text").Tip("Aktuelle Farbe");

        var palette = new UniformGrid { Rows = 2, Columns = 8 };
        foreach (var hex in Palette)
        {
            var color = Color.Parse(hex);
            var swatch = new Border
            {
                Width = 18,
                Height = 18,
                Margin = new Thickness(2),
                CornerRadius = new CornerRadius(9),
                Background = new SolidColorBrush(color),
                BorderThickness = new Thickness(1),
                BorderBrush = new SolidColorBrush(Color.FromArgb(80, 128, 128, 128)),
                Cursor = new Cursor(StandardCursorType.Hand),
            }.Tip(hex);
            swatch.PointerPressed += (_, _) =>
            {
                _surface.Color = color;
                _currentColor.Background = new SolidColorBrush(color);
                if (_surface.Tool == Tool.Eraser) SelectTool(Tool.Pen);
            };
            palette.Children.Add(swatch);
        }

        var toolbar = new Border
        {
            Padding = new Thickness(10, 8),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = new WrapPanel
            {
                Children =
                {
                    UI.IconButton("file-plus", New, "Neu (Strg+N)"),
                    UI.IconButton("open", Open, "Öffnen (Strg+O)"),
                    UI.IconButton("save", () => _ = SaveAsync(), "Speichern (Strg+S)"),
                    UI.IconButton("undo", Undo, "Rückgängig (Strg+Z)"),
                    Separator(),
                    tools,
                    Separator(),
                    UI.H(8, Icons.Glyph("line", 16).VCenter(), width.VCenter(), widthText),
                    fill.VCenter().Margin(12, 0, 0, 0),
                    Separator(),
                    _currentColor.VCenter().Margin(0, 0, 8, 0),
                    palette.VCenter(),
                },
            },
        }.Res(Border.BorderBrushProperty, "W12.Divider");

        var statusBar = new Border
        {
            Padding = new Thickness(14, 4),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Child = UI.H(24, _position, _sizeText),
        }.Res(Border.BorderBrushProperty, "W12.Divider");

        var canvasArea = new ScrollViewer
        {
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Content = new Border
            {
                Margin = new Thickness(20),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top,
                BoxShadow = BoxShadows.Parse("0 2 10 0 #40000000"),
                Child = _surface,
            },
        }.Res(ScrollViewer.BackgroundProperty, "W12.CardAlt");

        Content = new DockPanel
        {
            Children = { toolbar.Dock(Avalonia.Controls.Dock.Top), statusBar.Dock(Avalonia.Controls.Dock.Bottom), canvasArea },
        };

        _surface.Changed += () =>
        {
            _dirty = true;
            UpdateTitle();
        };
        _surface.PointerMoved += (_, e) =>
        {
            var p = e.GetPosition(_surface);
            _position.Text = $"{(int)p.X}, {(int)p.Y} px";
        };
        _surface.PointerExited += (_, _) => _position.Text = "";

        AddHandler(KeyDownEvent, OnKey, RoutingStrategies.Tunnel);

        if (path != null) LoadImage(path);
        UpdateTitle();
    }

    static Border Separator() => new Border { Width = 1, Height = 28, Margin = new Thickness(10, 0) }.Res(Border.BackgroundProperty, "W12.Divider");

    ToggleButton ToolButton(Tool tool, string icon, string tip)
    {
        var b = new ToggleButton
        {
            Width = 36,
            Height = 34,
            Padding = new Thickness(0),
            Content = Icons.Glyph(icon, 16),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
        }.Tip(tip);
        b.Click += (_, _) => SelectTool(tool);
        _toolButtons[tool] = b;
        return b;
    }

    void SelectTool(Tool tool)
    {
        _surface.Tool = tool;
        foreach (var (t, b) in _toolButtons) b.IsChecked = t == tool;
        _surface.Cursor = new Cursor(tool == Tool.Eraser ? StandardCursorType.Hand : StandardCursorType.Cross);
    }

    void OnKey(object? sender, KeyEventArgs e)
    {
        if (!e.KeyModifiers.HasFlag(KeyModifiers.Control)) return;
        switch (e.Key)
        {
            case Key.Z: Undo(); break;
            case Key.S: _ = SaveAsync(); break;
            case Key.O: Open(); break;
            case Key.N: New(); break;
            default: return;
        }
        e.Handled = true;
    }

    void UpdateTitle()
    {
        SetTitle($"{(_dirty ? "*" : "")}{(_path != null ? Path.GetFileName(_path) : "Unbenannt")} – Paint");
        _sizeText.Text = $"{(int)_surface.Width} × {(int)_surface.Height} px";
    }

    void Undo()
    {
        if (_surface.Undo()) UpdateTitle();
    }

    async void New()
    {
        if (!await ConfirmDiscardAsync()) return;
        _surface.Clear(1000, 620);
        _path = null;
        _dirty = false;
        UpdateTitle();
    }

    async void Open()
    {
        if (!await ConfirmDiscardAsync()) return;
        var path = await Shell.Dialogs.OpenFileAsync(UserFolders.Pictures, FileOps.ImageExtensions, "Bild öffnen");
        if (path != null) LoadImage(path);
    }

    void LoadImage(string path)
    {
        try
        {
            var bitmap = new Bitmap(path);
            _surface.Clear(Math.Min(bitmap.Size.Width, 4000), Math.Min(bitmap.Size.Height, 4000));
            _surface.Background = bitmap;
            _surface.InvalidateVisual();
            _path = path.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ? path : null;
            _dirty = false;
            Sys.AddRecentFile(path);
            UpdateTitle();
        }
        catch (Exception ex)
        {
            _ = Shell.Dialogs.MessageAsync("Paint", $"Das Bild konnte nicht geöffnet werden:\n{ex.Message}", "OK");
        }
    }

    async Task<bool> SaveAsync()
    {
        var path = _path ?? await Shell.Dialogs.SaveFileAsync(UserFolders.Pictures, "Zeichnung.png", "Bild speichern");
        if (path == null) return false;
        if (!path.EndsWith(".png", StringComparison.OrdinalIgnoreCase)) path = Path.ChangeExtension(path, ".png");
        try
        {
            var size = new PixelSize((int)_surface.Width, (int)_surface.Height);
            using var bitmap = new RenderTargetBitmap(size, new Vector(96, 96));
            bitmap.Render(_surface);
            bitmap.Save(path, PngBitmapEncoderOptions.Default);
            _path = path;
            _dirty = false;
            Sys.AddRecentFile(path);
            UpdateTitle();
            Shell.Notify("Paint", $"Gespeichert als {Path.GetFileName(path)}", "paint");
            return true;
        }
        catch (Exception ex)
        {
            await Shell.Dialogs.MessageAsync("Speichern fehlgeschlagen", ex.Message, "OK");
            return false;
        }
    }

    async Task<bool> ConfirmDiscardAsync()
    {
        if (!_dirty) return true;
        var answer = await Shell.Dialogs.MessageAsync("Paint", "Möchtest du die Änderungen an der Zeichnung speichern?", "Speichern", "Nicht speichern", "Abbrechen");
        return answer switch
        {
            "Speichern" => await SaveAsync(),
            "Nicht speichern" => true,
            _ => false,
        };
    }

    public override Task<bool> CanCloseAsync() => ConfirmDiscardAsync();

    /// <summary>Die Zeichenfläche. Alle Striche werden als Liste gespeichert (für Rückgängig).</summary>
    sealed class Surface : Control
    {
        sealed class Stroke
        {
            public required Tool Tool { get; init; }
            public required Color Color { get; init; }
            public required double Width { get; init; }
            public required bool Fill { get; init; }
            public List<Point> Points { get; } = [];
        }

        readonly List<Stroke> _strokes = [];
        Stroke? _current;

        public Tool Tool { get; set; } = Tool.Pen;
        public Color Color { get; set; } = Colors.Black;
        public double StrokeWidth { get; set; } = 4;
        public bool Fill { get; set; }
        public Bitmap? Background { get; set; }
        public event Action? Changed;

        public Surface()
        {
            Width = 1000;
            Height = 620;
            ClipToBounds = true;
        }

        public void Clear(double width, double height)
        {
            _strokes.Clear();
            Background = null;
            Width = width;
            Height = height;
            InvalidateVisual();
        }

        public bool Undo()
        {
            if (_strokes.Count == 0) return false;
            _strokes.RemoveAt(_strokes.Count - 1);
            InvalidateVisual();
            Changed?.Invoke();
            return true;
        }

        protected override void OnPointerPressed(PointerPressedEventArgs e)
        {
            if (!e.GetCurrentPoint(this).Properties.IsLeftButtonPressed) return;
            var p = e.GetPosition(this);
            _current = new Stroke
            {
                Tool = Tool,
                Color = Tool == Tool.Eraser ? Colors.White : Color,
                Width = Tool == Tool.Eraser ? Math.Max(StrokeWidth * 3, 12) : StrokeWidth,
                Fill = Fill,
            };
            _current.Points.Add(p);
            _current.Points.Add(p);
            _strokes.Add(_current);
            e.Pointer.Capture(this);
            e.Handled = true;
            InvalidateVisual();
        }

        protected override void OnPointerMoved(PointerEventArgs e)
        {
            if (_current == null) return;
            var p = e.GetPosition(this);
            if (_current.Tool is Tool.Pen or Tool.Eraser) _current.Points.Add(p);
            else _current.Points[1] = p;
            InvalidateVisual();
        }

        protected override void OnPointerReleased(PointerReleasedEventArgs e)
        {
            if (_current == null) return;
            _current = null;
            e.Pointer.Capture(null);
            Changed?.Invoke();
        }

        public override void Render(DrawingContext context)
        {
            context.FillRectangle(Brushes.White, new Rect(Bounds.Size));
            if (Background != null)
                context.DrawImage(Background, new Rect(0, 0, Background.Size.Width, Background.Size.Height));

            foreach (var s in _strokes)
            {
                var brush = new SolidColorBrush(s.Color);
                var pen = new Pen(brush, s.Width, lineCap: PenLineCap.Round, lineJoin: PenLineJoin.Round);
                var a = s.Points[0];
                var b = s.Points[^1];
                switch (s.Tool)
                {
                    case Tool.Pen or Tool.Eraser:
                        var geometry = new StreamGeometry();
                        using (var g = geometry.Open())
                        {
                            g.BeginFigure(a, false);
                            foreach (var point in s.Points.Skip(1)) g.LineTo(point);
                            g.EndFigure(false);
                        }
                        context.DrawGeometry(null, pen, geometry);
                        break;
                    case Tool.Line:
                        context.DrawLine(pen, a, b);
                        break;
                    case Tool.Rectangle:
                        context.DrawRectangle(s.Fill ? brush : null, pen, new Rect(a, b).Normalize());
                        break;
                    case Tool.Ellipse:
                        var r = new Rect(a, b).Normalize();
                        context.DrawEllipse(s.Fill ? brush : null, pen, r.Center, r.Width / 2, r.Height / 2);
                        break;
                }
            }
        }
    }
}
