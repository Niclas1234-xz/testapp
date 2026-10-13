using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Transformation;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Basis für aufklappende Bereiche (Startmenü, Schnelleinstellungen, …).</summary>
public abstract class Flyout : Border
{
    static readonly TimeSpan Duration = TimeSpan.FromMilliseconds(180);
    readonly string _hiddenTransform;

    public bool IsOpen { get; private set; }

    protected Flyout(double width, string hiddenTransform = "translateY(24px)")
    {
        _hiddenTransform = hiddenTransform;
        Width = width;
        CornerRadius = new CornerRadius(12);
        BorderThickness = new Thickness(1);
        BoxShadow = BoxShadows.Parse("0 16 48 0 #66000000");
        ClipToBounds = true;
        IsVisible = false;
        Opacity = 0;
        RenderTransform = TransformOperations.Parse(hiddenTransform);
        Transitions =
        [
            new DoubleTransition { Property = OpacityProperty, Duration = Duration },
            new TransformOperationsTransition { Property = RenderTransformProperty, Duration = Duration, Easing = new CubicEaseOut() },
        ];
        this.Res(BackgroundProperty, "W12.Glass").Res(BorderBrushProperty, "W12.PanelBorder");
    }

    public void Open()
    {
        IsOpen = true;
        OnOpening();
        IsVisible = true;
        UpdatePlacement();
        Dispatcher.UIThread.Post(() =>
        {
            Opacity = 1;
            RenderTransform = TransformOperations.Parse("translateY(0px)");
            OnOpened();
        }, DispatcherPriority.Background);
    }

    public void Close()
    {
        IsOpen = false;
        Opacity = 0;
        RenderTransform = TransformOperations.Parse(_hiddenTransform);
        DispatcherTimer.RunOnce(() =>
        {
            if (!IsOpen) IsVisible = false;
        }, Duration);
    }

    protected virtual void OnOpening() { }

    protected virtual void OnOpened() { }

    /// <summary>Position abhängig von Taskleisten-Ausrichtung und oberer Leiste.</summary>
    public virtual void UpdatePlacement() { }

    protected static double TopOffset => Sys.Settings.ShowTopBar ? ShellWindow.TopBarHeight + 8 : 8;
}
