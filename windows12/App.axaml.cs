using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Windows12.Core;
using Windows12.Shell;

namespace Windows12;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            UserFolders.EnsureCreated();
            Sys.Load();
            Appearance.Apply();

            var windowed = desktop.Args?.Any(a => a is "--fenster" or "--windowed") == true;
            desktop.MainWindow = new ShellWindow(windowed);
        }

        base.OnFrameworkInitializationCompleted();
    }
}
