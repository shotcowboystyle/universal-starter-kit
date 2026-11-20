//! __NAME__ Tauri desktop entry point — delegates to the shared lib.rs so
//! the same crate can later host mobile entry points (tauri ios/android).

// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run();
}
