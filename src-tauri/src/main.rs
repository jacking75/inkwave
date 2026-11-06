#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// INKWAVE 데스크톱 호스트(34번 F01). 실제 구성은 lib.rs의 run()이 모바일 셸과 함께 쓴다.
fn main() {
    inkwave_desktop_lib::run();
}
