using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>
/// Terminal mit eingebauten Befehlen (dir, cd, mkdir, type, ipconfig, ping, …).
/// Unbekannte Befehle werden an die echte Shell des Systems weitergereicht.
/// </summary>
public sealed class TerminalApp : AppView
{
    static readonly FontFamily Mono = new("Cascadia Mono, Consolas, DejaVu Sans Mono, Liberation Mono, monospace");
    const int MaxBuffer = 120_000;

    readonly SelectableTextBlock _output;
    readonly ScrollViewer _outputScroll;
    readonly TextBlock _prompt;
    readonly TextBox _input;
    readonly StringBuilder _buffer = new();
    readonly List<string> _history = [];
    int _historyIndex;
    string _cwd;
    Process? _running;
    CancellationTokenSource? _cancel;

    public TerminalApp(string? startDirectory)
    {
        _cwd = startDirectory != null && Directory.Exists(startDirectory) ? startDirectory : UserFolders.Root;
        var fg = new SolidColorBrush(Color.Parse("#CCCCCC"));

        _output = new SelectableTextBlock
        {
            TextWrapping = TextWrapping.Wrap,
            FontFamily = Mono,
            FontSize = 13,
            Foreground = fg,
            Padding = new Thickness(12, 10, 12, 4),
        };
        _outputScroll = UI.Scroll(_output);
        _prompt = new TextBlock { FontFamily = Mono, FontSize = 13, Foreground = fg, VerticalAlignment = VerticalAlignment.Center };
        _input = new TextBox
        {
            FontFamily = Mono,
            FontSize = 13,
            Foreground = Brushes.White,
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            Padding = new Thickness(4, 4),
            MinHeight = 0,
            CaretBrush = Brushes.White,
        }.Plain();
        foreach (var state in new[] { "", "PointerOver", "Focused" })
            _input.Resources["TextControlForeground" + state] = Brushes.White;
        _input.AddHandler(KeyDownEvent, InputKeyDown, RoutingStrategies.Tunnel);

        var inputRow = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            Margin = new Thickness(12, 0, 12, 10),
            Children = { _prompt.Col(0), _input.Col(1) },
        };

        Content = new Border
        {
            Background = new SolidColorBrush(Color.Parse("#0C0C0C")),
            Child = new DockPanel { Children = { inputRow.Dock(Avalonia.Controls.Dock.Bottom), _outputScroll } },
        };

        Write($"Windows 12 Terminal [Version 12.0.30000.1]\nFan-Projekt – kein offizielles Microsoft-Produkt.\nGib „hilfe“ ein, um alle Befehle zu sehen.\n\n");
        UpdatePrompt();
        _output.PointerReleased += (_, _) =>
        {
            if (string.IsNullOrEmpty(_output.SelectedText)) _input.Focus();
        };
    }

    public override void OnActivated() => Dispatcher.UIThread.Post(() => _input.Focus(), DispatcherPriority.Background);

    public override void OnClosed() => KillRunning();

    void UpdatePrompt()
    {
        _prompt.Text = _running != null ? "" : $"{DisplayPath(_cwd)}>";
        var name = Path.GetFileName(_cwd.TrimEnd(Path.DirectorySeparatorChar));
        SetTitle($"Terminal – {(name.Length > 0 ? name : _cwd)}");
    }

    /// <summary>Kürzt den Windows-12-Stammordner im Prompt zu „~“.</summary>
    static string DisplayPath(string path) =>
        path.StartsWith(UserFolders.Root, StringComparison.Ordinal) ? "~" + path[UserFolders.Root.Length..] : path;

    void Write(string text)
    {
        _buffer.Append(text);
        if (_buffer.Length > MaxBuffer) _buffer.Remove(0, _buffer.Length - MaxBuffer);
        _output.Text = _buffer.ToString();
        Dispatcher.UIThread.Post(() => _outputScroll.ScrollToEnd(), DispatcherPriority.Background);
    }

    void WriteLine(string text = "") => Write(text + "\n");

    // ------------------------------------------------------------ Eingabe

    void InputKeyDown(object? sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Enter:
                e.Handled = true;
                var line = _input.Text ?? "";
                _input.Text = "";
                if (_running != null)
                {
                    WriteLine(line);
                    _running.StandardInput.WriteLine(line);
                    return;
                }
                WriteLine($"{DisplayPath(_cwd)}>{line}");
                if (line.Trim().Length > 0)
                {
                    _history.Add(line);
                    _historyIndex = _history.Count;
                }
                _ = ExecuteAsync(line.Trim());
                break;
            case Key.Up when _history.Count > 0:
                e.Handled = true;
                _historyIndex = Math.Max(0, _historyIndex - 1);
                _input.Text = _history[_historyIndex];
                _input.CaretIndex = _input.Text.Length;
                break;
            case Key.Down when _history.Count > 0:
                e.Handled = true;
                _historyIndex = Math.Min(_history.Count, _historyIndex + 1);
                _input.Text = _historyIndex < _history.Count ? _history[_historyIndex] : "";
                _input.CaretIndex = _input.Text.Length;
                break;
            case Key.C when e.KeyModifiers.HasFlag(KeyModifiers.Control) && _running != null:
                e.Handled = true;
                KillRunning();
                WriteLine("^C");
                break;
            case Key.L when e.KeyModifiers.HasFlag(KeyModifiers.Control):
                e.Handled = true;
                _buffer.Clear();
                Write("");
                break;
            case Key.Tab:
                e.Handled = true;
                Complete();
                break;
        }
    }

    /// <summary>Tab-Vervollständigung für Datei- und Ordnernamen.</summary>
    void Complete()
    {
        var text = _input.Text ?? "";
        var start = text.LastIndexOf(' ') + 1;
        var partial = text[start..].Trim('"');
        try
        {
            var dir = Path.GetDirectoryName(partial) is { Length: > 0 } d ? Resolve(d) : _cwd;
            var prefix = Path.GetFileName(partial);
            var match = Directory.EnumerateFileSystemEntries(dir)
                .Select(Path.GetFileName)
                .FirstOrDefault(n => n != null && n.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            if (match == null) return;
            var completed = Path.Combine(Path.GetDirectoryName(partial) ?? "", match);
            if (completed.Contains(' ')) completed = $"\"{completed}\"";
            _input.Text = text[..start] + completed;
            _input.CaretIndex = _input.Text.Length;
        }
        catch
        {
            // Keine Vervollständigung möglich.
        }
    }

    // ------------------------------------------------------------ Befehle

    static List<string> SplitArgs(string line)
    {
        var args = new List<string>();
        var current = new StringBuilder();
        var quoted = false;
        foreach (var c in line)
        {
            if (c == '"') { quoted = !quoted; continue; }
            if (c == ' ' && !quoted)
            {
                if (current.Length > 0) { args.Add(current.ToString()); current.Clear(); }
                continue;
            }
            current.Append(c);
        }
        if (current.Length > 0) args.Add(current.ToString());
        return args;
    }

    string Resolve(string path)
    {
        if (path == "~") return UserFolders.Root;
        if (path.StartsWith("~/") || path.StartsWith("~\\")) path = Path.Combine(UserFolders.Root, path[2..]);
        return Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(_cwd, path));
    }

    async Task ExecuteAsync(string line)
    {
        if (line.Length == 0) return;
        var args = SplitArgs(line);
        var cmd = args[0].ToLowerInvariant();
        var rest = line[args[0].Length..].Trim();

        try
        {
            switch (cmd)
            {
                case "hilfe" or "help" or "?": Help(); break;
                case "cls" or "clear": _buffer.Clear(); Write(""); break;
                case "echo": WriteLine(rest); break;
                case "cd" or "chdir":
                    if (args.Count == 1) { WriteLine(_cwd); break; }
                    var target = Resolve(rest.Trim('"'));
                    if (!Directory.Exists(target)) { WriteLine("Das System kann den angegebenen Pfad nicht finden."); break; }
                    _cwd = target;
                    break;
                case "pwd": WriteLine(_cwd); break;
                case "dir" or "ls": Dir(args.Count > 1 ? Resolve(args[1]) : _cwd); break;
                case "tree": Tree(args.Count > 1 ? Resolve(args[1]) : _cwd); break;
                case "mkdir" or "md":
                    RequireArgs(args, 2);
                    Directory.CreateDirectory(Resolve(args[1]));
                    break;
                case "rmdir" or "rd" or "del" or "rm" or "erase":
                    RequireArgs(args, 2);
                    foreach (var p in args.Skip(1).Where(a => !a.StartsWith('-') && !a.StartsWith('/')))
                    {
                        var full = Resolve(p);
                        if (!File.Exists(full) && !Directory.Exists(full)) { WriteLine($"Nicht gefunden: {p}"); continue; }
                        RecycleBin.Delete(full);
                        WriteLine($"In den Papierkorb verschoben: {Path.GetFileName(full)}");
                    }
                    break;
                case "type" or "cat":
                    RequireArgs(args, 2);
                    WriteLine(await File.ReadAllTextAsync(Resolve(args[1])));
                    break;
                case "touch":
                    RequireArgs(args, 2);
                    var file = Resolve(args[1]);
                    if (File.Exists(file)) File.SetLastWriteTime(file, DateTime.Now);
                    else await File.WriteAllTextAsync(file, "");
                    break;
                case "copy" or "cp":
                    RequireArgs(args, 3);
                    FileOps.Copy(Resolve(args[1]), TargetPath(args[1], args[2]));
                    WriteLine("        1 Datei(en) kopiert.");
                    break;
                case "move" or "mv":
                    RequireArgs(args, 3);
                    FileOps.Move(Resolve(args[1]), TargetPath(args[1], args[2]));
                    WriteLine("        1 Datei(en) verschoben.");
                    break;
                case "ren" or "rename":
                    RequireArgs(args, 3);
                    var source = Resolve(args[1]);
                    FileOps.Move(source, Path.Combine(Path.GetDirectoryName(source)!, args[2]));
                    break;
                case "date": WriteLine($"Aktuelles Datum: {DateTime.Now.ToString("dddd, dd.MM.yyyy", Sys.German)}"); break;
                case "time": WriteLine($"Aktuelle Zeit: {DateTime.Now:HH:mm:ss,ff}"); break;
                case "whoami": WriteLine($"{Environment.MachineName.ToLowerInvariant()}\\{Sys.Settings.UserName.ToLowerInvariant()}"); break;
                case "hostname": WriteLine(Environment.MachineName); break;
                case "ver" or "winver": WriteLine("\nWindows 12 [Version 12.0.30000.1]\n"); break;
                case "systeminfo": SystemInfo(); break;
                case "tasklist": TaskList(); break;
                case "taskkill": TaskKill(args); break;
                case "start" or "open":
                    RequireArgs(args, 2);
                    Start(rest.Trim('"'));
                    break;
                case "calc" or "=":
                    if (args.Count == 1) { Shell.Launch("calc"); break; }
                    WriteLine(MathEval.TryEvaluate(rest, out var value) ? MathEval.Format(value) : "Ungültiger Ausdruck.");
                    break;
                case "ipconfig": IpConfig(); break;
                case "ping":
                    RequireArgs(args, 2);
                    await PingAsync(args[1]);
                    break;
                case "history":
                    for (var i = 0; i < _history.Count; i++) WriteLine($"{i + 1,4}  {_history[i]}");
                    break;
                case "color":
                    RequireArgs(args, 2);
                    _output.Foreground = new SolidColorBrush(Color.Parse(args[1].StartsWith('#') ? args[1] : "#" + args[1]));
                    break;
                case "exit":
                    if (Window != null) Shell.WM.Close(Window);
                    return;
                default:
                    var app = AppRegistry.All.FirstOrDefault(a => a.Id == cmd || a.Name.Equals(cmd, StringComparison.OrdinalIgnoreCase));
                    if (app != null)
                    {
                        Shell.Launch(app.Id, args.Count > 1 ? Resolve(args[1]) : null);
                        break;
                    }
                    await RunExternalAsync(line);
                    break;
            }
        }
        catch (TerminalUsageException ex)
        {
            WriteLine(ex.Message);
        }
        catch (Exception ex)
        {
            WriteLine($"Fehler: {ex.Message}");
        }

        if (_buffer.Length > 0 && _buffer[^1] != '\n') WriteLine();
        WriteLine();
        UpdatePrompt();
    }

    sealed class TerminalUsageException(string message) : Exception(message);

    static void RequireArgs(List<string> args, int count)
    {
        if (args.Count < count) throw new TerminalUsageException("Die Syntax des Befehls ist falsch. Gib „hilfe“ ein.");
    }

    string TargetPath(string source, string target)
    {
        var full = Resolve(target);
        return Directory.Exists(full) ? Path.Combine(full, Path.GetFileName(Resolve(source))) : full;
    }

    void Help()
    {
        WriteLine("""
            Eingebaute Befehle:
              hilfe                Diese Hilfe anzeigen
              cls / clear          Bildschirm löschen (auch Strg+L)
              echo <Text>          Text ausgeben
              cd <Ordner>          Ordner wechseln (cd .. / cd ~)
              dir / ls [Ordner]    Inhalt anzeigen
              tree [Ordner]        Ordnerstruktur anzeigen
              mkdir <Name>         Ordner erstellen
              del / rm <Name>      In den Papierkorb verschieben
              type / cat <Datei>   Dateiinhalt anzeigen
              touch <Datei>        Leere Datei erstellen
              copy / move / ren    Kopieren, verschieben, umbenennen
              start <App|Datei>    App oder Datei öffnen (z. B. start paint)
              calc <Ausdruck>      Rechnen, z. B. calc (3+4)*2^3
              date / time          Datum bzw. Uhrzeit
              whoami / hostname    Benutzer bzw. Computername
              ver / systeminfo     Versions- und Systeminfos
              tasklist / taskkill  Offene Fenster anzeigen bzw. schließen
              ipconfig             Netzwerkadapter anzeigen
              ping <Host>          Erreichbarkeit prüfen
              history              Befehlsverlauf
              color <Farbe>        Textfarbe ändern (z. B. color 00FF00)
              exit                 Terminal schließen

            App-Namen (explorer, notepad, paint, …) starten die jeweilige App.
            Alle anderen Befehle werden an die System-Shell weitergegeben.
            Strg+C bricht laufende Befehle ab, Tab vervollständigt Pfade.
            """);
    }

    void Dir(string path)
    {
        var info = new DirectoryInfo(path);
        if (!info.Exists) { WriteLine("Datei nicht gefunden"); return; }
        WriteLine($" Verzeichnis von {info.FullName}\n");
        int files = 0, dirs = 0;
        long bytes = 0;
        foreach (var entry in info.EnumerateFileSystemInfos().OrderBy(e => e is FileInfo).ThenBy(e => e.Name))
        {
            var date = entry.LastWriteTime.ToString("dd.MM.yyyy  HH:mm");
            if (entry is FileInfo f)
            {
                files++;
                bytes += f.Length;
                WriteLine($"{date}    {f.Length,14:N0} {f.Name}");
            }
            else
            {
                dirs++;
                WriteLine($"{date}    <DIR>          {entry.Name}");
            }
        }
        WriteLine($"{files,16} Datei(en),{bytes,15:N0} Bytes");
        WriteLine($"{dirs,16} Verzeichnis(se)");
    }

    void Tree(string path)
    {
        WriteLine(path);
        void Walk(string dir, string indent, int depth)
        {
            if (depth > 3) return;
            string[] children;
            try { children = Directory.GetDirectories(dir).Where(d => !Path.GetFileName(d).StartsWith('.')).OrderBy(d => d).ToArray(); }
            catch { return; }
            for (var i = 0; i < children.Length; i++)
            {
                var last = i == children.Length - 1;
                WriteLine($"{indent}{(last ? "└───" : "├───")}{Path.GetFileName(children[i])}");
                Walk(children[i], indent + (last ? "    " : "│   "), depth + 1);
            }
        }
        Walk(path, "", 0);
    }

    void SystemInfo()
    {
        var mem = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
        WriteLine($"""

            Hostname:                  {Environment.MachineName}
            Betriebssystemname:        Windows 12 Pro (Simulation)
            Betriebssystemversion:     12.0.30000.1 Build 30000
            Läuft auf:                 {RuntimeInformation.OSDescription}
            Registrierter Benutzer:    {Sys.Settings.UserName}
            Systemstartzeit:           {Sys.BootTime:dd.MM.yyyy, HH:mm:ss}
            Systemtyp:                 {RuntimeInformation.OSArchitecture}-basierter PC
            Prozessor(en):             {Environment.ProcessorCount} logische Prozessoren
            Gesamter Speicher:         {Sys.FormatSize(mem)}
            .NET-Laufzeit:             {RuntimeInformation.FrameworkDescription}
            Benutzerordner:            {UserFolders.Root}
            """);
    }

    void TaskList()
    {
        WriteLine("Nr.  App                 Titel");
        WriteLine("==== =================== ==================================");
        var windows = Shell.WM.Windows.ToList();
        for (var i = 0; i < windows.Count; i++)
            WriteLine($"{i + 1,-4} {windows[i].App.Name,-19} {windows[i].Title}");
    }

    void TaskKill(List<string> args)
    {
        RequireArgs(args, 2);
        var windows = Shell.WM.Windows.ToList();
        var targets = int.TryParse(args[1], out var n) && n >= 1 && n <= windows.Count
            ? [windows[n - 1]]
            : windows.Where(w => w.App.Id.Equals(args[1], StringComparison.OrdinalIgnoreCase) || w.App.Name.Equals(args[1], StringComparison.OrdinalIgnoreCase)).ToList();
        if (targets.Count == 0) { WriteLine($"FEHLER: Der Prozess „{args[1]}“ wurde nicht gefunden."); return; }
        foreach (var w in targets)
        {
            if (w == Window) continue;
            Shell.WM.ForceClose(w);
            WriteLine($"ERFOLGREICH: „{w.Title}“ wurde beendet.");
        }
    }

    void Start(string target)
    {
        var app = AppRegistry.All.FirstOrDefault(a => a.Id.Equals(target, StringComparison.OrdinalIgnoreCase) || a.Name.Equals(target, StringComparison.OrdinalIgnoreCase));
        if (app != null) { Shell.Launch(app.Id); return; }
        var path = target == "." ? _cwd : Resolve(target);
        if (File.Exists(path) || Directory.Exists(path)) Shell.OpenPath(path);
        else WriteLine($"„{target}“ wurde nicht gefunden.");
    }

    void IpConfig()
    {
        WriteLine("\nWindows 12-IP-Konfiguration\n");
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            WriteLine($"{nic.NetworkInterfaceType}-Adapter {nic.Name}:\n");
            WriteLine($"   Status . . . . . . . . . . . . . : {(nic.OperationalStatus == OperationalStatus.Up ? "Verbunden" : "Medium getrennt")}");
            try
            {
                var props = nic.GetIPProperties();
                foreach (var addr in props.UnicastAddresses)
                {
                    var label = addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 ? "IPv6-Adresse" : "IPv4-Adresse";
                    WriteLine($"   {label} . . . . . . . . . . . : {addr.Address}");
                }
                foreach (var gw in props.GatewayAddresses)
                    WriteLine($"   Standardgateway . . . . . . . . . : {gw.Address}");
            }
            catch
            {
                // Adapter ohne IP-Informationen.
            }
            WriteLine();
        }
    }

    async Task PingAsync(string host)
    {
        WriteLine($"\nPing wird ausgeführt für {host} mit 32 Bytes Daten:");
        using var ping = new Ping();
        int ok = 0;
        for (var i = 0; i < 4; i++)
        {
            try
            {
                var reply = await ping.SendPingAsync(host, 2000, new byte[32]);
                if (reply.Status == IPStatus.Success)
                {
                    ok++;
                    WriteLine($"Antwort von {reply.Address}: Bytes=32 Zeit={reply.RoundtripTime}ms");
                }
                else WriteLine($"Zeitüberschreitung der Anforderung. ({reply.Status})");
            }
            catch (Exception ex)
            {
                WriteLine($"Ping-Anforderung fehlgeschlagen: {ex.InnerException?.Message ?? ex.Message}");
                break;
            }
            await Task.Delay(500);
        }
        WriteLine($"\nPing-Statistik für {host}:\n    Pakete: Gesendet = 4, Empfangen = {ok}, Verloren = {4 - ok}");
    }

    async Task RunExternalAsync(string line)
    {
        var psi = OperatingSystem.IsWindows()
            ? new ProcessStartInfo("cmd.exe", ["/c", line])
            : new ProcessStartInfo("/bin/sh", ["-c", line]);
        psi.WorkingDirectory = _cwd;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.RedirectStandardInput = true;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;

        Process process;
        try
        {
            process = Process.Start(psi) ?? throw new InvalidOperationException();
        }
        catch
        {
            WriteLine($"Der Befehl „{SplitArgs(line)[0]}“ ist entweder falsch geschrieben oder\nkonnte nicht gefunden werden.");
            return;
        }

        _running = process;
        _cancel = new CancellationTokenSource();
        UpdatePrompt();

        async Task Pump(StreamReader reader)
        {
            var buffer = new char[1024];
            int read;
            while ((read = await reader.ReadAsync(buffer, _cancel.Token)) > 0)
            {
                var text = new string(buffer, 0, read);
                await Dispatcher.UIThread.InvokeAsync(() => Write(text));
            }
        }

        try
        {
            await Task.WhenAll(Pump(process.StandardOutput), Pump(process.StandardError), process.WaitForExitAsync(_cancel.Token));
        }
        catch (OperationCanceledException)
        {
            // Mit Strg+C abgebrochen.
        }
        finally
        {
            _running = null;
            process.Dispose();
        }
    }

    void KillRunning()
    {
        try
        {
            _cancel?.Cancel();
            _running?.Kill(entireProcessTree: true);
        }
        catch
        {
            // Prozess war bereits beendet.
        }
    }
}
