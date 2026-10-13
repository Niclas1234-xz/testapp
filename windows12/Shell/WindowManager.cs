using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>
/// Verwaltet alle offenen Fenster: Reihenfolge (Z-Order), aktives Fenster,
/// Minimieren, Schließen und virtuelle Desktops.
/// </summary>
public sealed class WindowManager
{
    readonly List<AppWindow> _windows = [];
    readonly Border _snapPreview;
    int _z = 10;
    int _cascade;

    public Canvas Layer { get; }
    public IReadOnlyList<AppWindow> Windows => _windows;
    public AppWindow? Active { get; private set; }
    public int CurrentDesktop { get; private set; }
    public int DesktopCount { get; private set; } = 1;

    /// <summary>Fenster geöffnet/geschlossen/aktiviert oder Desktop gewechselt.</summary>
    public event Action? Changed;

    public WindowManager(Canvas layer)
    {
        Layer = layer;
        _snapPreview = new Border
        {
            IsVisible = false,
            IsHitTestVisible = false,
            CornerRadius = new CornerRadius(10),
            BorderThickness = new Thickness(2),
            ZIndex = int.MaxValue,
            Transitions =
            [
                new Avalonia.Animation.DoubleTransition { Property = Visual.OpacityProperty, Duration = TimeSpan.FromMilliseconds(120) },
            ],
        }.Res(Border.BackgroundProperty, "W12.AccentSoft").Res(Border.BorderBrushProperty, "W12.Accent");
        layer.Children.Add(_snapPreview);
        layer.SizeChanged += (_, _) =>
        {
            foreach (var w in _windows) w.ApplySnapLayout();
        };
    }

    /// <summary>Verfügbarer Bereich für Fenster (zwischen oberer Leiste und Taskleiste).</summary>
    public Rect Area => Layer.Bounds.Width > 0 ? new Rect(Layer.Bounds.Size) : new Rect(0, 0, 1280, 720);

    public IEnumerable<AppWindow> OnCurrentDesktop => _windows.Where(w => w.Desktop == CurrentDesktop);

    public IEnumerable<AppWindow> WindowsOf(string appId) => OnCurrentDesktop.Where(w => w.App.Id == appId);

    public AppWindow Open(AppInfo app, AppView view)
    {
        var window = new AppWindow(this, app, view, CurrentDesktop);
        var area = Area;
        var width = Math.Min(app.Width, area.Width - 40);
        var height = Math.Min(app.Height, area.Height - 30);
        var offset = (_cascade++ % 6) * 28 - 56;
        var x = Math.Max(12, (area.Width - width) / 2 + offset);
        var y = Math.Max(10, (area.Height - height) / 2 + offset * 0.6);
        window.SetVisibleBounds(new Rect(x, y, width, height));

        _windows.Add(window);
        Layer.Children.Add(window);
        window.AnimateIn();
        Activate(window);
        view.OnOpened();
        return window;
    }

    public void Activate(AppWindow window)
    {
        if (window.Desktop != CurrentDesktop) SwitchDesktop(window.Desktop);
        if (window.IsMinimized) window.RestoreVisual();
        window.ZIndex = ++_z;
        Active = window;
        foreach (var w in _windows) w.SetActive(w == window);
        window.View.OnActivated();
        Changed?.Invoke();
    }

    /// <summary>Kein Fenster aktiv (z. B. Klick auf den Desktop).</summary>
    public void Deactivate()
    {
        if (Active == null) return;
        Active = null;
        foreach (var w in _windows) w.SetActive(false);
        Changed?.Invoke();
    }

    public void Minimize(AppWindow window)
    {
        window.MinimizeVisual();
        if (Active == window) ActivateTopmost(except: window);
        Changed?.Invoke();
    }

    /// <summary>Fragt die App, ob sie geschlossen werden darf, und schließt dann das Fenster.</summary>
    public async void Close(AppWindow window)
    {
        if (!_windows.Contains(window)) return;
        if (!await window.View.CanCloseAsync()) return;
        ForceClose(window);
    }

    /// <summary>Schließt ein Fenster ohne Rückfrage (Task beenden, Abmelden).</summary>
    public void ForceClose(AppWindow window)
    {
        if (!_windows.Remove(window)) return;
        window.View.OnClosed();
        window.AnimateOut(() => Layer.Children.Remove(window));
        if (Active == window)
        {
            Active = null;
            ActivateTopmost();
        }
        Changed?.Invoke();
    }

    /// <summary>Schließt alle Fenster. Gibt false zurück, wenn eine App das Schließen verhindert hat.</summary>
    public async Task<bool> CloseAllAsync()
    {
        foreach (var w in _windows.ToList())
        {
            if (!w.IsMinimized) Activate(w);
            if (!await w.View.CanCloseAsync()) return false;
            ForceClose(w);
        }
        return true;
    }

    void ActivateTopmost(AppWindow? except = null)
    {
        var top = OnCurrentDesktop.Where(w => !w.IsMinimized && w != except).MaxBy(w => w.ZIndex);
        if (top != null) Activate(top);
        else Deactivate();
    }

    /// <summary>Alle Fenster minimieren bzw. wiederherstellen („Desktop anzeigen“).</summary>
    readonly List<AppWindow> _hiddenByShowDesktop = [];

    public void ToggleShowDesktop()
    {
        var visible = OnCurrentDesktop.Where(w => !w.IsMinimized).ToList();
        if (visible.Count > 0)
        {
            _hiddenByShowDesktop.Clear();
            _hiddenByShowDesktop.AddRange(visible);
            foreach (var w in visible) w.MinimizeVisual();
            Deactivate();
        }
        else
        {
            foreach (var w in _hiddenByShowDesktop.Where(_windows.Contains).OrderBy(w => w.ZIndex)) Activate(w);
            _hiddenByShowDesktop.Clear();
        }
        Changed?.Invoke();
    }

    public void ShowSnapPreview(SnapMode mode)
    {
        if (mode == SnapMode.None)
        {
            _snapPreview.IsVisible = false;
            return;
        }
        var r = AppWindow.SnapRect(mode, Area).Deflate(6);
        Canvas.SetLeft(_snapPreview, r.X);
        Canvas.SetTop(_snapPreview, r.Y);
        _snapPreview.Width = r.Width;
        _snapPreview.Height = r.Height;
        _snapPreview.IsVisible = true;
    }

    // ------------------------------------------------------------ Virtuelle Desktops

    public void SwitchDesktop(int index)
    {
        CurrentDesktop = Math.Clamp(index, 0, DesktopCount - 1);
        foreach (var w in _windows) w.IsVisible = w.Desktop == CurrentDesktop && !w.IsMinimized;
        Active = null;
        var top = OnCurrentDesktop.Where(w => !w.IsMinimized).MaxBy(w => w.ZIndex);
        if (top != null) Activate(top);
        else Changed?.Invoke();
    }

    public void AddDesktop()
    {
        DesktopCount++;
        SwitchDesktop(DesktopCount - 1);
    }

    public void RemoveDesktop(int index)
    {
        if (DesktopCount <= 1) return;
        var target = index == 0 ? 0 : index - 1;
        foreach (var w in _windows)
        {
            if (w.Desktop == index) w.Desktop = target;
            else if (w.Desktop > index) w.Desktop--;
        }
        DesktopCount--;
        SwitchDesktop(Math.Min(CurrentDesktop > index ? CurrentDesktop - 1 : CurrentDesktop, DesktopCount - 1));
    }

    public void MoveToDesktop(AppWindow window, int index)
    {
        window.Desktop = index;
        window.IsVisible = index == CurrentDesktop && !window.IsMinimized;
        if (Active == window && index != CurrentDesktop) ActivateTopmost(except: window);
        Changed?.Invoke();
    }
}
