mod builds;
mod llm;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(llm::CancelRegistry::default())
        .invoke_handler(tauri::generate_handler![
            llm::generate_build,
            llm::get_settings,
            llm::save_settings,
            llm::cancel_generation,
            builds::save_build,
            builds::list_builds,
            builds::load_build,
            builds::delete_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
