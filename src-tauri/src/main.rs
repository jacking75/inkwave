#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("INKWAVE 데스크톱 호스트를 시작하지 못했다.");
}
