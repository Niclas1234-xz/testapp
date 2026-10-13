using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Start- und Herunterfahr-Bildschirm mit Logo und Ladeanimation.</summary>
public sealed class BootScreen : Panel
{
    readonly Control _logo;
    readonly TextBlock _text;
    readonly Spinner _spinner = new() { Width = 40, Height = 40 };

    public BootScreen()
    {
        Background = Brushes.Black;
        Transitions = [new DoubleTransition { Property = OpacityProperty, Duration = TimeSpan.FromMilliseconds(450) }];

        _logo = Icons.Logo(110);
        _text = new TextBlock { Foreground = Brushes.White, FontSize = 20, HorizontalAlignment = HorizontalAlignment.Center };
        Children.Add(new StackPanel
        {
            Spacing = 60,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Children = { _logo, UI.V(18, _spinner.Center(), _text) },
        });
    }

    public async Task BootAsync()
    {
        IsVisible = true;
        Opacity = 1;
        _logo.IsVisible = true;
        _text.Text = "";
        _spinner.IsRunning = true;
        await Task.Delay(2200);
        Opacity = 0;
        await Task.Delay(460);
        Hide();
    }

    public async Task ShowMessageAsync(string text, int milliseconds)
    {
        Opacity = 0;
        IsVisible = true;
        _logo.IsVisible = false;
        _text.Text = text;
        _spinner.IsRunning = true;
        Dispatcher.UIThread.Post(() => Opacity = 1, DispatcherPriority.Background);
        await Task.Delay(milliseconds);
    }

    public void Hide()
    {
        IsVisible = false;
        _spinner.IsRunning = false;
    }

    /// <summary>Kreisende Punkte wie beim Windows-Start.</summary>
    sealed class Spinner : Control
    {
        readonly DispatcherTimer _timer;
        readonly DateTime _start = DateTime.Now;

        public bool IsRunning
        {
            get => _timer.IsEnabled;
            set
            {
                if (value) _timer.Start();
                else _timer.Stop();
            }
        }

        public Spinner()
        {
            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
            _timer.Tick += (_, _) => InvalidateVisual();
        }

        public override void Render(DrawingContext context)
        {
            var t = (DateTime.Now - _start).TotalSeconds;
            var center = new Point(Bounds.Width / 2, Bounds.Height / 2);
            var radius = Math.Min(Bounds.Width, Bounds.Height) / 2 - 3;
            for (var i = 0; i < 5; i++)
            {
                // Jeder Punkt läuft etwas versetzt und wird unten schneller (Ease-in-out).
                var phase = (t * 0.55 - i * 0.07) % 1.0;
                if (phase < 0) phase += 1;
                var eased = phase < 0.5 ? 2 * phase * phase : 1 - Math.Pow(-2 * phase + 2, 2) / 2;
                var angle = eased * Math.PI * 2 - Math.PI / 2;
                var p = new Point(center.X + Math.Cos(angle) * radius, center.Y + Math.Sin(angle) * radius);
                context.DrawEllipse(Brushes.White, null, p, 2.6, 2.6);
            }
        }
    }
}
