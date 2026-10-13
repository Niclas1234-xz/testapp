using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;

namespace Windows12.Core;

/// <summary>Kleine Bausteine, damit die Oberflächen im Code kompakt bleiben.</summary>
public static class UI
{
    /// <summary>Bindet eine Eigenschaft an eine (theme-abhängige) Ressource.</summary>
    public static T Res<T>(this T control, AvaloniaProperty property, string key) where T : Control
    {
        control.Bind(property, control.GetResourceObservable(key));
        return control;
    }

    public static T Col<T>(this T c, int column, int span = 1) where T : Control
    {
        Grid.SetColumn(c, column);
        if (span > 1) Grid.SetColumnSpan(c, span);
        return c;
    }

    public static T Row<T>(this T c, int row, int span = 1) where T : Control
    {
        Grid.SetRow(c, row);
        if (span > 1) Grid.SetRowSpan(c, span);
        return c;
    }

    public static T Dock<T>(this T c, Avalonia.Controls.Dock dock) where T : Control
    {
        DockPanel.SetDock(c, dock);
        return c;
    }

    public static T Tip<T>(this T c, string? tip) where T : Control
    {
        if (tip != null) ToolTip.SetTip(c, tip);
        return c;
    }

    public static T Margin<T>(this T c, double l, double t, double r, double b) where T : Layoutable
    {
        c.Margin = new Thickness(l, t, r, b);
        return c;
    }

    public static T Center<T>(this T c) where T : Layoutable
    {
        c.HorizontalAlignment = HorizontalAlignment.Center;
        c.VerticalAlignment = VerticalAlignment.Center;
        return c;
    }

    public static T VCenter<T>(this T c) where T : Layoutable
    {
        c.VerticalAlignment = VerticalAlignment.Center;
        return c;
    }

    public static TextBlock Text(string text, double size = 14, FontWeight? weight = null, string brush = "W12.Text", bool wrap = false)
    {
        var t = new TextBlock
        {
            Text = text,
            FontSize = size,
            FontWeight = weight ?? FontWeight.Normal,
            TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap,
            TextTrimming = wrap ? TextTrimming.None : TextTrimming.CharacterEllipsis,
        };
        return t.Res(TextBlock.ForegroundProperty, brush);
    }

    public static TextBlock Sub(string text, double size = 12, bool wrap = false) => Text(text, size, null, "W12.SubText", wrap);

    public static TextBlock Heading(string text, double size = 20) => Text(text, size, FontWeight.SemiBold);

    public static StackPanel H(double spacing, params Control[] children)
    {
        var p = new StackPanel { Orientation = Orientation.Horizontal, Spacing = spacing };
        p.Children.AddRange(children);
        return p;
    }

    public static StackPanel V(double spacing, params Control[] children)
    {
        var p = new StackPanel { Orientation = Orientation.Vertical, Spacing = spacing };
        p.Children.AddRange(children);
        return p;
    }

    /// <summary>Grid mit Spaltendefinition, Kinder werden der Reihe nach auf die Spalten verteilt.</summary>
    public static Grid Columns(string definitions, params Control[] children)
    {
        var g = new Grid { ColumnDefinitions = new ColumnDefinitions(definitions) };
        for (var i = 0; i < children.Length; i++)
        {
            Grid.SetColumn(children[i], i);
            g.Children.Add(children[i]);
        }
        return g;
    }

    public static Button Flat(object content, Action click, string? tip = null)
    {
        var b = new Button { Content = content, Padding = new Thickness(8, 6) };
        b.Classes.Add("flat");
        b.Click += (_, _) => click();
        return b.Tip(tip);
    }

    public static Button IconButton(string icon, Action click, string? tip = null, double iconSize = 16, double box = 34)
    {
        var b = new Button
        {
            Content = Icons.Glyph(icon, iconSize),
            Width = box,
            Height = box,
            Padding = new Thickness(0),
            HorizontalContentAlignment = HorizontalAlignment.Center,
            VerticalContentAlignment = VerticalAlignment.Center,
        };
        b.Classes.Add("flat");
        b.Click += (_, _) => click();
        return b.Tip(tip);
    }

    /// <summary>Flache Schaltfläche mit Symbol und Text.</summary>
    public static Button IconTextButton(string icon, string text, Action click, string? tip = null)
    {
        var b = Flat(H(8, Icons.Glyph(icon, 16), new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center }), click, tip);
        b.HorizontalContentAlignment = HorizontalAlignment.Left;
        return b;
    }

    public static Button Btn(string text, Action click, bool accent = false)
    {
        var b = new Button { Content = text, Padding = new Thickness(16, 6), MinWidth = 90, HorizontalContentAlignment = HorizontalAlignment.Center };
        if (accent) b.Classes.Add("accent");
        b.Click += (_, _) => click();
        return b;
    }

    public static Border Card(Control child, double padding = 16)
    {
        var b = new Border
        {
            Child = child,
            Padding = new Thickness(padding),
            CornerRadius = new CornerRadius(8),
            BorderThickness = new Thickness(1),
        };
        return b.Res(Border.BackgroundProperty, "W12.Card").Res(Border.BorderBrushProperty, "W12.Divider");
    }

    public static Border Divider(double margin = 6) =>
        new Border { Height = 1, Margin = new Thickness(0, margin) }.Res(Border.BackgroundProperty, "W12.Divider");

    /// <summary>Einstellungszeile im Stil der Windows-Einstellungen.</summary>
    public static Border SettingRow(string icon, string title, string? subtitle, Control? control)
    {
        var text = V(2, Text(title, 14));
        if (subtitle != null) text.Children.Add(Sub(subtitle, 12, wrap: true));
        text.VerticalAlignment = VerticalAlignment.Center;
        var row = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"), MinHeight = 44 };
        row.Children.Add(Icons.Glyph(icon, 20).VCenter().Margin(0, 0, 16, 0).Col(0));
        row.Children.Add(text.Col(1));
        if (control != null)
        {
            control.VerticalAlignment = VerticalAlignment.Center;
            control.Margin = new Thickness(16, 0, 0, 0);
            row.Children.Add(control.Col(2));
        }
        var card = Card(row, 12);
        card.Padding = new Thickness(16, 10);
        return card;
    }

    public static ToggleSwitch Toggle(bool value, Action<bool> changed)
    {
        var t = new ToggleSwitch { IsChecked = value, OnContent = "Ein", OffContent = "Aus" };
        t.IsCheckedChanged += (_, _) => changed(t.IsChecked == true);
        return t;
    }

    /// <summary>TextBox ohne Hintergrund/Rahmen in allen Zuständen (für Editor und Terminal).</summary>
    public static TextBox Plain(this TextBox box)
    {
        foreach (var state in new[] { "", "PointerOver", "Focused", "Disabled" })
        {
            box.Resources["TextControlBackground" + state] = Brushes.Transparent;
            box.Resources["TextControlBorderBrush" + state] = Brushes.Transparent;
        }
        box.BorderThickness = new Thickness(0);
        return box;
    }

    public static ScrollViewer Scroll(Control content) => new()
    {
        Content = content,
        HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
        VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
    };

    public static IBrush Brush(string hex) => new SolidColorBrush(Color.Parse(hex));

    public static Color Lighten(Color c, double amount) => Mix(c, Colors.White, amount);

    public static Color Darken(Color c, double amount) => Mix(c, Colors.Black, amount);

    public static Color Mix(Color a, Color b, double t) => Color.FromArgb(
        (byte)(a.A + (b.A - a.A) * t),
        (byte)(a.R + (b.R - a.R) * t),
        (byte)(a.G + (b.G - a.G) * t),
        (byte)(a.B + (b.B - a.B) * t));

    public static Color WithAlpha(Color c, byte alpha) => Color.FromArgb(alpha, c.R, c.G, c.B);
}
