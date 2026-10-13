using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Transformation;
using Avalonia.Threading;
using Windows12.Core;
using ShapePath = Avalonia.Controls.Shapes.Path;

namespace Windows12.Shell;

public enum SnapMode { None, Maximized, Left, Right, TopLeft, TopRight, BottomLeft, BottomRight }

/// <summary>
/// Ein App-Fenster innerhalb der Shell: Titelleiste, Minimieren/Maximieren/Schließen,
/// Verschieben, Größe ändern an allen Rändern und Andocken an Bildschirmränder.
/// </summary>
public sealed class AppWindow : Border
{
    /// <summary>Unsichtbarer Rand rund ums Fenster, an dem man die Größe ändern kann.</summary>
    public const double Pad = 6;
    const double TitleHeight = 38;
    static readonly TimeSpan AnimDuration = TimeSpan.FromMilliseconds(170);

    readonly WindowManager _wm;
    readonly Border _frame;
    readonly Border _clip;
    readonly TextBlock _titleText;
    readonly Grid _titleBar;
    readonly ShapePath _maxGlyph;
    readonly Button _maxButton;

    string _title;
    Rect _restore;
    bool _dragging;
    Point _dragStart;
    Point _dragOrigin;
    int _resizeEdges;
    Rect _resizeStart;

    public AppInfo App { get; }
    public AppView View { get; }
    public int Desktop { get; set; }
    public bool IsMinimized { get; private set; }
    public bool IsActive { get; private set; }
    public SnapMode Snap { get; private set; }
    public bool IsMaximized => Snap == SnapMode.Maximized;
    public DateTime OpenedAt { get; } = DateTime.Now;

    /// <summary>Der sichtbare Fensterrahmen (für Vorschaubilder in der Task-Ansicht).</summary>
    public Visual Frame => _frame;

    public event Action? TitleChanged;

    public string Title
    {
        get => _title;
        set
        {
            _title = value;
            _titleText.Text = value;
            TitleChanged?.Invoke();
        }
    }

    public AppWindow(WindowManager wm, AppInfo app, AppView view, int desktop)
    {
        _wm = wm;
        App = app;
        View = view;
        Desktop = desktop;
        _title = app.Name;
        view.Window = this;

        Background = Brushes.Transparent;
        Padding = new Thickness(Pad);
        MinWidth = 300 + 2 * Pad;
        MinHeight = 180 + 2 * Pad;

        // --- Titelleiste
        _titleText = UI.Text(app.Name, 12).VCenter();
        _maxGlyph = new ShapePath { StrokeThickness = 1, Data = StreamGeometry.Parse("M0.5,0.5 L9.5,0.5 L9.5,9.5 L0.5,9.5 Z") };

        _maxButton = ChromeButton(_maxGlyph, ToggleMaximize, "Maximieren");
        var buttons = UI.H(0,
            ChromeButton(new ShapePath { StrokeThickness = 1, Data = StreamGeometry.Parse("M0,5 L10,5") }, Minimize, "Minimieren"),
            _maxButton,
            ChromeButton(new ShapePath { StrokeThickness = 1, Data = StreamGeometry.Parse("M0,0 L10,10 M10,0 L0,10") }, () => _wm.Close(this), "Schließen", true));

        _titleBar = new Grid
        {
            Height = TitleHeight,
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Background = Brushes.Transparent,
            Children =
            {
                Icons.Tile(app, 18).VCenter().Margin(12, 0, 10, 0).Col(0),
                _titleText.Col(1),
                buttons.Col(2),
            },
        };

        var titleBackground = new Border { Child = _titleBar }.Res(BackgroundProperty, "W12.TitleBar");
        DockPanel.SetDock(titleBackground, Avalonia.Controls.Dock.Top);

        var content = new DockPanel { LastChildFill = true, Children = { titleBackground, view } }
            .Res(Panel.BackgroundProperty, "W12.Window");

        _clip = new Border { CornerRadius = new CornerRadius(8), ClipToBounds = true, Child = content };
        _frame = new Border
        {
            CornerRadius = new CornerRadius(9),
            BorderThickness = new Thickness(1),
            BoxShadow = BoxShadows.Parse("0 10 36 0 #60000000"),
            Child = _clip,
        }.Res(BorderBrushProperty, "W12.PanelBorder");
        Child = _frame;

        // --- Animationen
        RenderTransformOrigin = new RelativePoint(0.5, 0.5, RelativeUnit.Relative);
        Transitions =
        [
            new DoubleTransition { Property = OpacityProperty, Duration = AnimDuration },
            new TransformOperationsTransition { Property = RenderTransformProperty, Duration = AnimDuration, Easing = new CubicEaseOut() },
        ];

        // --- Interaktion
        AddHandler(PointerPressedEvent, (_, _) => _wm.Activate(this), RoutingStrategies.Tunnel, handledEventsToo: true);
        _titleBar.PointerPressed += TitlePressed;
        _titleBar.PointerMoved += TitleMoved;
        _titleBar.PointerReleased += TitleReleased;
        _titleBar.PointerCaptureLost += (_, _) => EndDrag();
        _titleBar.ContextMenu = BuildTitleMenu();

        PointerMoved += EdgeMoved;
        PointerPressed += EdgePressed;
        PointerReleased += EdgeReleased;
        PointerCaptureLost += (_, _) => _resizeEdges = 0;
    }

    Button ChromeButton(ShapePath glyph, Action click, string tip, bool close = false)
    {
        glyph.Bind(ShapePath.StrokeProperty, glyph.GetObservable(Avalonia.Controls.Documents.TextElement.ForegroundProperty));
        var b = new Button
        {
            Width = 46,
            Height = TitleHeight,
            Padding = new Thickness(0),
            CornerRadius = new CornerRadius(0),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            Content = new Canvas { Width = 10, Height = 10, Children = { glyph } },
        };
        b.Classes.Add("flat");
        if (close) b.Classes.Add("close");
        b.Click += (_, e) =>
        {
            e.Handled = true;
            click();
        };
        return b.Tip(tip);
    }

    ContextMenu BuildTitleMenu()
    {
        var menu = new ContextMenu();
        menu.Opening += (_, _) =>
        {
            var items = new List<Control>
            {
                MenuItem("Wiederherstellen", "restart", () => SetSnap(SnapMode.None), Snap != SnapMode.None),
                MenuItem("Minimieren", "minus", Minimize),
                MenuItem("Maximieren", "plus", () => SetSnap(SnapMode.Maximized), !IsMaximized),
                new Separator(),
                MenuItem("Links andocken", "chevron-left", () => SetSnap(SnapMode.Left)),
                MenuItem("Rechts andocken", "chevron-right", () => SetSnap(SnapMode.Right)),
            };
            if (_wm.DesktopCount > 1)
            {
                var move = new MenuItem { Header = "Verschieben nach", Icon = Icons.Glyph("taskview", 14) };
                for (var i = 0; i < _wm.DesktopCount; i++)
                {
                    var index = i;
                    move.Items.Add(MenuItem($"Desktop {i + 1}", "desktop", () => _wm.MoveToDesktop(this, index), index != Desktop));
                }
                items.Add(move);
            }
            items.Add(new Separator());
            items.Add(MenuItem("Schließen        Alt+F4", "close", () => _wm.Close(this)));
            menu.ItemsSource = items;
        };
        return menu;
    }

    static MenuItem MenuItem(string header, string icon, Action click, bool enabled = true)
    {
        var item = new MenuItem { Header = header, Icon = Icons.Glyph(icon, 14), IsEnabled = enabled };
        item.Click += (_, _) => click();
        return item;
    }

    // ------------------------------------------------------------ Position & Größe

    /// <summary>Sichtbarer Bereich des Fensters (ohne den unsichtbaren Größenänderungsrand).</summary>
    public Rect VisibleBounds => new(Canvas.GetLeft(this) + Pad, Canvas.GetTop(this) + Pad, Width - 2 * Pad, Height - 2 * Pad);

    public void SetVisibleBounds(Rect r)
    {
        Canvas.SetLeft(this, r.X - Pad);
        Canvas.SetTop(this, r.Y - Pad);
        Width = Math.Max(r.Width + 2 * Pad, MinWidth);
        Height = Math.Max(r.Height + 2 * Pad, MinHeight);
    }

    public static Rect SnapRect(SnapMode mode, Rect area)
    {
        double w = area.Width, h = area.Height;
        return mode switch
        {
            SnapMode.Maximized => new Rect(0, 0, w, h),
            SnapMode.Left => new Rect(0, 0, w / 2, h),
            SnapMode.Right => new Rect(w / 2, 0, w / 2, h),
            SnapMode.TopLeft => new Rect(0, 0, w / 2, h / 2),
            SnapMode.TopRight => new Rect(w / 2, 0, w / 2, h / 2),
            SnapMode.BottomLeft => new Rect(0, h / 2, w / 2, h / 2),
            SnapMode.BottomRight => new Rect(w / 2, h / 2, w / 2, h / 2),
            _ => default,
        };
    }

    public void SetSnap(SnapMode mode)
    {
        if (mode == Snap && mode != SnapMode.None) return;

        if (Snap == SnapMode.None && mode != SnapMode.None)
            _restore = VisibleBounds;

        Snap = mode;
        if (mode == SnapMode.None)
        {
            if (_restore.Width > 0) SetVisibleBounds(_restore);
        }
        else
        {
            ApplySnapLayout();
        }

        var square = mode != SnapMode.None;
        _frame.CornerRadius = new CornerRadius(square ? 0 : 9);
        _clip.CornerRadius = new CornerRadius(square ? 0 : 8);
        _frame.BoxShadow = square ? default : BoxShadows.Parse("0 10 36 0 #60000000");
        _maxGlyph.Data = StreamGeometry.Parse(IsMaximized
            ? "M2.5,0.5 L9.5,0.5 L9.5,7.5 M0.5,2.5 L7.5,2.5 L7.5,9.5 L0.5,9.5 Z"
            : "M0.5,0.5 L9.5,0.5 L9.5,9.5 L0.5,9.5 Z");
        ToolTip.SetTip(_maxButton, IsMaximized ? "Verkleinern" : "Maximieren");
    }

    /// <summary>Nach einer Größenänderung des Bildschirms angedockte Fenster neu ausrichten.</summary>
    public void ApplySnapLayout()
    {
        if (Snap != SnapMode.None) SetVisibleBounds(SnapRect(Snap, _wm.Area));
    }

    public void ToggleMaximize() => SetSnap(IsMaximized ? SnapMode.None : SnapMode.Maximized);

    public void Minimize() => _wm.Minimize(this);

    // ------------------------------------------------------------ Zustände & Animationen

    internal void SetActive(bool active)
    {
        IsActive = active;
        _titleText.Opacity = active ? 1 : 0.55;
        if (Snap == SnapMode.None)
            _frame.BoxShadow = BoxShadows.Parse(active ? "0 10 36 0 #70000000" : "0 4 16 0 #40000000");
    }

    internal void AnimateIn()
    {
        Opacity = 0;
        RenderTransform = TransformOperations.Parse("scale(0.94)");
        Dispatcher.UIThread.Post(() =>
        {
            Opacity = 1;
            RenderTransform = TransformOperations.Parse("scale(1)");
        }, DispatcherPriority.Background);
    }

    internal void AnimateOut(Action done)
    {
        IsHitTestVisible = false;
        Opacity = 0;
        RenderTransform = TransformOperations.Parse("scale(0.94)");
        DispatcherTimer.RunOnce(done, AnimDuration);
    }

    internal void MinimizeVisual()
    {
        IsMinimized = true;
        Opacity = 0;
        RenderTransform = TransformOperations.Parse("translateY(60px) scale(0.85)");
        DispatcherTimer.RunOnce(() =>
        {
            if (IsMinimized) IsVisible = false;
        }, AnimDuration);
    }

    internal void RestoreVisual()
    {
        IsMinimized = false;
        IsVisible = Desktop == _wm.CurrentDesktop;
        Dispatcher.UIThread.Post(() =>
        {
            Opacity = 1;
            RenderTransform = TransformOperations.Parse("scale(1)");
        }, DispatcherPriority.Background);
    }

    // ------------------------------------------------------------ Verschieben (Titelleiste)

    void TitlePressed(object? sender, PointerPressedEventArgs e)
    {
        if (!e.GetCurrentPoint(_titleBar).Properties.IsLeftButtonPressed) return;
        if (e.ClickCount == 2)
        {
            ToggleMaximize();
            e.Handled = true;
            return;
        }
        _dragging = true;
        _dragStart = e.GetPosition(_wm.Layer);
        _dragOrigin = new Point(Canvas.GetLeft(this), Canvas.GetTop(this));
        e.Pointer.Capture(_titleBar);
        e.Handled = true;
    }

    void TitleMoved(object? sender, PointerEventArgs e)
    {
        if (!_dragging) return;
        var p = e.GetPosition(_wm.Layer);

        if (Snap != SnapMode.None)
        {
            if (Math.Abs(p.X - _dragStart.X) + Math.Abs(p.Y - _dragStart.Y) < 8) return;
            // Aus dem angedockten Zustand lösen; Mauszeiger bleibt relativ an derselben Stelle.
            var vb = VisibleBounds;
            var rel = (p.X - vb.X) / Math.Max(1, vb.Width);
            var restore = _restore.Width > 0 ? _restore : new Rect(0, 0, 800, 540);
            Snap = SnapMode.None;
            SetSnapVisuals();
            SetVisibleBounds(new Rect(p.X - rel * restore.Width, p.Y - TitleHeight / 2, restore.Width, restore.Height));
            _dragStart = p;
            _dragOrigin = new Point(Canvas.GetLeft(this), Canvas.GetTop(this));
        }

        Canvas.SetLeft(this, _dragOrigin.X + p.X - _dragStart.X);
        Canvas.SetTop(this, Math.Max(-Pad, _dragOrigin.Y + p.Y - _dragStart.Y));
        _wm.ShowSnapPreview(SnapFor(p));
    }

    void SetSnapVisuals()
    {
        _frame.CornerRadius = new CornerRadius(9);
        _clip.CornerRadius = new CornerRadius(8);
        _frame.BoxShadow = BoxShadows.Parse("0 10 36 0 #70000000");
        _maxGlyph.Data = StreamGeometry.Parse("M0.5,0.5 L9.5,0.5 L9.5,9.5 L0.5,9.5 Z");
        ToolTip.SetTip(_maxButton, "Maximieren");
    }

    void TitleReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (!_dragging) return;
        var snap = SnapFor(e.GetPosition(_wm.Layer));
        EndDrag();
        e.Pointer.Capture(null);
        if (snap != SnapMode.None) SetSnap(snap);
    }

    void EndDrag()
    {
        _dragging = false;
        _wm.ShowSnapPreview(SnapMode.None);
    }

    SnapMode SnapFor(Point p)
    {
        var area = _wm.Area;
        const double edge = 4;
        if (p.Y <= edge) return SnapMode.Maximized;
        var top = p.Y < area.Height * 0.2;
        var bottom = p.Y > area.Height * 0.8;
        if (p.X <= edge) return top ? SnapMode.TopLeft : bottom ? SnapMode.BottomLeft : SnapMode.Left;
        if (p.X >= area.Width - edge) return top ? SnapMode.TopRight : bottom ? SnapMode.BottomRight : SnapMode.Right;
        return SnapMode.None;
    }

    // ------------------------------------------------------------ Größe ändern (Ränder)

    const int EdgeLeft = 1, EdgeTop = 2, EdgeRight = 4, EdgeBottom = 8;

    int EdgesAt(Point p)
    {
        if (Snap == SnapMode.Maximized) return 0;
        var corner = 14;
        var edges = 0;
        var w = Bounds.Width;
        var h = Bounds.Height;
        if (p.X < Pad || (p.X < corner && (p.Y < Pad || p.Y > h - Pad))) edges |= EdgeLeft;
        if (p.X > w - Pad || (p.X > w - corner && (p.Y < Pad || p.Y > h - Pad))) edges |= EdgeRight;
        if (p.Y < Pad || (p.Y < corner && (p.X < Pad || p.X > w - Pad))) edges |= EdgeTop;
        if (p.Y > h - Pad || (p.Y > h - corner && (p.X < Pad || p.X > w - Pad))) edges |= EdgeBottom;
        return edges;
    }

    static StandardCursorType? CursorFor(int edges) => edges switch
    {
        EdgeLeft | EdgeTop => StandardCursorType.TopLeftCorner,
        EdgeRight | EdgeBottom => StandardCursorType.BottomRightCorner,
        EdgeRight | EdgeTop => StandardCursorType.TopRightCorner,
        EdgeLeft | EdgeBottom => StandardCursorType.BottomLeftCorner,
        EdgeLeft or EdgeRight => StandardCursorType.SizeWestEast,
        EdgeTop or EdgeBottom => StandardCursorType.SizeNorthSouth,
        _ => null,
    };

    StandardCursorType? _currentCursor;

    void EdgeMoved(object? sender, PointerEventArgs e)
    {
        if (_resizeEdges != 0)
        {
            var p = e.GetPosition(_wm.Layer);
            var dx = p.X - _dragStart.X;
            var dy = p.Y - _dragStart.Y;
            var r = _resizeStart;
            double x = r.X, y = r.Y, w = r.Width, h = r.Height;
            const double minW = 300, minH = 180;
            if ((_resizeEdges & EdgeLeft) != 0) { w = Math.Max(minW, r.Width - dx); x = r.Right - w; }
            if ((_resizeEdges & EdgeRight) != 0) w = Math.Max(minW, r.Width + dx);
            if ((_resizeEdges & EdgeTop) != 0) { h = Math.Max(minH, r.Height - dy); y = r.Bottom - h; }
            if ((_resizeEdges & EdgeBottom) != 0) h = Math.Max(minH, r.Height + dy);
            SetVisibleBounds(new Rect(x, y, w, h));
            e.Handled = true;
            return;
        }

        var cursor = e.Source == this ? CursorFor(EdgesAt(e.GetPosition(this))) : null;
        if (cursor != _currentCursor)
        {
            _currentCursor = cursor;
            Cursor = cursor is { } c ? new Cursor(c) : null;
        }
    }

    void EdgePressed(object? sender, PointerPressedEventArgs e)
    {
        if (e.Source != this || !e.GetCurrentPoint(this).Properties.IsLeftButtonPressed) return;
        var edges = EdgesAt(e.GetPosition(this));
        if (edges == 0) return;
        if (Snap != SnapMode.None)
        {
            // Angedockte Fenster werden beim Ziehen zu normalen Fenstern.
            var vb = VisibleBounds;
            Snap = SnapMode.None;
            SetSnapVisuals();
            SetVisibleBounds(vb);
        }
        _resizeEdges = edges;
        _resizeStart = VisibleBounds;
        _dragStart = e.GetPosition(_wm.Layer);
        e.Pointer.Capture(this);
        e.Handled = true;
    }

    void EdgeReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (_resizeEdges == 0) return;
        _resizeEdges = 0;
        e.Pointer.Capture(null);
        e.Handled = true;
    }
}
