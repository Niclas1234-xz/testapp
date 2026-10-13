using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Windows12.Core;

namespace Windows12.Apps;

/// <summary>„Info über Windows“ (winver).</summary>
public sealed class AboutApp : AppView
{
    public AboutApp()
    {
        var logo = UI.H(18, Icons.Logo(64), UI.V(0,
            UI.Text("Windows 12", 34, FontWeight.SemiBold),
            UI.Sub("Pro · Version 25H2", 14)).VCenter());
        logo.HorizontalAlignment = HorizontalAlignment.Center;

        var ok = UI.Btn("OK", () =>
        {
            if (Window != null) Shell.WM.Close(Window);
        }, accent: true);
        ok.HorizontalAlignment = HorizontalAlignment.Right;

        Content = new DockPanel
        {
            Margin = new Thickness(28, 24),
            Children =
            {
                ok.Dock(Avalonia.Controls.Dock.Bottom),
                UI.V(14,
                    logo,
                    UI.Divider(),
                    UI.Text("Windows 12", 14, FontWeight.SemiBold),
                    UI.Sub("Version 25H2 (Betriebssystembuild 30000.1)", 13),
                    UI.Sub("Ein Fan-Projekt in C# mit Avalonia UI. Kein Produkt der Microsoft Corporation.", 13, wrap: true),
                    UI.Sub($"Läuft auf: {RuntimeInformation.OSDescription} · {RuntimeInformation.FrameworkDescription}", 12, wrap: true),
                    UI.Divider(),
                    UI.H(10, Icons.Avatar(Sys.Settings.UserName, Sys.Settings.AvatarColor, 32),
                        UI.V(0, UI.Sub("Dieses Produkt ist lizenziert für:", 12), UI.Text(Sys.Settings.UserName, 13, FontWeight.SemiBold)).VCenter())),
            },
        };
    }
}
