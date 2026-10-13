using System.Text.RegularExpressions;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>
/// Assistent: versteht einfache deutsche Befehle und Fragen (läuft komplett lokal, ohne Internet).
/// Beispiele: „öffne Paint“, „dunkelmodus an“, „lautstärke 30“, „was ist 12*7“, „timer 5 minuten“.
/// </summary>
public sealed partial class AssistantApp : AppView
{
    static readonly string[] Jokes =
    [
        "Warum mögen Programmierer keine Natur? Zu viele Bugs.",
        "Wie viele Programmierer braucht man, um eine Glühbirne zu wechseln? Keinen – das ist ein Hardwareproblem.",
        "Ich würde dir einen UDP-Witz erzählen, aber ich weiß nicht, ob du ihn bekommst.",
        "Es gibt 10 Arten von Menschen: die, die Binär verstehen, und die anderen.",
        "Mein Passwort ist „falsch“. Wenn ich es vergesse, sagt der Computer: „Ihr Passwort ist falsch.“",
        "Warum war der Computer müde? Er hatte zu viele Tabs offen.",
    ];

    static readonly string[] Suggestions = ["Öffne den Explorer", "Dunkelmodus aus", "Was ist 15% von 240", "Timer 3 Minuten", "Erzähl einen Witz", "Hilfe"];

    readonly StackPanel _messages = new() { Spacing = 10 };
    readonly ScrollViewer _scroll;
    readonly TextBox _input;

    public AssistantApp()
    {
        _scroll = UI.Scroll(_messages.Margin(16, 16, 16, 16));
        _input = new TextBox
        {
            PlaceholderText = "Frag mich etwas …",
            VerticalContentAlignment = VerticalAlignment.Center,
            CornerRadius = new CornerRadius(18),
            Padding = new Thickness(14, 8),
        };
        _input.KeyDown += (_, e) =>
        {
            if (e.Key != Key.Enter) return;
            e.Handled = true;
            Send();
        };
        var send = new Button
        {
            Width = 38,
            Height = 38,
            CornerRadius = new CornerRadius(19),
            Padding = new Thickness(0),
            Content = Icons.Glyph("send", 16, Brushes.White),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        send.Classes.Add("accent");
        send.Click += (_, _) => Send();

        var chips = new WrapPanel();
        foreach (var s in Suggestions)
        {
            var text = s;
            var chip = UI.Flat(UI.Text(s, 12), () => Ask(text));
            chip.Padding = new Thickness(12, 6);
            chip.Margin = new Thickness(0, 0, 6, 6);
            chip.CornerRadius = new CornerRadius(14);
            chip.BorderThickness = new Thickness(1);
            chip.Res(BorderBrushProperty, "W12.Divider");
            chips.Children.Add(chip);
        }

        var inputBar = new Border
        {
            Padding = new Thickness(12),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Child = UI.V(8, chips, new Grid
            {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Children = { _input.Col(0), send.Margin(8, 0, 0, 0).Col(1) },
            }),
        }.Res(Border.BorderBrushProperty, "W12.Divider");

        Content = new DockPanel { Children = { inputBar.Dock(Avalonia.Controls.Dock.Bottom), _scroll } };

        Reply($"Hallo {Sys.Settings.UserName}! Ich bin dein Windows-12-Assistent. Ich kann Apps öffnen, Einstellungen ändern, rechnen, Timer stellen und mehr. Tippe „hilfe“ für alle Möglichkeiten.");
    }

    public override void OnActivated() => Dispatcher.UIThread.Post(() => _input.Focus(), DispatcherPriority.Background);

    public override void OnArgument(string? argument)
    {
        if (!string.IsNullOrWhiteSpace(argument)) Ask(argument);
    }

    void Send()
    {
        var text = _input.Text?.Trim() ?? "";
        if (text.Length == 0) return;
        _input.Text = "";
        Ask(text);
    }

    /// <summary>Stellt dem Assistenten eine Frage (auch von außen, z. B. aus der Startmenü-Suche).</summary>
    public void Ask(string text)
    {
        AddBubble(text, user: true);
        var typing = AddBubble("…", user: false);
        DispatcherTimer.RunOnce(() =>
        {
            _messages.Children.Remove(typing);
            string answer;
            try
            {
                answer = Answer(text);
            }
            catch (Exception ex)
            {
                answer = $"Da ist etwas schiefgelaufen: {ex.Message}";
            }
            Reply(answer);
        }, TimeSpan.FromMilliseconds(450));
    }

    void Reply(string text) => AddBubble(text, user: false);

    Control AddBubble(string text, bool user)
    {
        var bubble = new Border
        {
            MaxWidth = 340,
            Padding = new Thickness(14, 10),
            CornerRadius = user ? new CornerRadius(16, 16, 4, 16) : new CornerRadius(16, 16, 16, 4),
            HorizontalAlignment = user ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            Child = user
                ? new SelectableTextBlock { Text = text, TextWrapping = TextWrapping.Wrap, FontSize = 13, Foreground = Brushes.White }
                : new SelectableTextBlock { Text = text, TextWrapping = TextWrapping.Wrap, FontSize = 13 }.Res(SelectableTextBlock.ForegroundProperty, "W12.Text"),
        };
        if (user) bubble.Res(Border.BackgroundProperty, "W12.Accent");
        else bubble.Res(Border.BackgroundProperty, "W12.Card");

        Control row = user
            ? bubble
            : UI.H(8, Icons.Tile(AppRegistry.Get("assistant")!, 26).Margin(0, 2, 0, 0), bubble);
        if (!user) ((StackPanel)row).VerticalAlignment = VerticalAlignment.Top;
        _messages.Children.Add(row);
        Dispatcher.UIThread.Post(() => _scroll.ScrollToEnd(), DispatcherPriority.Background);
        return row;
    }

    // ------------------------------------------------------------ Sprachverständnis

    [GeneratedRegex(@"(\d+)")]
    private static partial Regex Number();

    static bool Has(string text, params string[] words) => words.Any(text.Contains);

    static bool? OnOff(string text)
    {
        if (Has(text, " aus", "deaktiv", "ausschalten", "abschalten", " off")) return false;
        if (Has(text, " an", " ein", "aktiv", "einschalten", "anschalten", " on")) return true;
        return null;
    }

    string Answer(string original)
    {
        var shell = Shell;
        var t = " " + original.Trim().ToLowerInvariant().TrimEnd('?', '!', '.') + " ";
        var s = Sys.Settings;

        // Begrüßung, Dank, Hilfe
        if (Regex.IsMatch(t, @"^\s*(hallo|hi|hey|grüezi|grüß gott|servus|moin|guten (morgen|tag|abend))\b"))
            return $"Hallo {s.UserName}! Wie kann ich helfen?";
        if (Has(t, "danke", "merci")) return "Gern geschehen! 😊";
        if (Has(t, " hilfe", "was kannst du", " help"))
            return """
                Das kann ich für dich tun:
                • Apps öffnen: „öffne Paint“, „starte Terminal“
                • Ordner öffnen: „öffne Dokumente“, „zeige Bilder“
                • Design: „dunkelmodus an/aus“, „akzentfarbe grün“, „nächster hintergrund“
                • Geräte: „wlan aus“, „bluetooth an“, „flugmodus an“, „nicht stören an“, „nachtmodus an“
                • Ton & Bild: „lautstärke 40“, „lauter“, „stumm“, „helligkeit 70“
                • Rechnen: „was ist 12*7“, „15% von 240“, „wurzel 81“
                • Zeit: „wie spät ist es“, „welches datum“, „timer 5 minuten“, „stoppuhr“
                • Dateien: „suche einkauf“, „notiz Milch kaufen“
                • System: „sperren“, „neu starten“, „herunterfahren“, „desktop anzeigen“, „neuer desktop“, „systeminfo“
                • Und natürlich: „erzähl einen Witz“
                """;
        if (Has(t, "wer bist du", "wie heißt du")) return "Ich bin der Assistent von Windows 12 – ich laufe komplett lokal auf deinem Gerät.";
        if (Has(t, "witz", "lustig")) return Jokes[Random.Shared.Next(Jokes.Length)];

        // Zeit & Datum
        if (Has(t, "wie spät", "uhrzeit", "wieviel uhr", "wie viel uhr")) return $"Es ist {Sys.FormatTime(DateTime.Now, false)} Uhr.";
        if (Has(t, "datum", "welcher tag", "welches datum", "heute ist"))
            return $"Heute ist {DateTime.Now.ToString("dddd, der d. MMMM yyyy", Sys.German)} (KW {System.Globalization.ISOWeek.GetWeekOfYear(DateTime.Now)}).";

        // Timer & Stoppuhr
        if (Has(t, "timer", "erinnere mich in", "wecke mich in"))
        {
            var m = Number().Match(t);
            if (!m.Success) return "Wie lange soll der Timer laufen? Zum Beispiel: „timer 5 minuten“.";
            var n = int.Parse(m.Value);
            var duration = Has(t, "sekunde") ? TimeSpan.FromSeconds(n) : Has(t, "stunde") ? TimeSpan.FromHours(n) : TimeSpan.FromMinutes(n);
            ClockService.StartTimer(duration);
            return $"Timer über {ClockService.Format(duration)} gestartet. Ich melde mich, wenn er abgelaufen ist.";
        }
        if (Has(t, "stoppuhr"))
        {
            shell.Launch("clock");
            return "Die Uhr-App ist offen – wechsle zum Reiter „Stoppuhr“.";
        }

        // Rechnen
        var percent = Regex.Match(t, @"(\d+(?:[.,]\d+)?)\s*%\s*von\s*(\d+(?:[.,]\d+)?)");
        if (percent.Success)
        {
            var p = double.Parse(percent.Groups[1].Value.Replace(',', '.'), System.Globalization.CultureInfo.InvariantCulture);
            var v = double.Parse(percent.Groups[2].Value.Replace(',', '.'), System.Globalization.CultureInfo.InvariantCulture);
            return $"{MathEval.Format(p)} % von {MathEval.Format(v)} sind {MathEval.Format(v * p / 100)}.";
        }
        var expression = Regex.Replace(t, @"\b(was ist|was sind|rechne|berechne|wie viel ist|wieviel ist|ergibt)\b", "")
            .Replace("mal", "*").Replace("geteilt durch", "/").Replace("durch", "/").Replace("plus", "+").Replace("minus", "-")
            .Replace("hoch", "^").Replace("wurzel", "sqrt").Replace("=", "").Trim();
        if (expression.Any(char.IsDigit) && MathEval.TryEvaluate(expression, out var result))
            return $"{expression.Replace("*", " × ").Replace("/", " ÷ ")} = {MathEval.Format(result)}";

        // Design
        if (Has(t, "dunkelmodus", "dark mode", "dunkles design", "hellmodus", "light mode", "helles design"))
        {
            var dark = Has(t, "hell", "light") ? OnOff(t) == false : OnOff(t) ?? !s.DarkMode;
            Sys.Set("theme", st => st.DarkMode = dark);
            return dark ? "Dunkelmodus ist jetzt aktiv. 🌙" : "Hellmodus ist jetzt aktiv. ☀️";
        }
        if (Has(t, "akzentfarbe", "farbe "))
        {
            var match = Appearance.AccentColors.FirstOrDefault(c => t.Contains(c.Name.ToLowerInvariant()));
            if (match.Hex == null) return $"Welche Farbe? Verfügbar: {string.Join(", ", Appearance.AccentColors.Select(c => c.Name))}.";
            Sys.Set("theme", st => st.Accent = match.Hex);
            return $"Akzentfarbe auf {match.Name} geändert.";
        }
        if (Has(t, "hintergrund", "wallpaper", "hintergrundbild"))
        {
            var named = Appearance.Wallpapers.FirstOrDefault(w => t.Contains(w.Name.ToLowerInvariant()));
            var list = Appearance.Wallpapers.ToList();
            var next = named ?? list[(list.FindIndex(w => w.Id == s.Wallpaper) + 1) % list.Count];
            Sys.Set("wallpaper", st => st.Wallpaper = next.Id);
            return $"Neuer Hintergrund: {next.Name}.";
        }

        // Geräte
        if (Has(t, "wlan", "wifi", "internet"))
        {
            var on = OnOff(t) ?? !s.Wifi;
            Sys.Set("network", st => { st.Wifi = on; if (on) st.AirplaneMode = false; });
            return on ? "WLAN ist eingeschaltet." : "WLAN ist ausgeschaltet.";
        }
        if (Has(t, "bluetooth"))
        {
            var on = OnOff(t) ?? !s.Bluetooth;
            Sys.Set("network", st => { st.Bluetooth = on; if (on) st.AirplaneMode = false; });
            return on ? "Bluetooth ist eingeschaltet." : "Bluetooth ist ausgeschaltet.";
        }
        if (Has(t, "flugmodus"))
        {
            var on = OnOff(t) ?? !s.AirplaneMode;
            Sys.Set("network", st => { st.AirplaneMode = on; if (on) { st.Wifi = false; st.Bluetooth = false; } else st.Wifi = true; });
            return on ? "Flugmodus aktiviert. ✈️" : "Flugmodus deaktiviert.";
        }
        if (Has(t, "nicht stören", "nicht-stören", "ruhemodus"))
        {
            var on = OnOff(t) ?? !s.DoNotDisturb;
            Sys.Set("notifications", st => st.DoNotDisturb = on);
            return on ? "„Nicht stören“ ist aktiv." : "„Nicht stören“ ist aus.";
        }
        if (Has(t, "nachtmodus", "nachtlicht", "blaulicht"))
        {
            var on = OnOff(t) ?? !s.NightLight;
            Sys.Set("display", st => st.NightLight = on);
            return on ? "Nachtmodus ist an." : "Nachtmodus ist aus.";
        }
        if (Has(t, "energiespar", "akku sparen"))
        {
            var on = OnOff(t) ?? !s.EnergySaver;
            Sys.Set("power", st => st.EnergySaver = on);
            return on ? "Energiesparmodus ist an. 🍃" : "Energiesparmodus ist aus.";
        }

        // Ton & Helligkeit
        if (Has(t, "stumm", "ton aus", "mute"))
        {
            Sys.Set("volume", st => st.Muted = !Has(t, "nicht stumm", "ton an"));
            return Sys.Settings.Muted ? "Ton ist stummgeschaltet. 🔇" : "Ton ist wieder an.";
        }
        if (Has(t, "lautstärke", "lauter", "leiser"))
        {
            var m = Number().Match(t);
            var v = m.Success ? int.Parse(m.Value) / 100.0 : Has(t, "lauter") ? s.Volume + 0.1 : Has(t, "leiser") ? s.Volume - 0.1 : s.Volume;
            v = Math.Clamp(v, 0, 1);
            Sys.Set("volume", st => { st.Volume = v; st.Muted = false; });
            return $"Lautstärke: {(int)Math.Round(v * 100)} %.";
        }
        if (Has(t, "helligkeit", "heller", "dunkler"))
        {
            var m = Number().Match(t);
            var v = m.Success ? int.Parse(m.Value) / 100.0 : Has(t, "heller") ? s.Brightness + 0.1 : Has(t, "dunkler") ? s.Brightness - 0.1 : s.Brightness;
            v = Math.Clamp(v, 0.2, 1);
            Sys.Set("display", st => st.Brightness = v);
            return $"Helligkeit: {(int)Math.Round(v * 100)} %.";
        }

        // System
        if (Has(t, "sperren", "sperre ")) { DispatcherTimer.RunOnce(shell.Lock, TimeSpan.FromMilliseconds(700)); return "Ich sperre den Bildschirm. Bis gleich!"; }
        if (Has(t, "herunterfahren", "ausschalten", "shutdown")) { DispatcherTimer.RunOnce(shell.ShowPowerDialog, TimeSpan.FromMilliseconds(300)); return "Möchtest du wirklich herunterfahren? Bitte bestätige im Dialog."; }
        if (Has(t, "neu starten", "neustart", "restart")) { DispatcherTimer.RunOnce(() => shell.Shutdown(true), TimeSpan.FromMilliseconds(700)); return "Windows 12 wird neu gestartet …"; }
        if (Has(t, "abmelden")) { DispatcherTimer.RunOnce(shell.SignOut, TimeSpan.FromMilliseconds(700)); return "Du wirst abgemeldet."; }
        if (Has(t, "desktop anzeigen", "alles minimieren", "alle fenster minimieren")) { shell.WM.ToggleShowDesktop(); return "Erledigt – alle Fenster sind minimiert."; }
        if (Has(t, "neuer desktop", "neuen desktop")) { shell.WM.AddDesktop(); return $"Desktop {shell.WM.DesktopCount} wurde erstellt."; }
        if (Has(t, "alle fenster schließen", "schließe alle"))
        {
            foreach (var w in shell.WM.Windows.Where(w => w != Window).ToList()) shell.WM.Close(w);
            return "Alle anderen Fenster werden geschlossen.";
        }
        if (Has(t, "systeminfo", "speicher", "arbeitsspeicher", "prozessor"))
        {
            var mem = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
            return $"Dein Gerät „{Environment.MachineName}“ hat {Environment.ProcessorCount} logische Prozessoren und {Sys.FormatSize(mem)} Arbeitsspeicher. Windows 12 läuft seit {(int)(DateTime.Now - Sys.BootTime).TotalMinutes} Minuten.";
        }

        // Notizen
        var note = Regex.Match(original, @"^\s*(notiz|merke dir|notiere)\s*:?\s*(.+)$", RegexOptions.IgnoreCase);
        if (note.Success)
        {
            var entry = note.Groups[2].Value.Trim();
            Sys.Set("notes", st => st.Notes = (st.Notes.Trim().Length > 0 ? st.Notes.TrimEnd() + "\n" : "") + "• " + entry);
            return $"Notiert: „{entry}“. Du findest es im Notizen-Widget.";
        }

        // Dateien suchen
        var search = Regex.Match(t, @"\b(suche|finde|such)\s+(nach\s+)?(.+)$");
        if (search.Success)
        {
            var q = search.Groups[3].Value.Trim();
            var hits = Directory.EnumerateFileSystemEntries(UserFolders.Root, "*", new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true })
                .Where(p => !p.Contains(Path.DirectorySeparatorChar + ".") && Path.GetFileName(p).Contains(q, StringComparison.OrdinalIgnoreCase))
                .Take(8).ToList();
            if (hits.Count == 0) return $"Ich habe nichts zu „{q}“ gefunden.";
            if (hits.Count == 1) shell.OpenPath(hits[0]);
            return $"Gefunden ({hits.Count}):\n" + string.Join("\n", hits.Select(h => "• " + Path.GetRelativePath(UserFolders.Root, h)))
                + (hits.Count == 1 ? "\nIch habe es für dich geöffnet." : "");
        }

        // Apps & Ordner öffnen
        if (Has(t, "öffne", "starte", "zeige", "zeig ", "open", "start "))
        {
            foreach (var (name, path, _) in UserFolders.QuickAccess)
                if (t.Contains(name.ToLowerInvariant())) { shell.OpenPath(path); return $"„{name}“ ist geöffnet."; }
            if (Has(t, "papierkorb")) { shell.Launch("recycle"); return "Der Papierkorb ist geöffnet."; }
            if (Has(t, "dieser pc", "laufwerk")) { shell.OpenPath(ExplorerPaths.ThisPc); return "„Dieser PC“ ist geöffnet."; }

            var app = AppRegistry.All.FirstOrDefault(a => t.Contains(a.Name.ToLowerInvariant()) || t.Contains(" " + a.Id + " "))
                      ?? AppRegistry.All.FirstOrDefault(a => a.Keywords.Split(' ').Any(k => k.Length > 3 && t.Contains(k)));
            if (app != null)
            {
                shell.Launch(app.Id);
                return $"{app.Name} wird geöffnet.";
            }
            return "Welche App soll ich öffnen? Zum Beispiel: Explorer, Editor, Rechner, Terminal, Paint, Fotos, Uhr, Einstellungen.";
        }

        // Nur ein App-Name?
        var direct = AppRegistry.All.FirstOrDefault(a => t.Trim() == a.Name.ToLowerInvariant());
        if (direct != null)
        {
            shell.Launch(direct.Id);
            return $"{direct.Name} wird geöffnet.";
        }

        return "Das habe ich leider nicht verstanden. Tippe „hilfe“, um zu sehen, was ich kann.";
    }
}
