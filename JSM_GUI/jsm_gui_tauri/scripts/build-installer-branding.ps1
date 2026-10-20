$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# NSIS needs 24-bit BMPs. Render the existing product mark; no external assets
# or font downloads are needed to reproduce these two installer resources.
$icons = Join-Path $PSScriptRoot '../src-tauri/icons'
$mark = [System.Drawing.Image]::FromFile((Join-Path $icons '256x256.png'))
try {
    foreach ($kind in @('header', 'sidebar')) {
        $width = if ($kind -eq 'header') { 150 } else { 164 }
        $height = if ($kind -eq 'header') { 57 } else { 314 }
        $bitmap = New-Object System.Drawing.Bitmap($width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb))
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            if ($kind -eq 'header') {
                $graphics.Clear([System.Drawing.Color]::White)
                $graphics.DrawImage($mark, 93, 3, 51, 51)
            } else {
                $graphics.Clear([System.Drawing.Color]::FromArgb(16, 24, 32))
                $graphics.DrawImage($mark, 22, 38, 120, 120)
                $font = New-Object System.Drawing.Font('Segoe UI', 16, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel))
                $small = New-Object System.Drawing.Font('Segoe UI', 11, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel))
                $format = New-Object System.Drawing.StringFormat
                $format.Alignment = [System.Drawing.StringAlignment]::Center
                try {
                    $graphics.DrawString('JSM Evolved', $font, [System.Drawing.Brushes]::White, ([System.Drawing.RectangleF]::new(0, 180, 164, 26)), $format)
                    $graphics.DrawString("Gyro aiming`nTrackpads`nGame profiles", $small, [System.Drawing.Brushes]::LightBlue, ([System.Drawing.RectangleF]::new(0, 218, 164, 70)), $format)
                } finally {
                    $font.Dispose()
                    $small.Dispose()
                    $format.Dispose()
                }
            }
            $bitmap.Save((Join-Path $icons "installer-$kind.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $mark.Dispose()
}
