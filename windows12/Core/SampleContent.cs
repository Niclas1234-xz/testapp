using Avalonia;
using Avalonia.Media.Imaging;

namespace Windows12.Core;

/// <summary>Legt beim ersten Start ein paar Beispielbilder an, damit Fotos & Co. nicht leer sind.</summary>
public static class SampleContent
{
    public static void EnsurePictures()
    {
        var marker = Path.Combine(UserFolders.SystemDir, "beispielbilder");
        if (File.Exists(marker)) return;
        File.WriteAllText(marker, DateTime.Now.ToString("O"));
        if (Directory.EnumerateFileSystemEntries(UserFolders.Pictures).Any()) return;

        var size = new Size(1280, 800);
        foreach (var wallpaper in Appearance.Wallpapers.Take(4))
        {
            try
            {
                var control = Appearance.CreateWallpaper(wallpaper.Id, null);
                control.Measure(size);
                control.Arrange(new Rect(size));
                using var bitmap = new RenderTargetBitmap(new PixelSize((int)size.Width, (int)size.Height), new Vector(96, 96));
                bitmap.Render(control);
                bitmap.Save(Path.Combine(UserFolders.Pictures, $"{wallpaper.Name}.png"), PngBitmapEncoderOptions.Default);
            }
            catch
            {
                // Beispielbilder sind optional.
            }
        }
    }
}
