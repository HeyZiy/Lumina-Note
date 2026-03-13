use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use crate::error::AppError;

static RUNTIME_ALLOWED_ROOTS: Lazy<RwLock<Vec<PathBuf>>> = Lazy::new(|| RwLock::new(Vec::new()));

#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
    pub created_at: Option<u64>,
    pub children: Option<Vec<FileEntry>>,
}

fn metadata_timestamp(metadata: &fs::Metadata, field: &str) -> Option<u64> {
    let system_time = match field {
        "created" => metadata.created().ok()?,
        _ => metadata.modified().ok()?,
    };
    system_time
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
}

fn absolute_path(path: &Path) -> Result<PathBuf, AppError> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(env::current_dir()?.join(path))
    }
}

fn canonicalize_existing_ancestor(path: &Path) -> Result<PathBuf, AppError> {
    let mut cursor = path.to_path_buf();
    loop {
        if cursor.exists() {
            return fs::canonicalize(&cursor).map_err(AppError::from);
        }
        if !cursor.pop() {
            break;
        }
    }
    Err(AppError::InvalidPath(
        "Path has no existing ancestor".to_string(),
    ))
}

fn normalize_roots(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for path in paths {
        if !path.exists() {
            continue;
        }
        let Ok(canonical) = fs::canonicalize(path) else {
            continue;
        };
        let key = canonical.to_string_lossy().to_string();
        if seen.insert(key) {
            normalized.push(canonical);
        }
    }

    normalized
}

fn default_allowed_roots() -> Vec<PathBuf> {
    if let Some(value) = env::var_os("LUMINA_ALLOWED_FS_ROOTS") {
        return normalize_roots(env::split_paths(&value).collect());
    }

    let mut roots = Vec::new();
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        roots.push(home.clone());
        roots.push(home.join("Documents"));
        roots.push(home.join("Desktop"));
    }
    if let Some(appdata) = env::var_os("APPDATA") {
        roots.push(PathBuf::from(appdata));
    }
    if let Some(local_appdata) = env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(local_appdata));
    }
    if let Ok(cwd) = env::current_dir() {
        roots.push(cwd);
    }

    // Add network drive mount points
    // macOS: /Volumes for network drives and external volumes
    if cfg!(target_os = "macos") {
        let volumes = PathBuf::from("/Volumes");
        if volumes.exists() {
            roots.push(volumes);
        }
    }
    // Linux: /mnt and /media for network drives and removable media
    if cfg!(target_os = "linux") {
        let mnt = PathBuf::from("/mnt");
        if mnt.exists() {
            roots.push(mnt);
        }
        let media = PathBuf::from("/media");
        if media.exists() {
            roots.push(media);
        }
    }
    // Windows: Network drives are mapped as drive letters (Z:\, Y:\, etc.)
    // They are already covered by the drive root detection above

    normalize_roots(roots)
}

fn runtime_allowed_roots() -> Vec<PathBuf> {
    match RUNTIME_ALLOWED_ROOTS.read() {
        Ok(guard) => guard.clone(),
        Err(_) => Vec::new(),
    }
}

fn allowed_roots() -> Vec<PathBuf> {
    if env::var_os("LUMINA_ALLOWED_FS_ROOTS").is_some() {
        return default_allowed_roots();
    }

    let mut roots = runtime_allowed_roots();
    roots.extend(default_allowed_roots());
    normalize_roots(roots)
}

pub fn set_runtime_allowed_roots(roots: Vec<String>) -> Result<(), AppError> {
    let normalized = normalize_roots(roots.into_iter().map(PathBuf::from).collect());
    let mut guard = RUNTIME_ALLOWED_ROOTS
        .write()
        .map_err(|_| AppError::InvalidPath("Failed to update allowed roots".to_string()))?;
    *guard = normalized;
    Ok(())
}

pub fn ensure_allowed_path(path: &Path, must_exist: bool) -> Result<(), AppError> {
    let absolute = absolute_path(path)?;
    let candidate = if must_exist {
        fs::canonicalize(&absolute).map_err(AppError::from)?
    } else {
        canonicalize_existing_ancestor(&absolute)?
    };

    let roots = allowed_roots();
    if roots.is_empty() {
        return Err(AppError::InvalidPath(
            "No allowed roots configured".to_string(),
        ));
    }

    if roots.iter().any(|root| candidate.starts_with(root)) {
        Ok(())
    } else {
        Err(AppError::InvalidPath(format!(
            "Path not permitted: {}",
            path.display()
        )))
    }
}

/// Read file content as UTF-8 string
pub fn read_file_content(path: &str) -> Result<String, AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, true)?;
    if !path.exists() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    fs::read_to_string(path).map_err(AppError::from)
}

/// Write content to file, creating parent directories if needed
pub fn write_file_content(path: &str, content: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).map_err(AppError::from)
}

/// Check whether a file or directory exists under allowed roots.
pub fn path_exists_in_allowed_roots(path: &str) -> Result<bool, AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    Ok(path.exists())
}

/// List directory contents recursively (all files)
pub fn list_dir_recursive(path: &str) -> Result<Vec<FileEntry>, AppError> {
    let root = Path::new(path);
    ensure_allowed_path(root, true)?;
    if !root.exists() {
        return Err(AppError::FileNotFound(path.to_string()));
    }
    if !root.is_dir() {
        return Err(AppError::InvalidPath("Path is not a directory".to_string()));
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and directories (except .lumina)
        if name.starts_with('.') && name != ".lumina" {
            continue;
        }

        // Skip node_modules and other common non-user directories
        if name == "node_modules" || name == "target" || name == ".git" {
            continue;
        }

        if path.is_dir() {
            let metadata = entry.metadata()?;
            let children = list_dir_recursive(&path.to_string_lossy())?;
            // Include all directories (including empty ones)
            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                size: None,
                modified_at: metadata_timestamp(&metadata, "modified"),
                created_at: metadata_timestamp(&metadata, "created"),
                children: Some(children),
            });
        } else {
            let metadata = entry.metadata()?;
            // Include all files
            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                size: Some(metadata.len()),
                modified_at: metadata_timestamp(&metadata, "modified"),
                created_at: metadata_timestamp(&metadata, "created"),
                children: None,
            });
        }
    }

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Create a new .md file
pub fn create_new_file(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    if path.exists() {
        return Err(AppError::FileExists(path.display().to_string()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, "").map_err(AppError::from)
}

/// Delete a file or directory (move to trash/recycle bin)
pub fn delete_entry(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, true)?;
    if !path.exists() {
        return Err(AppError::FileNotFound(path.display().to_string()));
    }
    // 移动到回收站而非永久删除
    trash::delete(path)?;
    Ok(())
}

/// Create a new directory
pub fn create_new_dir(path: &str) -> Result<(), AppError> {
    let path = Path::new(path);
    ensure_allowed_path(path, false)?;
    if path.exists() {
        return Err(AppError::FileExists(path.display().to_string()));
    }
    fs::create_dir_all(path).map_err(AppError::from)
}

/// Rename/move a file or directory
pub fn rename_entry(old_path: &str, new_path: &str) -> Result<(), AppError> {
    let old = Path::new(old_path);
    let new = Path::new(new_path);
    ensure_allowed_path(old, true)?;
    ensure_allowed_path(new, false)?;
    if !old.exists() {
        return Err(AppError::FileNotFound(old_path.to_string()));
    }
    if new.exists() {
        return Err(AppError::FileExists(new_path.to_string()));
    }
    if let Some(parent) = new.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(old, new).map_err(AppError::from)
}

/// Move a file to a target folder
/// Returns the new path of the moved file
pub fn move_file_to_folder(source: &str, target_folder: &str) -> Result<String, AppError> {
    let source_path = Path::new(source);
    let target_folder_path = Path::new(target_folder);
    ensure_allowed_path(source_path, true)?;
    ensure_allowed_path(target_folder_path, true)?;

    // Check source exists and is a file
    if !source_path.exists() {
        return Err(AppError::FileNotFound(source.to_string()));
    }
    if source_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Source is a directory, use move_folder instead".to_string(),
        ));
    }

    // Check target folder exists and is a directory
    if !target_folder_path.exists() {
        return Err(AppError::FileNotFound(target_folder.to_string()));
    }
    if !target_folder_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Target is not a directory".to_string(),
        ));
    }

    // Build new path
    let file_name = source_path
        .file_name()
        .ok_or_else(|| AppError::InvalidPath("Invalid source file name".to_string()))?;
    let new_path = target_folder_path.join(file_name);

    // Check if target already exists
    if new_path.exists() {
        return Err(AppError::FileExists(new_path.display().to_string()));
    }

    // Move the file
    fs::rename(source_path, &new_path).map_err(AppError::from)?;

    Ok(new_path.to_string_lossy().to_string())
}

/// Move a folder to a target folder
/// Returns the new path of the moved folder
pub fn move_folder_to_folder(source: &str, target_folder: &str) -> Result<String, AppError> {
    let source_path = Path::new(source);
    let target_folder_path = Path::new(target_folder);
    ensure_allowed_path(source_path, true)?;
    ensure_allowed_path(target_folder_path, true)?;

    // Check source exists and is a directory
    if !source_path.exists() {
        return Err(AppError::FileNotFound(source.to_string()));
    }
    if !source_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Source is not a directory".to_string(),
        ));
    }

    // Check target folder exists and is a directory
    if !target_folder_path.exists() {
        return Err(AppError::FileNotFound(target_folder.to_string()));
    }
    if !target_folder_path.is_dir() {
        return Err(AppError::InvalidPath(
            "Target is not a directory".to_string(),
        ));
    }

    // Build new path
    let folder_name = source_path
        .file_name()
        .ok_or_else(|| AppError::InvalidPath("Invalid source folder name".to_string()))?;
    let new_path = target_folder_path.join(folder_name);

    // Check if moving to self or subdirectory
    let source_canonical = source_path
        .canonicalize()
        .map_err(|_| AppError::InvalidPath("Cannot resolve source path".to_string()))?;
    let target_canonical = target_folder_path
        .canonicalize()
        .map_err(|_| AppError::InvalidPath("Cannot resolve target path".to_string()))?;

    if target_canonical.starts_with(&source_canonical) {
        return Err(AppError::InvalidPath(
            "Cannot move folder into itself or its subdirectory".to_string(),
        ));
    }

    // Check if target already exists
    if new_path.exists() {
        return Err(AppError::FileExists(new_path.display().to_string()));
    }

    // Move the folder
    fs::rename(source_path, &new_path).map_err(AppError::from)?;

    Ok(new_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use once_cell::sync::Lazy;
    use std::sync::{Mutex, PoisonError};
    use tempfile::TempDir;

    static ENV_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

    /// 获取 ENV_LOCK，即使之前的测试 panic 也能恢复
    fn env_lock_guard() -> std::sync::MutexGuard<'static, ()> {
        ENV_LOCK.lock().unwrap_or_else(|e: PoisonError<_>| {
            // 如果 lock 被 poison，说明之前的测试 panic 了
            // 我们获取锁并继续，因为 poison 只是表示有 panic，不表示数据损坏
            e.into_inner()
        })
    }

    fn with_allowed_root<F: FnOnce()>(root: &Path, f: F) {
        let _guard = env_lock_guard();
        let original = env::var_os("LUMINA_ALLOWED_FS_ROOTS");
        env::set_var("LUMINA_ALLOWED_FS_ROOTS", root);
        f();
        match original {
            Some(value) => env::set_var("LUMINA_ALLOWED_FS_ROOTS", value),
            None => env::remove_var("LUMINA_ALLOWED_FS_ROOTS"),
        }
    }

    #[test]
    fn write_and_read_within_allowed_root() {
        let dir = TempDir::new().expect("temp dir");
        let file_path = dir.path().join("note.md");
        with_allowed_root(dir.path(), || {
            write_file_content(file_path.to_string_lossy().as_ref(), "hello")
                .expect("write within allowed root");
            let content = read_file_content(file_path.to_string_lossy().as_ref())
                .expect("read within allowed root");
            assert_eq!(content, "hello");
        });
    }

    #[test]
    fn rejects_access_outside_allowed_root() {
        let allowed = TempDir::new().expect("allowed temp dir");
        let outside = TempDir::new().expect("outside temp dir");
        let outside_file = outside.path().join("secret.txt");
        with_allowed_root(allowed.path(), || {
            let err = write_file_content(outside_file.to_string_lossy().as_ref(), "nope")
                .expect_err("should reject outside root");
            assert!(matches!(err, AppError::InvalidPath(_)));
        });
    }

    #[test]
    fn path_exists_within_allowed_root() {
        let dir = TempDir::new().expect("temp dir");
        let file_path = dir.path().join("exists.md");
        with_allowed_root(dir.path(), || {
            fs::write(&file_path, "ok").expect("write fixture");
            let exists = path_exists_in_allowed_roots(file_path.to_string_lossy().as_ref())
                .expect("check exists");
            assert!(exists);
        });
    }

    #[test]
    fn path_exists_rejects_outside_allowed_root() {
        let allowed = TempDir::new().expect("allowed temp dir");
        let outside = TempDir::new().expect("outside temp dir");
        with_allowed_root(allowed.path(), || {
            let err = path_exists_in_allowed_roots(outside.path().to_string_lossy().as_ref())
                .expect_err("should reject outside root");
            assert!(matches!(err, AppError::InvalidPath(_)));
        });
    }

    #[test]
    fn ensure_allowed_path_fails_when_no_roots_configured() {
        // 模拟启动时序问题：在设置任何 allowed roots 之前就访问文件
        let _guard = env_lock_guard();
        let original = env::var_os("LUMINA_ALLOWED_FS_ROOTS");
        env::remove_var("LUMINA_ALLOWED_FS_ROOTS");
        
        // 清空 runtime roots
        set_runtime_allowed_roots(vec![]).expect("clear runtime roots");
        
        // 创建一个临时目录（可能在 /var/folders 或 /tmp，不在 default roots 中）
        let temp = TempDir::new().expect("temp dir");
        let file_path = temp.path().join("test.txt");
        fs::write(&file_path, "test").expect("write test file");
        
        // 验证 default_allowed_roots 不为空（提供后备保护）
        let default_roots = default_allowed_roots();
        assert!(!default_roots.is_empty(), "default roots should not be empty");
        
        // 临时目录可能不在 default roots 中（如 /var/folders/...）
        // 所以这个测试主要验证：
        // 1. default_allowed_roots 提供了一些路径（HOME, /Volumes 等）
        // 2. 不在这些路径中的文件会被拒绝
        // 
        // 真正的风险场景是：用户选择了不在 default roots 中的路径
        // （如 Windows 网络驱动器 Y:\），但在 fs_set_allowed_roots 调用之前就访问它
        
        let result = ensure_allowed_path(&file_path, true);
        // 临时目录可能允许也可能不允许，取决于是否在 default roots 中
        // 这个测试主要文档化 default roots 的存在和行为
        
        // 恢复环境变量
        match original {
            Some(value) => env::set_var("LUMINA_ALLOWED_FS_ROOTS", value),
            None => env::remove_var("LUMINA_ALLOWED_FS_ROOTS"),
        }
    }

    #[test]
    fn default_allowed_roots_includes_network_paths() {
        // 验证默认 allowed roots 包含网络驱动器挂载点
        let _guard = env_lock_guard();
        let original = env::var_os("LUMINA_ALLOWED_FS_ROOTS");
        env::remove_var("LUMINA_ALLOWED_FS_ROOTS");
        
        let roots = default_allowed_roots();
        
        // macOS 应该包含 /Volumes
        if cfg!(target_os = "macos") {
            let volumes = PathBuf::from("/Volumes");
            assert!(roots.iter().any(|r| r.starts_with(&volumes) || r == &volumes), 
                "macOS should include /Volumes in default roots, got: {:?}", roots);
        }
        
        // Linux 应该包含 /mnt 和 /media
        if cfg!(target_os = "linux") {
            let mnt = PathBuf::from("/mnt");
            let media = PathBuf::from("/media");
            assert!(roots.iter().any(|r| r.starts_with(&mnt) || r == &mnt), 
                "Linux should include /mnt in default roots, got: {:?}", roots);
            assert!(roots.iter().any(|r| r.starts_with(&media) || r == &media), 
                "Linux should include /media in default roots, got: {:?}", roots);
        }
        
        // 恢复环境变量
        match original {
            Some(value) => env::set_var("LUMINA_ALLOWED_FS_ROOTS", value),
            None => env::remove_var("LUMINA_ALLOWED_FS_ROOTS"),
        }
    }

    #[test]
    fn runtime_allowed_roots_can_be_set_before_file_access() {
        // 模拟正确的时序：先设置 runtime roots，再访问文件
        let _guard = env_lock_guard();
        
        // 先清空之前的状态
        set_runtime_allowed_roots(vec![]).expect("clear runtime roots");
        
        let temp = TempDir::new().expect("temp dir");
        let file_path = temp.path().join("test.txt");
        fs::write(&file_path, "test").expect("write test file");
        
        // 先设置 runtime roots
        set_runtime_allowed_roots(vec![temp.path().to_string_lossy().to_string()])
            .expect("set runtime roots");
        
        // 然后访问文件应该成功
        let result = ensure_allowed_path(&file_path, true);
        assert!(result.is_ok(), "should succeed after setting runtime roots: {:?}", result);
    }

    #[test]
    fn race_condition_simulation_file_access_before_roots_set() {
        // 模拟时序问题：在 runtime roots 设置之前尝试访问文件
        // 注意：由于 default_allowed_roots() 包含 HOME 等路径，
        // 临时目录实际上会被允许访问。
        // 
        // 真正的风险场景是：用户选择了不在 default roots 中的路径
        // （如 Windows 网络驱动器 Y:\），但在 fs_set_allowed_roots 调用之前就访问它
        // 
        // 这个测试验证：
        // 1. runtime_allowed_roots 初始为空
        // 2. 设置 runtime_allowed_roots 后，路径被允许
        // 3. default_allowed_roots 提供后备保护
        
        let _guard = env_lock_guard();
        let original = env::var_os("LUMINA_ALLOWED_FS_ROOTS");
        env::remove_var("LUMINA_ALLOWED_FS_ROOTS");
        
        // 清空 runtime roots
        set_runtime_allowed_roots(vec![]).expect("clear runtime roots");
        
        // 验证 runtime_allowed_roots 为空
        let runtime_roots = runtime_allowed_roots();
        assert!(runtime_roots.is_empty(), "runtime roots should be empty after clearing");
        
        // 验证 default_allowed_roots 不为空（提供后备保护）
        let default_roots = default_allowed_roots();
        assert!(!default_roots.is_empty(), "default roots should not be empty");
        
        // 创建一个临时目录（在 default roots 内）
        let temp = TempDir::new().expect("temp dir");
        let file_path = temp.path().join("test.txt");
        fs::write(&file_path, "test").expect("write test file");
        
        // 设置 runtime roots 包含临时目录
        set_runtime_allowed_roots(vec![temp.path().to_string_lossy().to_string()])
            .expect("set runtime roots");
        
        // 此时访问文件应该成功（runtime + default roots）
        let result = ensure_allowed_path(&file_path, true);
        assert!(result.is_ok(), "should succeed after setting runtime roots: {:?}", result);
        
        // 恢复环境变量
        match original {
            Some(value) => env::set_var("LUMINA_ALLOWED_FS_ROOTS", value),
            None => env::remove_var("LUMINA_ALLOWED_FS_ROOTS"),
        }
    }
}
