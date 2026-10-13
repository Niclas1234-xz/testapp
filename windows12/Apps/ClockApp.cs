using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;
using Windows12.Shell;

namespace Windows12.Apps;

/// <summary>Timer, Stoppuhr und Wecker laufen hier – auch wenn das Uhr-Fenster geschlossen ist.</summary>
public static class ClockService
{
    public static Stopwatch Stopwatch { get; } = new();
    public static List<TimeSpan> Laps { get; } = [];

    public static TimeSpan TimerDuration { get; private set; }
    public static DateTime? TimerEnd { get; private set; }
    public static TimeSpan? TimerPaused { get; private set; }
    public static TimeOnly? Alarm { get; private set; }
    static bool _hooked;

    public static TimeSpan TimerRemaining =>
        TimerPaused ?? (TimerEnd is { } end ? (end - DateTime.Now < TimeSpan.Zero ? TimeSpan.Zero : end - DateTime.Now) : TimerDuration);

    static void Hook()
    {
        if (_hooked) return;
        _hooked = true;
        ShellWindow.Current.Tick += Check;
    }

    public static void StartTimer(TimeSpan duration)
    {
        Hook();
        TimerDuration = duration;
        TimerPaused = null;
        TimerEnd = DateTime.Now + duration;
    }

    public static void PauseTimer()
    {
        if (TimerEnd == null) return;
        TimerPaused = TimerRemaining;
        TimerEnd = null;
    }

    public static void ResumeTimer()
    {
        if (TimerPaused is not { } left) return;
        Hook();
        TimerEnd = DateTime.Now + left;
        TimerPaused = null;
    }

    public static void ResetTimer()
    {
        TimerEnd = null;
        TimerPaused = null;
    }

    public static void SetAlarm(TimeOnly? time)
    {
        Hook();
        Alarm = time;
    }

    static void Check()
    {
        var now = DateTime.Now;
        if (TimerEnd is { } end && now >= end)
        {
            TimerEnd = null;
            ShellWindow.Current.Notify("Timer abgelaufen", $"Dein Timer über {Format(TimerDuration)} ist abgelaufen.", "clock");
        }
        if (Alarm is { } alarm && now.Hour == alarm.Hour && now.Minute == alarm.Minute && now.Second == 0)
        {
            Alarm = null;
            ShellWindow.Current.Notify("Wecker", $"Es ist {alarm:HH\\:mm} Uhr.", "clock");
        }
    }

    public static string Format(TimeSpan t) => t.TotalHours >= 1 ? t.ToString(@"h\:mm\:ss") : t.ToString(@"mm\:ss");
}

/// <summary>Uhr-App: analoge Uhr, Weltzeit, Stoppuhr, Timer und Wecker.</summary>
public sealed class ClockApp : AppView
{
    static readonly (string City, string Zone)[] Cities =
    [
        ("London", "Europe/London"), ("New York", "America/New_York"), ("Los Angeles", "America/Los_Angeles"),
        ("Tokio", "Asia/Tokyo"), ("Sydney", "Australia/Sydney"), ("Dubai", "Asia/Dubai"), ("São Paulo", "America/Sao_Paulo"),
    ];

    readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromMilliseconds(50) };
    readonly AnalogClock _analog = new() { Width = 220, Height = 220 };
    readonly TextBlock _digital = UI.Text("", 40, FontWeight.SemiBold);
    readonly TextBlock _date = UI.Sub("", 14);
    readonly StackPanel _world = new() { Spacing = 6 };
    readonly TextBlock _stopwatch = UI.Text("", 56, FontWeight.Light);
    readonly StackPanel _laps = new() { Spacing = 2 };
    readonly Button _stopwatchStart;
    readonly TextBlock _timerText = UI.Text("", 56, FontWeight.Light);
    readonly ProgressBar _timerProgress = new() { Minimum = 0, Maximum = 1, Height = 6, Width = 320 };
    readonly NumericUpDown _minutes = new() { Minimum = 1, Maximum = 600, Value = 5, Increment = 1, Width = 140, FormatString = "0" };
    readonly Button _timerStart;
    readonly TimePicker _alarmPicker = new() { ClockIdentifier = "24HourClock" };
    readonly TextBlock _alarmText = UI.Sub("", 13);

    public ClockApp()
    {
        _stopwatchStart = UI.Btn("Start", ToggleStopwatch, accent: true);
        _timerStart = UI.Btn("Start", ToggleTimer, accent: true);

        var clockTab = UI.V(16, _analog.Center(), UI.V(2, _digital.Center(), _date.Center())).Center();

        var worldTab = UI.Scroll(_world.Margin(16, 16, 16, 16));

        var stopwatchTab = UI.V(16,
            _stopwatch.Center(),
            UI.H(8, _stopwatchStart, UI.Btn("Runde", () =>
            {
                if (!ClockService.Stopwatch.IsRunning) return;
                ClockService.Laps.Insert(0, ClockService.Stopwatch.Elapsed);
                RenderLaps();
            }), UI.Btn("Zurücksetzen", () =>
            {
                ClockService.Stopwatch.Reset();
                ClockService.Laps.Clear();
                RenderLaps();
            })).Center(),
            UI.Scroll(_laps).Margin(0, 8, 0, 0));
        stopwatchTab.Margin = new Thickness(24);

        var presets = UI.H(8);
        foreach (var m in new[] { 1, 3, 5, 10, 15, 30 })
        {
            var minutes = m;
            presets.Children.Add(UI.Btn($"{m} Min.", () =>
            {
                _minutes.Value = minutes;
                ClockService.StartTimer(TimeSpan.FromMinutes(minutes));
            }));
        }
        var timerTab = UI.V(16,
            _timerText.Center(),
            _timerProgress.Center(),
            UI.H(8, UI.Sub("Minuten:", 13).VCenter(), _minutes, _timerStart, UI.Btn("Zurücksetzen", ClockService.ResetTimer)).Center(),
            presets.Center(),
            UI.Sub("Der Timer läuft weiter, auch wenn du die Uhr-App schließt.", 12).Center());
        timerTab.Margin = new Thickness(24);

        var alarmTab = UI.V(16,
            Icons.Glyph("bell", 56).Center(),
            UI.Text("Wecker stellen", 20, FontWeight.SemiBold).Center(),
            _alarmPicker.Center(),
            UI.H(8, UI.Btn("Wecker aktivieren", () =>
            {
                if (_alarmPicker.SelectedTime is not { } t) return;
                ClockService.SetAlarm(new TimeOnly(t.Hours, t.Minutes));
                Shell.Notify("Wecker", $"Wecker für {t.Hours:00}:{t.Minutes:00} Uhr gestellt.", "clock");
            }, accent: true), UI.Btn("Deaktivieren", () => ClockService.SetAlarm(null))).Center(),
            _alarmText.Center());
        alarmTab.Margin = new Thickness(24);
        _alarmPicker.SelectedTime = new TimeSpan(DateTime.Now.Hour, DateTime.Now.Minute, 0).Add(TimeSpan.FromMinutes(5));

        Content = new TabControl
        {
            Margin = new Thickness(8, 0, 8, 0),
            ItemsSource = new[]
            {
                new TabItem { Header = "Uhr", Content = clockTab },
                new TabItem { Header = "Weltzeit", Content = worldTab },
                new TabItem { Header = "Stoppuhr", Content = stopwatchTab },
                new TabItem { Header = "Timer", Content = timerTab },
                new TabItem { Header = "Wecker", Content = alarmTab },
            },
        };

        BuildWorld();
        RenderLaps();
        _timer.Tick += (_, _) => Update();
        _timer.Start();
        Update();
    }

    public override void OnClosed() => _timer.Stop();

    void ToggleStopwatch()
    {
        if (ClockService.Stopwatch.IsRunning) ClockService.Stopwatch.Stop();
        else ClockService.Stopwatch.Start();
    }

    void ToggleTimer()
    {
        if (ClockService.TimerEnd != null) ClockService.PauseTimer();
        else if (ClockService.TimerPaused != null) ClockService.ResumeTimer();
        else ClockService.StartTimer(TimeSpan.FromMinutes((double)(_minutes.Value ?? 5)));
    }

    void RenderLaps()
    {
        _laps.Children.Clear();
        for (var i = 0; i < ClockService.Laps.Count; i++)
        {
            var row = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Children =
                {
                    UI.Sub($"Runde {ClockService.Laps.Count - i}", 13).Col(0),
                    UI.Text(ClockService.Laps[i].ToString(@"mm\:ss\,ff"), 13).Col(1),
                },
            };
            _laps.Children.Add(UI.Card(row, 10));
        }
    }

    readonly List<(TextBlock Time, TextBlock Diff, TimeZoneInfo Zone)> _worldRows = [];

    void BuildWorld()
    {
        _world.Children.Add(UI.Text($"Ortszeit · {TimeZoneInfo.Local.DisplayName}", 13, FontWeight.SemiBold).Margin(4, 0, 0, 6));
        foreach (var (city, zoneId) in Cities)
        {
            TimeZoneInfo zone;
            try { zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId); }
            catch { continue; }
            var time = UI.Text("", 22, FontWeight.SemiBold);
            var diff = UI.Sub("", 12);
            _worldRows.Add((time, diff, zone));
            _world.Children.Add(UI.Card(new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                Children =
                {
                    Icons.Glyph("globe", 22).VCenter().Margin(0, 0, 14, 0).Col(0),
                    UI.V(2, UI.Text(city, 15), diff).VCenter().Col(1),
                    time.VCenter().Col(2),
                },
            }, 14));
        }
    }

    void Update()
    {
        var now = DateTime.Now;
        _analog.InvalidateVisual();
        _digital.Text = Sys.FormatTime(now, true);
        _date.Text = now.ToString("dddd, d. MMMM yyyy", Sys.German);

        foreach (var (time, diff, zone) in _worldRows)
        {
            var there = TimeZoneInfo.ConvertTime(now, zone);
            time.Text = Sys.FormatTime(there, false);
            var hours = (there - now).TotalHours;
            var day = there.Date == now.Date ? "Heute" : there.Date > now.Date ? "Morgen" : "Gestern";
            diff.Text = $"{day}, {(hours >= 0 ? "+" : "")}{hours:0.#} Std.";
        }

        _stopwatch.Text = ClockService.Stopwatch.Elapsed.ToString(@"hh\:mm\:ss\,ff");
        _stopwatchStart.Content = ClockService.Stopwatch.IsRunning ? "Anhalten" : "Start";

        var remaining = ClockService.TimerRemaining;
        _timerText.Text = ClockService.Format(ClockService.TimerEnd != null || ClockService.TimerPaused != null ? remaining : TimeSpan.FromMinutes((double)(_minutes.Value ?? 5)));
        _timerProgress.Value = ClockService.TimerDuration.TotalSeconds > 0 && (ClockService.TimerEnd != null || ClockService.TimerPaused != null)
            ? remaining.TotalSeconds / ClockService.TimerDuration.TotalSeconds
            : 0;
        _timerStart.Content = ClockService.TimerEnd != null ? "Pause" : ClockService.TimerPaused != null ? "Fortsetzen" : "Start";

        _alarmText.Text = ClockService.Alarm is { } alarm ? $"Wecker aktiv: {alarm:HH\\:mm} Uhr" : "Kein Wecker gestellt";
    }

    /// <summary>Analoge Uhr mit Stunden-, Minuten- und Sekundenzeiger.</summary>
    sealed class AnalogClock : Control
    {
        public override void Render(DrawingContext context)
        {
            var size = Math.Min(Bounds.Width, Bounds.Height);
            var c = new Point(Bounds.Width / 2, Bounds.Height / 2);
            var r = size / 2 - 4;
            var dark = Sys.Settings.DarkMode;
            var face = new SolidColorBrush(Color.Parse(dark ? "#2B2B2B" : "#FFFFFF"));
            var ink = new SolidColorBrush(Color.Parse(dark ? "#FFFFFF" : "#1B1B1B"));
            var accent = (Application.Current?.Resources.TryGetResource("W12.Accent", null, out var a) == true ? a as IBrush : null) ?? Brushes.DodgerBlue;

            context.DrawEllipse(face, new Pen(new SolidColorBrush(Color.FromArgb(60, 128, 128, 128)), 2), c, r, r);
            for (var i = 0; i < 60; i++)
            {
                var angle = i * Math.PI / 30;
                var inner = i % 5 == 0 ? r - 14 : r - 7;
                context.DrawLine(new Pen(ink, i % 5 == 0 ? 2.5 : 1),
                    new Point(c.X + Math.Sin(angle) * inner, c.Y - Math.Cos(angle) * inner),
                    new Point(c.X + Math.Sin(angle) * (r - 3), c.Y - Math.Cos(angle) * (r - 3)));
            }

            var now = DateTime.Now;
            var sec = now.Second + now.Millisecond / 1000.0;
            var min = now.Minute + sec / 60;
            var hour = now.Hour % 12 + min / 60;
            void Hand(double fraction, double length, double width, IBrush brush)
            {
                var angle = fraction * Math.PI * 2;
                context.DrawLine(new Pen(brush, width, lineCap: PenLineCap.Round), c,
                    new Point(c.X + Math.Sin(angle) * length, c.Y - Math.Cos(angle) * length));
            }
            Hand(hour / 12, r * 0.5, 6, ink);
            Hand(min / 60, r * 0.75, 4, ink);
            Hand(sec / 60, r * 0.85, 2, accent);
            context.DrawEllipse(accent, null, c, 5, 5);
        }
    }
}
