// INKWAVE Tauri 호스트 공통 진입점(34번 F01 데스크톱, 33번 M002 Android 셸).
// 게임 로직은 TypeScript이고 여기는 창(웹뷰)과 허용된 외부 링크 열기만 맡는다.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("INKWAVE 호스트를 시작하지 못했다.");
}
