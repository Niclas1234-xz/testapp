using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>Taschenrechner (Standard) mit Verlauf und Tastatursteuerung.</summary>
public sealed class CalculatorApp : AppView
{
    readonly TextBlock _expression = UI.Sub("", 14);
    readonly TextBlock _display = UI.Text("0", 44, FontWeight.SemiBold);
    readonly StackPanel _historyList = new() { Spacing = 4 };
    readonly Border _historyPanel;

    string _entry = "0";
    double? _accumulator;
    char? _pending;
    bool _startNew = true;
    bool _error;

    public CalculatorApp()
    {
        _display.HorizontalAlignment = HorizontalAlignment.Right;
        _display.TextTrimming = TextTrimming.None;
        _expression.HorizontalAlignment = HorizontalAlignment.Right;

        var displayBox = new Viewbox
        {
            Stretch = Stretch.Uniform,
            StretchDirection = StretchDirection.DownOnly,
            HorizontalAlignment = HorizontalAlignment.Right,
            Child = _display,
        };

        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Children =
            {
                UI.Text("Standard", 18, FontWeight.SemiBold).VCenter().Col(0),
                UI.IconButton("clock", ToggleHistory, "Verlauf").Col(1),
            },
        };

        var buttons = new UniformGrid { Columns = 4, Rows = 6 };
        string[] layout =
        [
            "%", "CE", "C", "⌫",
            "¹/x", "x²", "√x", "÷",
            "7", "8", "9", "×",
            "4", "5", "6", "−",
            "1", "2", "3", "+",
            "±", "0", ",", "=",
        ];
        foreach (var key in layout) buttons.Children.Add(KeyButton(key));

        _historyPanel = new Border
        {
            IsVisible = false,
            Padding = new Thickness(12),
            CornerRadius = new CornerRadius(8),
            Child = new DockPanel
            {
                Children =
                {
                    new Grid
                    {
                        ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                        Children =
                        {
                            UI.Text("Verlauf", 14, FontWeight.SemiBold).VCenter().Col(0),
                            UI.IconButton("trash", () => _historyList.Children.Clear(), "Verlauf löschen").Col(1),
                        },
                    }.Dock(Avalonia.Controls.Dock.Top),
                    UI.Scroll(_historyList),
                },
            },
        }.Res(Border.BackgroundProperty, "W12.Card");

        var main = new DockPanel
        {
            Margin = new Thickness(8),
            Children =
            {
                header.Margin(6, 0, 0, 8).Dock(Avalonia.Controls.Dock.Top),
                _expression.Margin(0, 0, 8, 0).Dock(Avalonia.Controls.Dock.Top),
                displayBox.Margin(8, 0, 8, 12).Dock(Avalonia.Controls.Dock.Top),
                buttons,
            },
        };

        Content = new Panel { Children = { main, _historyPanel.Margin(8, 48, 8, 8) } };
        Focusable = true;
        AddHandler(KeyDownEvent, OnKey, RoutingStrategies.Tunnel);
        AddHandler(TextInputEvent, OnText, RoutingStrategies.Tunnel);
    }

    public override void OnActivated() => Focus();

    Button KeyButton(string key)
    {
        var isDigit = key.Length == 1 && char.IsDigit(key[0]) || key is "," or "±";
        var b = new Button
        {
            Content = key,
            Margin = new Thickness(2),
            FontSize = 18,
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
            CornerRadius = new CornerRadius(6),
            Focusable = false,
        };
        if (key == "=") b.Classes.Add("accent");
        else b.Res(BackgroundProperty, isDigit ? "W12.Card" : "W12.CardAlt");
        b.Click += (_, _) => Press(key);
        return b;
    }

    void OnText(object? sender, TextInputEventArgs e)
    {
        var map = e.Text switch
        {
            "*" => "×",
            "/" => "÷",
            "-" => "−",
            "." or "," => ",",
            "=" => "=",
            "%" => "%",
            "+" => "+",
            _ => e.Text is { Length: 1 } t && char.IsDigit(t[0]) ? t : null,
        };
        if (map == null) return;
        Press(map);
        e.Handled = true;
    }

    void OnKey(object? sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Enter: Press("="); break;
            case Key.Back: Press("⌫"); break;
            case Key.Escape: Press("C"); break;
            case Key.Delete: Press("CE"); break;
            default: return;
        }
        e.Handled = true;
    }

    void ToggleHistory() => _historyPanel.IsVisible = !_historyPanel.IsVisible;

    static string Symbol(char op) => op switch { '+' => "+", '-' => "−", '*' => "×", '/' => "÷", _ => "" };

    double Value => double.Parse(_entry.Replace(".", "").Replace(',', '.'), CultureInfo.InvariantCulture);

    void SetValue(double v)
    {
        if (double.IsNaN(v) || double.IsInfinity(v))
        {
            _error = true;
            _entry = "0";
            _display.Text = double.IsNaN(v) ? "Ungültige Eingabe" : "Division durch 0 nicht möglich";
            return;
        }
        _entry = Format(v);
        _display.Text = _entry;
    }

    static string Format(double v)
    {
        var rounded = Math.Round(v, 12);
        if (Math.Abs(rounded) >= 1e16 || (Math.Abs(rounded) < 1e-10 && rounded != 0))
            return rounded.ToString("0.##########E+0", Sys.German);
        return rounded.ToString("#,##0.############", Sys.German);
    }

    void Press(string key)
    {
        if (_error && key is not ("C" or "CE")) Press("C");

        switch (key)
        {
            case "C":
                _entry = "0";
                _accumulator = null;
                _pending = null;
                _expression.Text = "";
                _startNew = true;
                _error = false;
                break;
            case "CE":
                _entry = "0";
                _error = false;
                _startNew = true;
                break;
            case "⌫":
                if (_startNew) break;
                var raw = _entry.Replace(".", "");
                raw = raw.Length > 1 ? raw[..^1] : "0";
                if (raw == "-") raw = "0";
                _entry = Group(raw);
                break;
            case ",":
                if (_startNew) { _entry = "0,"; _startNew = false; }
                else if (!_entry.Contains(',')) _entry += ",";
                break;
            case "±":
                if (_entry != "0") _entry = _entry.StartsWith('-') ? _entry[1..] : "-" + _entry;
                break;
            case "%":
                SetValue(_accumulator is { } acc ? acc * Value / 100 : Value / 100);
                _startNew = true;
                return;
            case "¹/x":
                _expression.Text = $"1/({_entry})";
                SetValue(1 / Value);
                _startNew = true;
                return;
            case "x²":
                _expression.Text = $"sqr({_entry})";
                SetValue(Value * Value);
                _startNew = true;
                return;
            case "√x":
                _expression.Text = $"√({_entry})";
                SetValue(Value < 0 ? double.NaN : Math.Sqrt(Value));
                _startNew = true;
                return;
            case "+" or "−" or "×" or "÷":
                Operator(key switch { "+" => '+', "−" => '-', "×" => '*', _ => '/' });
                return;
            case "=":
                Evaluate();
                return;
            default:
                if (_startNew || _entry == "0") { _entry = key; _startNew = false; }
                else if (_entry.Replace(".", "").Replace(",", "").Replace("-", "").Length < 16) _entry = Group(_entry.Replace(".", "") + key);
                break;
        }
        _display.Text = _entry;
    }

    /// <summary>Tausendertrennzeichen während der Eingabe.</summary>
    static string Group(string raw)
    {
        var negative = raw.StartsWith('-');
        if (negative) raw = raw[1..];
        var parts = raw.Split(',');
        var integer = parts[0];
        var grouped = long.TryParse(integer, out var n) ? n.ToString("#,##0", Sys.German) : integer;
        var result = parts.Length > 1 ? grouped + "," + parts[1] : grouped;
        return negative ? "-" + result : result;
    }

    void Operator(char op)
    {
        if (_pending is { } p && !_startNew && _accumulator is { } acc)
        {
            var r = Apply(acc, Value, p);
            SetValue(r);
            if (_error) return;
            _accumulator = r;
        }
        else if (!_pending.HasValue || !_startNew)
        {
            _accumulator = Value;
        }
        _pending = op;
        _expression.Text = $"{Format(_accumulator ?? 0)} {Symbol(op)}";
        _startNew = true;
    }

    void Evaluate()
    {
        if (_pending is not { } op || _accumulator is not { } acc) return;
        var right = Value;
        var result = Apply(acc, right, op);
        var expression = $"{Format(acc)} {Symbol(op)} {Format(right)} =";
        _expression.Text = expression;
        SetValue(result);
        if (!_error) AddHistory(expression, _entry);
        _accumulator = null;
        _pending = null;
        _startNew = true;
    }

    static double Apply(double a, double b, char op) => op switch
    {
        '+' => a + b,
        '-' => a - b,
        '*' => a * b,
        '/' => b == 0 ? double.PositiveInfinity : a / b,
        _ => b,
    };

    void AddHistory(string expression, string result)
    {
        var entry = UI.Flat(UI.V(2, UI.Sub(expression, 12), UI.Text(result, 20, FontWeight.SemiBold)), () =>
        {
            _entry = result;
            _display.Text = result;
            _startNew = true;
        });
        entry.HorizontalContentAlignment = HorizontalAlignment.Right;
        _historyList.Children.Insert(0, entry);
    }
}
