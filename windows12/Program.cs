using System.Globalization;
using Avalonia;

namespace Windows12;

internal static class Program
{
    // Avalonia darf vor AppMain nicht verwendet werden.
    [STAThread]
    public static void Main(string[] args)
    {
        // Windows 12 spricht Deutsch – unabhängig von der Sprache des echten Systems.
        var german = new CultureInfo("de-DE");
        CultureInfo.DefaultThreadCurrentCulture = german;
        CultureInfo.DefaultThreadCurrentUICulture = german;
        CultureInfo.CurrentCulture = german;
        CultureInfo.CurrentUICulture = german;

        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    // Wird auch vom Designer verwendet.
    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
