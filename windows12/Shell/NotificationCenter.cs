using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Templates;
using Avalonia.Layout;
using Avalonia.Media;
using Windows12.Core;

namespace Windows12.Shell;

/// <summary>Benachrichtigungscenter mit Kalender.</summary>
public sealed class NotificationCenter : Flyout
{
    readonly TextBlock _dateTitle;
    readonly Calendar _calendar;
    readonly TextBlock _empty;

    public NotificationCenter() : base(380)
    {
        var shell = ShellWindow.Current;

        var header = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Children =
            {
                UI.Text("Benachrichtigungen", 14, FontWeight.SemiBold).VCenter().Col(0),
                UI.Flat(UI.Text("Alle löschen", 12), () => shell.Notifications.Clear()).Col(1),
            },
        };

        _empty = UI.Sub("Keine neuen Benachrichtigungen", 13).Center();
        _empty.Margin = new Thickness(0, 24);

        var list = new ItemsControl
        {
            ItemsSource = shell.Notifications,
            ItemTemplate = new FuncDataTemplate<Notification>((n, _) => n == null ? new Border() : Card(n)),
        };
        shell.Notifications.CollectionChanged += (_, _) => _empty.IsVisible = shell.Notifications.Count == 0;
        _empty.IsVisible = shell.Notifications.Count == 0;

        var notifications = new ScrollViewer
        {
            MaxHeight = 330,
            Content = new Panel { Children = { _empty, list } },
        };

        _dateTitle = UI.Text("", 14, FontWeight.SemiBold);
        _calendar = new Calendar
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            SelectionMode = CalendarSelectionMode.SingleDate,
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
        };

        var calendarCard = new Border
        {
            Padding = new Thickness(16, 14),
            BorderThickness = new Thickness(0, 1, 0, 0),
            Child = UI.V(8, _dateTitle, _calendar),
        }.Res(BorderBrushProperty, "W12.Divider");
        DockPanel.SetDock(calendarCard, Avalonia.Controls.Dock.Bottom);

        Child = new DockPanel
        {
            Children = { calendarCard, UI.V(10, header, notifications).Margin(16, 14, 16, 14) },
        };
    }

    Control Card(Notification n)
    {
        var shell = ShellWindow.Current;
        var app = n.AppId != null ? AppRegistry.Get(n.AppId) : null;
        var remove = UI.IconButton("close", () => shell.Notifications.Remove(n), "Schließen", 11, 24);
        remove.VerticalAlignment = VerticalAlignment.Top;

        var body = new Grid
        {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Children =
            {
                (app != null ? Icons.Tile(app, 26) : Icons.Logo(22)).Margin(0, 2, 10, 0).Col(0),
                UI.V(2,
                    UI.Text(n.Title, 13, FontWeight.SemiBold),
                    UI.Sub(n.Message, 12, wrap: true),
                    UI.Sub(Sys.FormatTime(n.Time, false), 11)).Col(1),
                remove.Col(2),
            },
        };
        var card = UI.Card(body, 12);
        card.Margin = new Thickness(0, 0, 0, 8);
        card.Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand);
        card.PointerPressed += (_, e) =>
        {
            if (e.Handled || n.AppId == null) return;
            shell.Notifications.Remove(n);
            shell.Launch(n.AppId);
        };
        return card;
    }

    protected override void OnOpening()
    {
        var today = DateTime.Today;
        _dateTitle.Text = today.ToString("dddd, d. MMMM", Sys.German);
        _calendar.DisplayDate = today;
        _calendar.SelectedDate = today;
    }

    public override void UpdatePlacement()
    {
        HorizontalAlignment = HorizontalAlignment.Right;
        if (Sys.Settings.ShowTopBar)
        {
            VerticalAlignment = VerticalAlignment.Top;
            Margin = new Thickness(0, TopOffset, 8, 0);
        }
        else
        {
            VerticalAlignment = VerticalAlignment.Bottom;
            Margin = new Thickness(0, 0, 8, ShellWindow.TaskbarReserve + 4);
        }
    }
}
