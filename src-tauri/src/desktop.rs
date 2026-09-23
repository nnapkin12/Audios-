//! User-level desktop entry for AppImage launches.
//!
//! A `.deb` install already places a desktop file in `/usr/share/applications`.
//! An AppImage does not. On first launch, and again if the AppImage moves,
//! write the XDG entry every desktop reads: `~/.local/share/applications`.

use std::path::PathBuf;

pub fn install() {
    let Ok(appimage) = std::env::var("APPIMAGE") else {
        return;
    };
    if appimage.is_empty() || appimage.contains('\n') {
        return;
    }
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let home = PathBuf::from(home);
    let apps = home.join(".local/share/applications");
    let icons = home.join(".local/share/icons/hicolor/128x128/apps");
    if std::fs::create_dir_all(&apps).is_err() || std::fs::create_dir_all(&icons).is_err() {
        return;
    }
    let icon_path = icons.join("com.audios.desktop.png");
    if std::fs::write(&icon_path, include_bytes!("../icons/128x128.png")).is_err() {
        return;
    }
    let desktop_path = apps.join("com.audios.desktop.desktop");
    let body = desktop_entry(&appimage, &icon_path.to_string_lossy());
    if std::fs::read_to_string(&desktop_path).ok().as_deref() == Some(body.as_str()) {
        return;
    }
    let _ = std::fs::write(&desktop_path, body);
}

fn desktop_entry(exec: &str, icon: &str) -> String {
    let exec = exec.replace('"', "");
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Version=1.0\n\
         Name=Audios!\n\
         GenericName=Music Player\n\
         Comment=Play local music\n\
         Exec=\"{exec}\" %U\n\
         Icon={icon}\n\
         Terminal=false\n\
         Categories=AudioVideo;Audio;Music;Player;\n\
         Keywords=Music;Audio;Player;\n\
         StartupWMClass=com.audios.desktop\n\
         MimeType=audio/flac;audio/mpeg;audio/mp4;audio/ogg;audio/opus;audio/x-flac;audio/x-vorbis+ogg;audio/wav;audio/x-wav;audio/aac;audio/x-m4a;audio/aiff;audio/x-aiff;\n\
         StartupNotify=true\n"
    )
}

#[cfg(test)]
mod tests {
    use super::desktop_entry;

    #[test]
    fn appimage_entry_lands_in_multimedia() {
        let body = desktop_entry("/home/listener/Audios!.AppImage", "/tmp/audios.png");
        assert!(body.contains("Categories=AudioVideo;Audio;Music;Player;"));
        assert!(body.contains("Exec=\"/home/listener/Audios!.AppImage\" %U"));
        assert!(body.contains("Name=Audios!"));
    }
}
