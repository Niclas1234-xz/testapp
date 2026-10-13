using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Widgets-Board: Uhr, Systeminfo, Notizen, Kalenderfakten und Tipps.</summary>
public sealed class WidgetsPanel : Flyout
{
    static readonly string[] Tips =
    [
        "Ziehe ein Fenster an den linken oder rechten Bildschirmrand, um es anzudocken. In die Ecken gezogen, belegt es ein Viertel.",
        "Mit Strg+Tab öffnest du die Task-Ansicht. Dort kannst du weitere virtuelle Desktops anlegen.",
        "Tippe im Startmenü einfach eine Rechnung ein, z. B. 12*7 – das Ergebnis erscheint sofort.",
        "Der Assistent versteht Befehle wie „öffne Paint“, „dunkelmodus an“ oder „lautstärke 30“.",
        "Gelöschte Dateien landen im Papierkorb und lassen sich von dort wiederherstellen.",
        "Rechtsklick auf die Taskleiste öffnet den Task-Manager.",
        "In Fotos kannst du jedes Bild mit einem Klick als Desktophintergrund festlegen.",
        "Strg+Alt+R öffnet „Ausführen“ – praktisch, um Apps per Name zu starten.",
    ];

    readonly TextBlock _greeting = UI.Text("", 22, FontWeight.SemiBold);
    readonly TextBlock _time = UI.Text("", 46, FontWeight.Light);
    readonly TextBlock _date = UI.Sub("", 14);
    readonly TextBlock _uptime = UI.Text("", 13);
    readonly TextBlock _memory = UI.Text("", 13);
    readonly ProgressBar _memoryBar = new() { Minimum = 0, Maximum = 100, Height = 4 };
    readonly TextBlock _dayFacts = UI.Text("", 13, wrap: true);
    readonly TextBlock _files = UI.Text("", 13, wrap: true);
    readonly TextBlock _tip = UI.Text("", 13, wrap: true);
    readonly TextBox _notes;
    int _tipIndex = Random.Shared.Next(Tips.Length);
    IDisposable? _saveNotes;

    public WidgetsPanel() : base(460, "translateX(-40px)")
    {
        var shell = ShellWindow.Current;

        _notes = new TextBox
        {
            AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap,
            Height = 110,
            Text = Sys.Settings.Notes,
        };
        _notes.TextChanged += (_, _) =>
        {
            _saveNotes?.Dispose();
            _saveNotes = DispatcherTimer.RunOnce(() => Sys.Set("notes", s => s.Notes = _notes.Text ?? ""), TimeSpan.FromSeconds(1));
        };

        var clock = Widget("clock", "Uhr", UI.V(0, _time, _date), () => shell.Launch("clock"));
        var system = Widget("cpu", "System", UI.V(6,
            UI.H(8, UI.Sub("Betriebszeit:", 13), _uptime),
            UI.H(8, UI.Sub("Arbeitsspeicher:", 13), _memory),
            _memoryBar,
            UI.Sub($"{Environment.ProcessorCount} Prozessorkerne · {RuntimeInformation.OSDescription}", 12, wrap: true)),
            () => shell.Launch("taskmgr"));
        var notes = Widget("note", "Notizen", _notes, null);
        var today = Widget("calendar", "Heute", _dayFacts, () => shell.ToggleFlyout(shell.NotificationCenter));
        var files = Widget("folder", "Meine Dateien", _files, () => shell.Launch("explorer"));
        var tipNext = UI.Flat(UI.Text("Nächster Tipp", 12), () =>
        {
            _tipIndex = (_tipIndex + 1) % Tips.Length;
            _tip.Text = Tips[_tipIndex];
        });
        var tip = Widget("star", "Tipp", UI.V(8, _tip, tipNext), null);

        var grid = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,*"),
            RowDefinitions = new RowDefinitions("Auto,Auto,Auto"),
        };
        grid.Children.Add(clock.Col(0).Row(0).Margin(0, 0, 6, 12));
        grid.Children.Add(today.Col(1).Row(0).Margin(6, 0, 0, 12));
        grid.Children.Add(system.Col(0, 2).Row(1).Margin(0, 0, 0, 12));
        grid.Children.Add(notes.Col(0).Row(2).Margin(0, 0, 6, 12));
        grid.Children.Add(files.Col(1).Row(2).Margin(6, 0, 0, 12));

        Child = UI.Scroll(UI.V(16, _greeting, grid, tip).Margin(20, 20, 20, 20));
        shell.Tick += () =>
        {
            if (IsOpen) Update();
        };
    }

    static Border Widget(string icon, string title, Control content, Action? open)
    {
        var header = UI.H(8, Icons.Glyph(icon, 14), UI.Sub(title, 12).VCenter());
        var card = UI.Card(UI.V(10, header, content), 14);
        if (open != null)
        {
            header.Children.Add(Icons.Glyph("chevron-right", 12));
            header.Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand);
            header.PointerPressed += (_, _) => open();
        }
        return card;
    }

    protected override void OnOpening()
    {
        _tip.Text = Tips[_tipIndex];
        _notes.Text = Sys.Settings.Notes;
        Update();
    }

    void Update()
    {
        var now = DateTime.Now;
        var name = Sys.Settings.UserName;
        _greeting.Text = now.Hour switch
        {
            < 5 => $"Gute Nacht, {name}",
            < 11 => $"Guten Morgen, {name}",
            < 17 => $"Guten Tag, {name}",
            < 22 => $"Guten Abend, {name}",
            _ => $"Gute Nacht, {name}",
        };
        _time.Text = Sys.FormatTime(now, false);
        _date.Text = now.ToString("dddd, d. MMMM", Sys.German);

        var up = now - Sys.BootTime;
        _uptime.Text = up.TotalHours >= 1 ? $"{(int)up.TotalHours} Std. {up.Minutes} Min." : $"{up.Minutes} Min. {up.Seconds} Sek.";

        using var self = Process.GetCurrentProcess();
        var used = self.WorkingSet64;
        var total = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
        _memory.Text = $"{Sys.FormatSize(used)} von {Sys.FormatSize(total)} (Windows 12)";
        _memoryBar.Value = total > 0 ? used * 100.0 / total : 0;

        var week = ISOWeek.GetWeekOfYear(now);
        var daysLeft = (new DateTime(now.Year, 12, 31) - now.Date).Days;
        _dayFacts.Text = $"KW {week} · Tag {now.DayOfYear}\nNoch {daysLeft} Tage bis Silvester";

        _files.Text = $"{Count(UserFolders.Desktop)} auf dem Desktop\n{Count(UserFolders.Documents)} in Dokumente\n{Count(UserFolders.Pictures)} in Bilder";
    }

    static int Count(string dir)
    {
        try { return Directory.EnumerateFileSystemEntries(dir).Count(); }
        catch { return 0; }
    }

    public override void UpdatePlacement()
    {
        HorizontalAlignment = HorizontalAlignment.Left;
        VerticalAlignment = VerticalAlignment.Stretch;
        Margin = new Thickness(8, TopOffset, 0, ShellWindow.TaskbarReserve + 4);
    }
}
