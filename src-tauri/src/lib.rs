use tauri_plugin_shell::ShellExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Spawn the FastAPI backend sidecar automatically on application startup
            let sidecar_command = app.shell().sidecar("fastapi-backend");
            match sidecar_command {
                Ok(cmd) => {
                    match cmd.spawn() {
                        Ok((_rx, _child)) => {
                            println!("FastAPI backend sidecar spawned successfully.");
                        }
                        Err(e) => {
                            eprintln!("Warning: Failed to spawn sidecar binary directly: {:?}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Warning: Failed to create sidecar command: {:?}", e);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
