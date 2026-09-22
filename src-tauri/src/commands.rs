//! sidecar 生命周期与生产环境 Runtime 配置注入（公共区：Tauri 配置）。
//!
//! 流程：先探测已有 runtime-state（复用外部/已存活 daemon）→ 否则拉起 sidecar
//! 子进程并轮询 state 文件 + health 探活 → 把 `{ baseUrl, sessionToken }` 返回给前端。
//! 只停由本壳拉起的子进程；不读写数据库、不实现业务。

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

/// Windows 下隐藏子进程控制台窗口（CREATE_NO_WINDOW）。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const STATE_FILE_NAME: &str = "runtime-state.json";
const SIDECAR_LOG_NAME: &str = "sidecar.log";
const START_TIMEOUT: Duration = Duration::from_secs(12);
const POLL_INTERVAL: Duration = Duration::from_millis(250);

/// 注入给前端的生产 Runtime 配置。字段与 `src/api/client.ts` 的 RuntimeConfig 对齐。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    pub base_url: String,
    pub session_token: String,
    pub expires_at: String,
}

/// `.pm-runtime/runtime-state.json` 的结构（与 runtime-sidecar lifecycle.ts 对齐）。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStateFile {
    host: String,
    port: u16,
    #[allow(dead_code)]
    pid: i64,
    session_token: String,
    expires_at: String,
}

#[derive(Default)]
pub struct SidecarStore {
    child: Mutex<Option<Child>>,
}

fn lock_child(store: &State<'_, SidecarStore>) -> std::sync::MutexGuard<'_, Option<Child>> {
    store
        .child
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("PM_RUNTIME_DATA_DIR") {
        if !dir.trim().is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    app.path()
        .app_data_dir()
        .map_err(|error| format!("app data directory is unavailable: {error}"))
}

fn read_state(path: &Path) -> Option<RuntimeStateFile> {
    let content = fs::read_to_string(path).ok()?;
    let state: RuntimeStateFile = serde_json::from_str(&content).ok()?;
    if state.host != "127.0.0.1" || state.port == 0 || state.session_token.len() != 64 {
        return None;
    }
    if !state
        .session_token
        .chars()
        .all(|c| c.is_ascii_hexdigit())
        || state.expires_at.is_empty()
    {
        return None;
    }
    Some(state)
}

/// 极简回环 health 探活：不引第三方 HTTP 依赖，只接受 `HTTP/1.1 200` 且体为 ready。
fn probe_health(base_url: &str) -> bool {
    let Some(rest) = base_url.strip_prefix("http://") else {
        return false;
    };
    let authority_path = match rest.split_once('/') {
        Some((authority, path)) => (authority, format!("/{path}")),
        None => (rest, String::new()),
    };
    let (authority, path) = authority_path;
    let request_path = format!("{path}/health");

    let Ok(mut stream) = TcpStream::connect(authority) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
    let request = format!(
        "GET {request_path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }
    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ready\"")
}

fn config_from_state(state: RuntimeStateFile) -> RuntimeConfig {
    RuntimeConfig {
        base_url: format!("http://{}:{}/api/v1", state.host, state.port),
        session_token: state.session_token,
        expires_at: state.expires_at,
    }
}

fn config_if_healthy(state_path: &Path) -> Option<RuntimeConfig> {
    let state = read_state(state_path)?;
    let config = config_from_state(state);
    if probe_health(&config.base_url) {
        Some(config)
    } else {
        None
    }
}

/// 所有可探测的 state 位置：桌面壳数据目录、显式覆盖、开发期工作目录约定。
fn candidate_state_paths(app: &AppHandle, own_dir: &Path) -> Vec<PathBuf> {
    let mut paths = vec![own_dir.join(STATE_FILE_NAME)];
    if let Ok(explicit) = std::env::var("PM_RUNTIME_STATE_PATH") {
        if !explicit.trim().is_empty() {
            paths.push(PathBuf::from(explicit));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".pm-runtime").join(STATE_FILE_NAME));
    }
    paths
}

fn spawn_command_line(command: &str) -> Result<Child, String> {
    #[cfg(windows)]
    let mut child = {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command]);
        cmd
    };
    #[cfg(not(windows))]
    let mut child = {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", command]);
        cmd
    };
    if let Ok(cwd) = std::env::var("PM_SIDECAR_CWD") {
        if !cwd.trim().is_empty() {
            child.current_dir(cwd);
        }
    }
    configure_child(&mut child, None)?;
    child.spawn().map_err(|error| format!("failed to spawn sidecar command `{command}`: {error}"))
}

fn sidecar_exe_candidates(app_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(explicit) = std::env::var("PM_SIDECAR_EXE") {
        if !explicit.trim().is_empty() {
            candidates.push(PathBuf::from(explicit));
        }
    }
    #[cfg(windows)]
    {
        candidates.push(app_dir.join("pm-runtime-sidecar.exe"));
        candidates.push(
            app_dir
                .join("binaries")
                .join("pm-runtime-sidecar-x86_64-pc-windows-msvc.exe"),
        );
    }
    #[cfg(not(windows))]
    {
        candidates.push(app_dir.join("pm-runtime-sidecar"));
    }
    candidates
}

fn configure_child(cmd: &mut Command, log_path: Option<&Path>) -> Result<(), String> {
    cmd.stdin(Stdio::null());
    match log_path {
        Some(path) => {
            let log = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .map_err(|error| format!("cannot open sidecar log: {error}"))?;
            let err = log
                .try_clone()
                .map_err(|error| format!("cannot clone sidecar log handle: {error}"))?;
            cmd.stdout(Stdio::from(log)).stderr(Stdio::from(err));
        }
        None => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    Ok(())
}

fn spawn_sidecar(app: &AppHandle, own_dir: &Path) -> Result<Child, String> {
    fs::create_dir_all(own_dir).map_err(|error| format!("cannot create data dir: {error}"))?;
    let log_path = own_dir.join(SIDECAR_LOG_NAME);

    if let Ok(command) = std::env::var("PM_SIDECAR_COMMAND") {
        if !command.trim().is_empty() {
            return spawn_command_line(&command);
        }
    }

    let app_exe = std::env::current_exe().map_err(|error| format!("current exe unavailable: {error}"))?;
    let app_dir = app_exe.parent().unwrap_or(Path::new("."));
    for exe in sidecar_exe_candidates(app_dir) {
        if !exe.exists() {
            continue;
        }
        let mut cmd = Command::new(&exe);
        cmd.env("PM_RUNTIME_DATA_DIR", own_dir);
        configure_child(&mut cmd, Some(&log_path))?;
        return cmd
            .spawn()
            .map_err(|error| format!("failed to spawn sidecar {}: {error}", exe.display()));
    }

    Err(format!(
        "SIDECAR_NOT_FOUND: pm-runtime-sidecar not found next to {} (searched PM_SIDECAR_EXE, pm-runtime-sidecar.exe, binaries/). \
         开发期请先运行 `pnpm runtime:dev` 或设置 PM_SIDECAR_COMMAND，再重试。",
        app_exe.display()
    ))
}

fn read_log_tail(path: &Path) -> String {
    const MAX: u64 = 4096;
    let Ok(meta) = fs::metadata(path) else {
        return String::new();
    };
    let start = meta.len().saturating_sub(MAX);
    let Ok(mut file) = File::open(path) else {
        return String::new();
    };
    use std::io::Seek;
    let _ = file.seek(std::io::SeekFrom::Start(start));
    let mut buffer = String::new();
    let _ = file.read_to_string(&mut buffer);
    buffer.trim().to_string()
}

fn wait_until_healthy(
    state_path: &Path,
    child: &mut Option<Child>,
    log_path: &Path,
) -> Result<RuntimeConfig, String> {
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        if let Some(config) = config_if_healthy(state_path) {
            return Ok(config);
        }
        if let Some(child) = child.as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    // 子进程退出：可能是“已有实例在跑”（探活竞态），先再探一次外部实例。
                    let tail = read_log_tail(log_path);
                    if let Some(config) = state_path
                        .parent()
                        .map(|dir| dir.join(STATE_FILE_NAME))
                        .and_then(|path| config_if_healthy(&path))
                    {
                        *child = None;
                        return Ok(config);
                    }
                    return Err(format!(
                        "sidecar exited with {status}; log tail: {tail}"
                    ));
                }
                Ok(None) => {}
                Err(error) => return Err(format!("cannot poll sidecar process: {error}")),
            }
        }
        if Instant::now() >= deadline {
            let tail = read_log_tail(log_path);
            return Err(format!(
                "sidecar did not become healthy within {START_TIMEOUT:?}; log tail: {tail}"
            ));
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

/// 启动（或复用）sidecar 并返回生产注入配置。
#[tauri::command(async)]
pub fn runtime_start(app: AppHandle) -> Result<RuntimeConfig, String> {
    let own_dir = data_dir(&app)?;
    let own_state = own_dir.join(STATE_FILE_NAME);
    let log_path = own_dir.join(SIDECAR_LOG_NAME);
    let store = app.state::<SidecarStore>();

    // 1) 已有健康实例（本壳先前拉起、开发期 pnpm runtime:dev、或旧 state）→ 直接复用。
    for path in candidate_state_paths(&app, &own_dir) {
        if let Some(config) = config_if_healthy(&path) {
            return Ok(config);
        }
    }

    // 2) 拉起新 sidecar（或接管先前由本壳拉起、state 尚未就绪的子进程）。
    let mut child_guard = lock_child(&store);
    // 拿到锁后二次探活，避免与并发调用重复 spawn。
    if let Some(config) = config_if_healthy(&own_state) {
        return Ok(config);
    }
    let mut child = child_guard.take();
    let newly_spawned = child.is_none();
    if newly_spawned {
        child = Some(spawn_sidecar(&app, &own_dir)?);
    }
    let result = wait_until_healthy(&own_state, &mut child, &log_path);
    *child_guard = child;
    drop(child_guard);
    result
}

/// 停止由桌面壳拉起的 sidecar；外部 daemon 不受影响。
#[tauri::command(async)]
pub fn runtime_stop(app: AppHandle) -> Result<(), String> {
    let store = app.state::<SidecarStore>();
    stop_owned_child(&store);
    Ok(())
}

pub fn stop_owned_child(store: &SidecarStore) {
    let mut guard = store.child.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}
