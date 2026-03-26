use std::{fs, path::Path};

fn watch_path(path: &Path) {
    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                watch_path(&entry.path());
            }
        }
        return;
    }

    println!("cargo:rerun-if-changed={}", path.display());
}

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.linux.conf.json");
    println!("cargo:rerun-if-changed=tauri.macos.conf.json");

    watch_path(Path::new("icons"));

    tauri_build::build()
}
