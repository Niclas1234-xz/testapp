using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Task-Ansicht: alle Fenster als Vorschau und virtuelle Desktops.</summary>
public sealed class TaskView : Border
{
    readonly WrapPanel _windows = new() { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
    readonly StackPanel _desktops = new() { Orientation = Orientation.Horizontal, Spacing = 12, HorizontalAlignment = HorizontalAlignment.Center };

    public bool IsOpen { get; private set; }

    public TaskView()
    {
        IsVisible = false;
        Opacity = 0;
        Background = new SolidColorBrush(Color.Parse("#A0000000"));
        Transitions = [new DoubleTransition { Property = OpacityProperty, Duration = TimeSpan.FromMilliseconds(160) }];

        var desktopBar = new Border
        {
            Padding = new Thickness(16, 12),
            CornerRadius = new CornerRadius(12),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 0, 0, ShellWindow.TaskbarReserve + 12),
            Child = _desktops,
        }.Res(BackgroundProperty, "W12.Glass");
        DockPanel.SetDock(desktopBar, Avalonia.Controls.Dock.Bottom);

        Child = new DockPanel
        {
            Children = { desktopBar, UI.Scroll(_windows).Margin(40, 60, 40, 20) },
        };

        PointerPressed += (_, e) =>
        {
            if (e.Source == this || e.Source is DockPanel or ScrollViewer or WrapPanel) Close();
        };
        ShellWindow.Current.WM.Changed += () =>
        {
            if (IsOpen) Dispatcher.UIThread.Post(Render, DispatcherPriority.Background);
        };
    }

    public void Open()
    {
        IsOpen = true;
        Render();
        IsVisible = true;
        Dispatcher.UIThread.Post(() => Opacity = 1, DispatcherPriority.Background);
    }

    public void Close()
    {
        IsOpen = false;
        Opacity = 0;
        DispatcherTimer.RunOnce(() =>
        {
            if (!IsOpen) IsVisible = false;
        }, TimeSpan.FromMilliseconds(160));
    }

    void Render()
    {
        var wm = ShellWindow.Current.WM;
        _windows.Children.Clear();
        var windows = wm.OnCurrentDesktop.OrderByDescending(w => w.ZIndex).ToList();
        if (windows.Count == 0)
            _windows.Children.Add(new TextBlock { Text = "Keine geöffneten Fenster auf diesem Desktop", Foreground = Brushes.White, FontSize = 16, Opacity = 0.8 });
        foreach (var w in windows) _windows.Children.Add(WindowCard(w));

        _desktops.Children.Clear();
        for (var i = 0; i < wm.DesktopCount; i++) _desktops.Children.Add(DesktopChip(i));
        var add = UI.Flat(UI.V(6, Icons.Glyph("plus", 22).Center(), UI.Text("Neuer Desktop", 12).Center()), wm.AddDesktop);
        add.Width = 150;
        add.Height = 96;
        add.HorizontalContentAlignment = HorizontalAlignment.Center;
        _desktops.Children.Add(add);
    }

    Control WindowCard(AppWindow w)
    {
        var wm = ShellWindow.Current.WM;
        var bounds = w.VisibleBounds;
        var ratio = bounds.Height / Math.Max(1, bounds.Width);
        const double width = 300;
        var height = Math.Clamp(width * ratio, 120, 220);

        Control preview = w.IsMinimized
            ? Icons.Tile(w.App, 64).Center()
            : new Border { Background = new VisualBrush { Visual = w.Frame, Stretch = Stretch.Uniform } };

        var close = UI.IconButton("close", () => wm.Close(w), "Schließen", 11, 26);
        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Children =
            {
                Icons.Tile(w.App, 16).VCenter().Margin(0, 0, 8, 0).Col(0),
                UI.Text(w.Title, 12).VCenter().Col(1),
                close.Col(2),
            },
        };

        var card = new Border
        {
            Width = width + 16,
            Margin = new Thickness(12),
            Padding = new Thickness(8),
            CornerRadius = new CornerRadius(10),
            BorderThickness = new Thickness(2),
            BorderBrush = w == wm.Active ? null : Brushes.Transparent,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
            Child = UI.V(8, header, new Border { Height = height, Child = preview, CornerRadius = new CornerRadius(6), ClipToBounds = true }),
        }.Res(BackgroundProperty, "W12.Glass");
        if (w == wm.Active) card.Res(BorderBrushProperty, "W12.Accent");

        card.PointerPressed += (_, e) =>
        {
            if (e.Handled || !e.GetCurrentPoint(card).Properties.IsLeftButtonPressed) return;
            e.Handled = true;
            Close();
            wm.Activate(w);
        };

        if (wm.DesktopCount > 1)
        {
            var items = new List<Control>();
            for (var i = 0; i < wm.DesktopCount; i++)
            {
                var index = i;
                if (index == w.Desktop) continue;
                var item = new MenuItem { Header = $"Verschieben nach Desktop {i + 1}", Icon = Icons.Glyph("taskview", 14) };
                item.Click += (_, _) => wm.MoveToDesktop(w, index);
                items.Add(item);
            }
            card.ContextMenu = new ContextMenu { ItemsSource = items };
        }
        return card;
    }

    Control DesktopChip(int index)
    {
        var wm = ShellWindow.Current.WM;
        var count = wm.Windows.Count(w => w.Desktop == index);
        var current = index == wm.CurrentDesktop;

        var content = new Grid
        {
            RowDefinitions = new RowDefinitions("*,Auto"),
            Children =
            {
                Icons.Glyph("desktop", 26).Center().Row(0),
                UI.V(0, UI.Text($"Desktop {index + 1}", 12, FontWeight.SemiBold).Center(), UI.Sub(count == 1 ? "1 Fenster" : $"{count} Fenster", 11).Center()).Row(1),
            },
        };
        var chip = UI.Flat(content, () =>
        {
            wm.SwitchDesktop(index);
            Render();
        });
        chip.Width = 150;
        chip.Height = 96;
        chip.BorderThickness = new Thickness(2);
        if (current) chip.Res(BorderBrushProperty, "W12.Accent");

        var panel = new Panel { Children = { chip } };
        if (wm.DesktopCount > 1)
        {
            var remove = UI.IconButton("close", () => wm.RemoveDesktop(index), "Desktop schließen", 10, 22);
            remove.HorizontalAlignment = HorizontalAlignment.Right;
            remove.VerticalAlignment = VerticalAlignment.Top;
            remove.Margin = new Thickness(0, 4, 4, 0);
            panel.Children.Add(remove);
        }
        return panel;
    }
}
