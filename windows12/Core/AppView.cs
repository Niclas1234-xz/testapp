using Avalonia.Controls;
using Windows12.Shell;

namespace Windows12.Core;

/// <summary>Basisklasse aller Apps. Eine App ist der Inhalt eines <see cref="AppWindow"/>.</summary>
public abstract class AppView : UserControl
{
    /// <summary>Das Fenster, in dem die App läuft.</summary>
    public AppWindow? Window { get; internal set; }

    protected static ShellWindow Shell => ShellWindow.Current;

    /// <summary>Ändert den Fenstertitel.</summary>
    protected void SetTitle(string title)
    {
        if (Window != null) Window.Title = title;
    }

    /// <summary>Darf das Fenster geschlossen werden? (z. B. „Änderungen speichern?“)</summary>
    public virtual Task<bool> CanCloseAsync() => Task.FromResult(true);

    /// <summary>Das Fenster wurde geöffnet und ist sichtbar.</summary>
    public virtual void OnOpened() { }

    /// <summary>Das Fenster wurde aktiviert (Fokus).</summary>
    public virtual void OnActivated() { }

    /// <summary>Das Fenster wurde geschlossen – Timer usw. hier aufräumen.</summary>
    public virtual void OnClosed() { }

    /// <summary>Ein zweites Argument wurde an eine bereits laufende Einzelinstanz übergeben.</summary>
    public virtual void OnArgument(string? argument) { }
}
