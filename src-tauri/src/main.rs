#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// INKWAVE 데스크톱 호스트(34번 F01). 게임 로직은 TypeScript이고 여기는 창과 허용된 외부 링크 열기만 맡는다.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("INKWAVE 데스크톱 호스트를 시작하지 못했다.");
}
