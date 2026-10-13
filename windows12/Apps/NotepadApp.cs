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

/// <summary>Editor: Textdateien öffnen, bearbeiten, suchen/ersetzen und speichern.</summary>
public sealed class NotepadApp : AppView
{
    static readonly FontFamily Mono = new("Cascadia Mono, Consolas, DejaVu Sans Mono, Liberation Mono, monospace");

    readonly TextBox _editor;
    readonly TextBlock _position = UI.Sub("", 12);
    readonly TextBlock _chars = UI.Sub("", 12);
    readonly TextBlock _zoomText = UI.Sub("100 %", 12);
    readonly Border _findBar;
    readonly TextBox _findBox = new() { PlaceholderText = "Suchen", Width = 220 };
    readonly TextBox _replaceBox = new() { PlaceholderText = "Ersetzen durch", Width = 220 };
    readonly Border _statusBar;
    string? _path;
    string _savedText = "";
    double _zoom = 1;
    bool _loading;

    bool IsDirty => (_editor.Text ?? "") != _savedText;
    string FileName => _path != null ? Path.GetFileName(_path) : "Unbenannt";

    public NotepadApp(string? path)
    {
        _editor = new TextBox
        {
            AcceptsReturn = true,
            AcceptsTab = true,
            TextWrapping = TextWrapping.Wrap,
            FontFamily = Mono,
            FontSize = 14,
            BorderThickness = new Thickness(0),
            CornerRadius = new CornerRadius(0),
            Padding = new Thickness(14, 10),
            Background = Brushes.Transparent,
        }.Plain();
        _editor.TextChanged += (_, _) =>
        {
            if (!_loading) UpdateTitle();
            UpdateStatus();
        };
        _editor.PropertyChanged += (_, e) =>
        {
            if (e.Property == TextBox.CaretIndexProperty) UpdateStatus();
        };

        // Suchen & Ersetzen
        _findBox.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter) { FindNext(); e.Handled = true; }
            if (e.Key == Key.Escape) { _findBar!.IsVisible = false; _editor.Focus(); e.Handled = true; }
        };
        _findBar = new Border
        {
            IsVisible = false,
            Padding = new Thickness(10, 6),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = new WrapPanel
            {
                Children =
                {
                    _findBox.Margin(0, 0, 6, 0),
                    UI.Btn("Weitersuchen", () => FindNext()).Margin(0, 0, 12, 0),
                    _replaceBox.Margin(0, 0, 6, 0),
                    UI.Btn("Ersetzen", Replace).Margin(0, 0, 6, 0),
                    UI.Btn("Alle ersetzen", ReplaceAll).Margin(0, 0, 6, 0),
                    UI.IconButton("close", () => { _findBar!.IsVisible = false; _editor.Focus(); }, "Schließen"),
                },
            },
        }.Res(Border.BorderBrushProperty, "W12.Divider");

        _statusBar = new Border
        {
            Padding = new Thickness(14, 4),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Child = UI.H(24, _position, _chars, _zoomText, UI.Sub("UTF-8", 12), UI.Sub(OperatingSystem.IsWindows() ? "Windows (CRLF)" : "Unix (LF)", 12)),
        }.Res(Border.BorderBrushProperty, "W12.Divider");

        Content = new DockPanel
        {
            Children =
            {
                BuildMenu().Dock(Avalonia.Controls.Dock.Top),
                _findBar.Dock(Avalonia.Controls.Dock.Top),
                _statusBar.Dock(Avalonia.Controls.Dock.Bottom),
                _editor,
            },
        };

        AddHandler(KeyDownEvent, OnKey, RoutingStrategies.Tunnel);

        if (path != null) Load(path);
        else UpdateTitle();
        UpdateStatus();
    }

    public override void OnActivated() => Dispatcher.UIThread.Post(() => _editor.Focus(), DispatcherPriority.Background);

    Menu BuildMenu()
    {
        MenuItem Item(string header, Action click, string? gesture = null)
        {
            var item = new MenuItem { Header = header };
            if (gesture != null) item.InputGesture = KeyGesture.Parse(gesture);
            item.Click += (_, _) => click();
            return item;
        }

        var wrap = new MenuItem { Header = "Zeilenumbruch", ToggleType = MenuItemToggleType.CheckBox, IsChecked = true };
        wrap.Click += (_, _) => _editor.TextWrapping = wrap.IsChecked ? TextWrapping.Wrap : TextWrapping.NoWrap;
        var status = new MenuItem { Header = "Statusleiste", ToggleType = MenuItemToggleType.CheckBox, IsChecked = true };
        status.Click += (_, _) => _statusBar.IsVisible = status.IsChecked;

        var file = new MenuItem { Header = "_Datei" };
        file.Items.Add(Item("Neu", New, "Ctrl+N"));
        file.Items.Add(Item("Neues Fenster", () => Shell.Launch("notepad"), "Ctrl+Shift+N"));
        file.Items.Add(Item("Öffnen …", Open, "Ctrl+O"));
        file.Items.Add(Item("Speichern", () => _ = SaveAsync(), "Ctrl+S"));
        file.Items.Add(Item("Speichern unter …", () => _ = SaveAsync(saveAs: true), "Ctrl+Shift+S"));
        file.Items.Add(new Separator());
        file.Items.Add(Item("Beenden", () =>
        {
            if (Window != null) Shell.WM.Close(Window);
        }));

        var edit = new MenuItem { Header = "_Bearbeiten" };
        edit.Items.Add(Item("Rückgängig", () => _editor.Undo(), "Ctrl+Z"));
        edit.Items.Add(Item("Wiederholen", () => _editor.Redo(), "Ctrl+Y"));
        edit.Items.Add(new Separator());
        edit.Items.Add(Item("Ausschneiden", () => _editor.Cut(), "Ctrl+X"));
        edit.Items.Add(Item("Kopieren", () => _editor.Copy(), "Ctrl+C"));
        edit.Items.Add(Item("Einfügen", () => _editor.Paste(), "Ctrl+V"));
        edit.Items.Add(new Separator());
        edit.Items.Add(Item("Suchen …", ShowFind, "Ctrl+F"));
        edit.Items.Add(Item("Weitersuchen", () => FindNext(), "F3"));
        edit.Items.Add(Item("Ersetzen …", ShowFind, "Ctrl+H"));
        edit.Items.Add(new Separator());
        edit.Items.Add(Item("Alles markieren", () => _editor.SelectAll(), "Ctrl+A"));
        edit.Items.Add(Item("Uhrzeit/Datum", InsertDate, "F5"));

        var format = new MenuItem { Header = "_Format" };
        format.Items.Add(wrap);

        var view = new MenuItem { Header = "_Ansicht" };
        view.Items.Add(Item("Vergrößern", () => Zoom(0.1), "Ctrl+OemPlus"));
        view.Items.Add(Item("Verkleinern", () => Zoom(-0.1), "Ctrl+OemMinus"));
        view.Items.Add(Item("Standardzoom", () => Zoom(0), "Ctrl+D0"));
        view.Items.Add(status);

        var menu = new Menu { Padding = new Thickness(4, 2) };
        menu.Items.Add(file);
        menu.Items.Add(edit);
        menu.Items.Add(format);
        menu.Items.Add(view);
        return menu;
    }

    void OnKey(object? sender, KeyEventArgs e)
    {
        var ctrl = e.KeyModifiers.HasFlag(KeyModifiers.Control);
        var shift = e.KeyModifiers.HasFlag(KeyModifiers.Shift);
        void Do(Action a) { e.Handled = true; a(); }
        switch (e.Key)
        {
            case Key.S when ctrl && shift: Do(() => _ = SaveAsync(saveAs: true)); break;
            case Key.S when ctrl: Do(() => _ = SaveAsync()); break;
            case Key.O when ctrl: Do(Open); break;
            case Key.N when ctrl && shift: Do(() => Shell.Launch("notepad")); break;
            case Key.N when ctrl: Do(New); break;
            case Key.F when ctrl: Do(ShowFind); break;
            case Key.H when ctrl: Do(ShowFind); break;
            case Key.F3: Do(() => FindNext()); break;
            case Key.F5: Do(InsertDate); break;
            case Key.OemPlus or Key.Add when ctrl: Do(() => Zoom(0.1)); break;
            case Key.OemMinus or Key.Subtract when ctrl: Do(() => Zoom(-0.1)); break;
            case Key.D0 when ctrl: Do(() => Zoom(0)); break;
        }
    }

    // ------------------------------------------------------------ Datei

    void Load(string path)
    {
        try
        {
            var text = File.ReadAllText(path);
            _loading = true;
            _editor.Text = text;
            _loading = false;
            _savedText = text;
            _path = path;
            _editor.CaretIndex = 0;
            Sys.AddRecentFile(path);
            UpdateTitle();
        }
        catch (Exception ex)
        {
            _loading = false;
            _ = Shell.Dialogs.MessageAsync("Editor", $"Die Datei konnte nicht geöffnet werden:\n{ex.Message}", "OK");
        }
    }

    async void New()
    {
        if (!await ConfirmDiscardAsync()) return;
        _path = null;
        _loading = true;
        _editor.Text = "";
        _loading = false;
        _savedText = "";
        UpdateTitle();
    }

    async void Open()
    {
        if (!await ConfirmDiscardAsync()) return;
        var path = await Shell.Dialogs.OpenFileAsync(_path != null ? Path.GetDirectoryName(_path) : UserFolders.Documents, null, "Datei öffnen");
        if (path != null) Load(path);
    }

    async Task<bool> SaveAsync(bool saveAs = false)
    {
        var path = _path;
        if (path == null || saveAs)
        {
            path = await Shell.Dialogs.SaveFileAsync(_path != null ? Path.GetDirectoryName(_path) : UserFolders.Documents,
                _path != null ? Path.GetFileName(_path) : "Unbenannt.txt");
            if (path == null) return false;
        }
        try
        {
            var text = _editor.Text ?? "";
            await File.WriteAllTextAsync(path, text, new UTF8Encoding(false));
            _path = path;
            _savedText = text;
            Sys.AddRecentFile(path);
            UpdateTitle();
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
        if (!IsDirty) return true;
        var answer = await Shell.Dialogs.MessageAsync("Editor", $"Möchtest du die Änderungen an „{FileName}“ speichern?",
            "Speichern", "Nicht speichern", "Abbrechen");
        return answer switch
        {
            "Speichern" => await SaveAsync(),
            "Nicht speichern" => true,
            _ => false,
        };
    }

    public override Task<bool> CanCloseAsync() => ConfirmDiscardAsync();

    void UpdateTitle() => SetTitle($"{(IsDirty ? "*" : "")}{FileName} – Editor");

    void UpdateStatus()
    {
        var text = _editor.Text ?? "";
        var caret = Math.Clamp(_editor.CaretIndex, 0, text.Length);
        var line = 1;
        var lastBreak = -1;
        for (var i = 0; i < caret; i++)
        {
            if (text[i] != '\n') continue;
            line++;
            lastBreak = i;
        }
        _position.Text = $"Zeile {line}, Spalte {caret - lastBreak}";
        _chars.Text = $"{text.Length} Zeichen";
    }

    void Zoom(double delta)
    {
        _zoom = delta == 0 ? 1 : Math.Clamp(_zoom + delta, 0.5, 3);
        _editor.FontSize = 14 * _zoom;
        _zoomText.Text = $"{(int)Math.Round(_zoom * 100)} %";
    }

    void InsertDate()
    {
        var stamp = DateTime.Now.ToString("HH:mm dd.MM.yyyy", Sys.German);
        var text = _editor.Text ?? "";
        var start = Math.Min(_editor.SelectionStart, _editor.SelectionEnd);
        var end = Math.Max(_editor.SelectionStart, _editor.SelectionEnd);
        _editor.Text = text[..start] + stamp + text[end..];
        _editor.CaretIndex = start + stamp.Length;
    }

    // ------------------------------------------------------------ Suchen & Ersetzen

    void ShowFind()
    {
        _findBar.IsVisible = true;
        var selected = _editor.SelectedText;
        if (!string.IsNullOrEmpty(selected) && !selected.Contains('\n')) _findBox.Text = selected;
        Dispatcher.UIThread.Post(() =>
        {
            _findBox.Focus();
            _findBox.SelectAll();
        }, DispatcherPriority.Background);
    }

    bool FindNext()
    {
        var needle = _findBox.Text ?? "";
        var text = _editor.Text ?? "";
        if (needle.Length == 0) return false;
        var from = Math.Max(_editor.SelectionStart, _editor.SelectionEnd);
        var index = text.IndexOf(needle, from, StringComparison.CurrentCultureIgnoreCase);
        if (index < 0) index = text.IndexOf(needle, 0, StringComparison.CurrentCultureIgnoreCase);
        if (index < 0)
        {
            _ = Shell.Dialogs.MessageAsync("Editor", $"„{needle}“ wurde nicht gefunden.", "OK");
            return false;
        }
        _editor.SelectionStart = index;
        _editor.SelectionEnd = index + needle.Length;
        _editor.CaretIndex = index + needle.Length;
        return true;
    }

    void Replace()
    {
        var needle = _findBox.Text ?? "";
        if (needle.Length == 0) return;
        if (string.Equals(_editor.SelectedText, needle, StringComparison.CurrentCultureIgnoreCase))
        {
            var text = _editor.Text ?? "";
            var start = Math.Min(_editor.SelectionStart, _editor.SelectionEnd);
            var replacement = _replaceBox.Text ?? "";
            _editor.Text = text[..start] + replacement + text[(start + needle.Length)..];
            _editor.SelectionStart = _editor.SelectionEnd = start + replacement.Length;
        }
        FindNext();
    }

    void ReplaceAll()
    {
        var needle = _findBox.Text ?? "";
        if (needle.Length == 0) return;
        var text = _editor.Text ?? "";
        var count = 0;
        var index = text.IndexOf(needle, StringComparison.CurrentCultureIgnoreCase);
        var sb = new StringBuilder();
        var last = 0;
        while (index >= 0)
        {
            sb.Append(text, last, index - last).Append(_replaceBox.Text ?? "");
            last = index + needle.Length;
            count++;
            index = text.IndexOf(needle, last, StringComparison.CurrentCultureIgnoreCase);
        }
        sb.Append(text, last, text.Length - last);
        _editor.Text = sb.ToString();
        _ = Shell.Dialogs.MessageAsync("Editor", count == 1 ? "1 Stelle wurde ersetzt." : $"{count} Stellen wurden ersetzt.", "OK");
    }
}
