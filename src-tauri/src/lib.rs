mod commands;

use tauri::Manager;

pub use commands::{runtime_start, runtime_stop, SidecarStore};

/// 桌面壳入口：只负责窗口、capability 与 sidecar 生命周期，不承载领域业务。
///
/// 能力边界（COM-002/ARCHITECTURE §2）：
/// - `runtime_start`/`runtime_stop` 托管 `pm-runtime-sidecar` 子进程并把
///   baseUrl/sessionToken 通过 Tauri 命令注入前端（生产唯一注入来源，COM-036 收口）。
/// - 不直接打开 SQLite、不实现业务 API；数据库唯一写入者仍是 Runtime daemon。
pub fn run() {
    let app = tauri::Builder::default()
        .manage(commands::SidecarStore::default())
        .invoke_handler(tauri::generate_handler![commands::runtime_start, commands::runtime_stop])
        .build(tauri::generate_context!())
        .expect("failed to build PM Runtime desktop shell");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            // 进程退出前停掉由桌面壳拉起的 sidecar，避免留下孤儿监听端口。
            // 外部自行启动的 daemon（开发期 `pnpm runtime:dev`）不归本壳管理，不会被停掉。
            if let Some(store) = app_handle.try_state::<SidecarStore>() {
                commands::stop_owned_child(&store);
            }
        }
    });
}
