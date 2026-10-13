using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Templates;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>Task-Manager: offene Apps, echte Prozesse des Systems und Leistungsdiagramme.</summary>
public sealed class TaskManagerApp : AppView
{
    sealed record ProcRow(int Pid, string Name, long Memory, double Cpu);

    readonly TabControl _tabs;
    readonly StackPanel _appsList = new() { Spacing = 6 };
    readonly ListBox _procList;
    readonly TextBox _procFilter = new() { PlaceholderText = "Prozess suchen", Width = 240 };
    readonly TextBlock _procCount = UI.Sub("", 12);
    readonly LineGraph _cpuGraph = new(Color.Parse("#4CC2FF"));
    readonly LineGraph _memGraph = new(Color.Parse("#B388FF"));
    readonly TextBlock _cpuText = UI.Text("", 26, FontWeight.SemiBold);
    readonly TextBlock _memText = UI.Text("", 26, FontWeight.SemiBold);
    readonly TextBlock _cpuDetails = UI.Sub("", 12, wrap: true);
    readonly TextBlock _memDetails = UI.Sub("", 12, wrap: true);
    readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };
    readonly Dictionary<int, TimeSpan> _lastCpu = [];
    DateTime _lastSample = DateTime.UtcNow;
    List<ProcRow> _processes = [];
    bool _sampling;

    public TaskManagerApp()
    {
        _procList = new ListBox
        {
            ItemTemplate = new FuncDataTemplate<ProcRow>((p, _) => p == null ? new Border() : ProcessRow(p)),
        };
        _procFilter.TextChanged += (_, _) => ShowProcesses();

        var killButton = UI.Btn("Task beenden", KillSelected);
        var procHeader = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,90,80,130"),
            Margin = new Thickness(12, 6, 24, 4),
            Children = { UI.Sub("Name", 12).Col(0), UI.Sub("PID", 12).Col(1), UI.Sub("CPU", 12).Col(2), UI.Sub("Arbeitsspeicher", 12).Col(3) },
        };
        var procToolbar = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(8),
            Children = { _procFilter.Col(0), _procCount.VCenter().Margin(12, 0, 0, 0).Col(1), killButton.Col(2) },
        };
        var processes = new DockPanel { Children = { procToolbar.Dock(Avalonia.Controls.Dock.Top), procHeader.Dock(Avalonia.Controls.Dock.Top), _procList } };

        var performance = UI.Scroll(UI.V(16,
            GraphCard("cpu", "CPU-Auslastung", _cpuText, _cpuGraph, _cpuDetails),
            GraphCard("memory", "Arbeitsspeicher", _memText, _memGraph, _memDetails)).Margin(16, 12, 16, 16));

        _tabs = new TabControl
        {
            Padding = new Thickness(0),
            Margin = new Thickness(8, 0, 8, 0),
            ItemsSource = new[]
            {
                new TabItem { Header = "Apps", Content = UI.Scroll(_appsList.Margin(8, 8, 8, 8)) },
                new TabItem { Header = "Prozesse", Content = processes },
                new TabItem { Header = "Leistung", Content = performance },
            },
        };
        _tabs.SelectionChanged += (_, _) => Tick();
        Content = _tabs;

        Shell.WM.Changed += RefreshApps;
        _timer.Tick += (_, _) => Tick();
        _timer.Start();
        RefreshApps();
        Tick();
    }

    public override void OnClosed()
    {
        _timer.Stop();
        Shell.WM.Changed -= RefreshApps;
    }

    static Control GraphCard(string icon, string title, TextBlock value, LineGraph graph, TextBlock details)
    {
        graph.Height = 160;
        return UI.Card(UI.V(10,
            new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                Children =
                {
                    Icons.Glyph(icon, 20).VCenter().Margin(0, 0, 10, 0).Col(0),
                    UI.Text(title, 15, FontWeight.SemiBold).VCenter().Col(1),
                    value.Col(2),
                },
            },
            graph,
            details), 16);
    }

    // ------------------------------------------------------------ Apps

    void RefreshApps()
    {
        _appsList.Children.Clear();
        var windows = Shell.WM.Windows.ToList();
        _appsList.Children.Add(UI.Sub($"{windows.Count} geöffnete Fenster", 12).Margin(4, 0, 0, 4));
        foreach (var w in windows)
        {
            var window = w;
            var state = w.IsMinimized ? "Minimiert" : w == Shell.WM.Active ? "Aktiv" : "Wird ausgeführt";
            var row = new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto"),
                Children =
                {
                    Icons.Tile(w.App, 30).Margin(0, 0, 12, 0).Col(0),
                    UI.V(2, UI.Text(w.Title, 13), UI.Sub($"{w.App.Name} · {state} · Desktop {w.Desktop + 1}", 12)).VCenter().Col(1),
                    UI.Btn("Wechseln zu", () => Shell.WM.Activate(window)).VCenter().Margin(8, 0, 8, 0).Col(2),
                    UI.Btn("Task beenden", () => Shell.WM.ForceClose(window)).VCenter().Col(3),
                },
            };
            if (w == Window) row.Children[^1].IsEnabled = false;
            _appsList.Children.Add(UI.Card(row, 10));
        }
    }

    // ------------------------------------------------------------ Prozesse & Leistung

    void Tick()
    {
        if (_tabs.SelectedIndex == 0 || _sampling) return;
        _sampling = true;
        Task.Run(Sample).ContinueWith(t =>
        {
            Dispatcher.UIThread.Post(() =>
            {
                _sampling = false;
                if (t.Result is not { } result) return;
                _processes = result.Rows;
                UpdatePerformance(result.Cpu, result.Memory);
                if (_tabs.SelectedIndex == 1) ShowProcesses();
            });
        });
    }

    (List<ProcRow> Rows, double Cpu, long Memory)? Sample()
    {
        try
        {
            var now = DateTime.UtcNow;
            var elapsed = (now - _lastSample).TotalMilliseconds;
            _lastSample = now;
            var rows = new List<ProcRow>();
            double cpuTotal = 0;
            long memTotal = 0;
            var seen = new HashSet<int>();

            foreach (var p in Process.GetProcesses())
            {
                using (p)
                {
                    try
                    {
                        var mem = p.WorkingSet64;
                        memTotal += mem;
                        double cpu = 0;
                        try
                        {
                            var time = p.TotalProcessorTime;
                            if (_lastCpu.TryGetValue(p.Id, out var last) && elapsed > 0)
                                cpu = (time - last).TotalMilliseconds / elapsed / Environment.ProcessorCount * 100;
                            _lastCpu[p.Id] = time;
                        }
                        catch
                        {
                            // Kein Zugriff auf die CPU-Zeit dieses Prozesses.
                        }
                        cpu = Math.Clamp(cpu, 0, 100);
                        cpuTotal += cpu;
                        seen.Add(p.Id);
                        rows.Add(new ProcRow(p.Id, p.ProcessName, mem, cpu));
                    }
                    catch
                    {
                        // Prozess beendet oder kein Zugriff.
                    }
                }
            }
            foreach (var pid in _lastCpu.Keys.Where(k => !seen.Contains(k)).ToList()) _lastCpu.Remove(pid);
            return (rows, Math.Clamp(cpuTotal, 0, 100), memTotal);
        }
        catch
        {
            return null;
        }
    }

    void UpdatePerformance(double cpu, long memory)
    {
        var total = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
        var memPercent = total > 0 ? Math.Clamp(memory * 100.0 / total, 0, 100) : 0;
        _cpuGraph.Push(cpu);
        _memGraph.Push(memPercent);
        _cpuText.Text = $"{cpu:0} %";
        _memText.Text = $"{memPercent:0} %";
        var uptime = DateTime.Now - Sys.BootTime;
        _cpuDetails.Text = $"{Environment.ProcessorCount} logische Prozessoren · {_processes.Count} Prozesse · Betriebszeit {(int)uptime.TotalHours:00}:{uptime.Minutes:00}:{uptime.Seconds:00}";
        _memDetails.Text = $"In Verwendung: {Sys.FormatSize(memory)} von {Sys.FormatSize(total)} (Summe der Arbeitsspeicher aller Prozesse)";
    }

    void ShowProcesses()
    {
        var filter = _procFilter.Text?.Trim() ?? "";
        var selectedPid = (_procList.SelectedItem as ProcRow)?.Pid;
        var rows = _processes
            .Where(p => filter.Length == 0 || p.Name.Contains(filter, StringComparison.OrdinalIgnoreCase) || p.Pid.ToString() == filter)
            .OrderByDescending(p => p.Memory)
            .ToList();
        _procList.ItemsSource = rows;
        _procList.SelectedItem = rows.FirstOrDefault(r => r.Pid == selectedPid);
        _procCount.Text = $"{rows.Count} Prozesse";
    }

    static Control ProcessRow(ProcRow p) => new Grid
    {
        ColumnDefinitions = new ColumnDefinitions("*,90,80,130"),
        Background = Brushes.Transparent,
        Children =
        {
            UI.H(8, Icons.Glyph("app", 14), UI.Text(p.Name, 13).VCenter()).Col(0),
            UI.Sub(p.Pid.ToString(), 12).VCenter().Col(1),
            UI.Sub($"{p.Cpu:0.0} %", 12).VCenter().Col(2),
            UI.Sub(Sys.FormatSize(p.Memory), 12).VCenter().Col(3),
        },
    };

    async void KillSelected()
    {
        if (_procList.SelectedItem is not ProcRow row) return;
        var self = Environment.ProcessId == row.Pid;
        var message = self
            ? "Das ist Windows 12 selbst. Beim Beenden wird das System sofort geschlossen. Fortfahren?"
            : $"Möchtest du „{row.Name}“ (PID {row.Pid}) beenden? Nicht gespeicherte Daten gehen verloren.";
        if (await Shell.Dialogs.MessageAsync("Task beenden", message, "Prozess beenden", "Abbrechen") != "Prozess beenden") return;
        try
        {
            using var p = Process.GetProcessById(row.Pid);
            p.Kill();
            Shell.Notify("Task-Manager", $"„{row.Name}“ wurde beendet.", "taskmgr");
        }
        catch (Exception ex)
        {
            await Shell.Dialogs.MessageAsync("Task beenden", $"Der Prozess konnte nicht beendet werden: {ex.Message}", "OK");
        }
    }

    /// <summary>Einfaches Liniendiagramm (letzte 60 Werte, 0–100 %).</summary>
    sealed class LineGraph(Color color) : Control
    {
        readonly Queue<double> _values = new();

        public void Push(double value)
        {
            _values.Enqueue(value);
            while (_values.Count > 60) _values.Dequeue();
            InvalidateVisual();
        }

        public override void Render(DrawingContext context)
        {
            var w = Bounds.Width;
            var h = Bounds.Height;
            var grid = new Pen(new SolidColorBrush(Color.FromArgb(40, 128, 128, 128)), 1);
            context.DrawRectangle(new SolidColorBrush(Color.FromArgb(20, color.R, color.G, color.B)), new Pen(new SolidColorBrush(color), 1), new Rect(0, 0, w, h));
            for (var i = 1; i < 4; i++) context.DrawLine(grid, new Point(0, h * i / 4), new Point(w, h * i / 4));
            for (var i = 1; i < 6; i++) context.DrawLine(grid, new Point(w * i / 6, 0), new Point(w * i / 6, h));

            var values = _values.ToArray();
            if (values.Length < 2) return;
            var step = w / 59;
            var x0 = w - (values.Length - 1) * step;
            var line = new StreamGeometry();
            var area = new StreamGeometry();
            using (var l = line.Open())
            using (var a = area.Open())
            {
                a.BeginFigure(new Point(x0, h), true);
                for (var i = 0; i < values.Length; i++)
                {
                    var p = new Point(x0 + i * step, h - values[i] / 100 * h);
                    if (i == 0) l.BeginFigure(p, false);
                    else l.LineTo(p);
                    a.LineTo(p);
                }
                a.LineTo(new Point(w, h));
                a.EndFigure(true);
                l.EndFigure(false);
            }
            context.DrawGeometry(new SolidColorBrush(Color.FromArgb(70, color.R, color.G, color.B)), null, area);
            context.DrawGeometry(null, new Pen(new SolidColorBrush(color), 2), line);
        }
    }
}
