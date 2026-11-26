use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use tauri::Manager;

const SCHEMA_VERSION: u32 = 1;
const WORKSPACE_FILE: &str = "workspace.json";
const TEMP_FILE: &str = "workspace.json.tmp";
const BACKUP_FILE: &str = "workspace.json.bak";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct Panel {
    id: u64,
    title: String,
    content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    size: Option<PanelSize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct PanelSize {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDocument {
    schema_version: u32,
    panels: Vec<Panel>,
    active_panel_id: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceLoad {
    workspace: Option<WorkspaceDocument>,
    path: String,
}

fn validate_workspace(workspace: &WorkspaceDocument) -> Result<(), String> {
    if workspace.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported workspace schema version {} (supported: {}).",
            workspace.schema_version, SCHEMA_VERSION
        ));
    }
    if workspace.panels.iter().any(|panel| panel.title.len() > 4096) {
        return Err("A panel title is longer than the supported limit.".into());
    }
    if workspace.panels.iter().any(|panel| panel.id == 0) {
        return Err("Panel IDs must be positive integers.".into());
    }
    if workspace.panels.iter().any(|panel| {
        panel.size.as_ref().is_some_and(|size| size.width == 0 || size.height == 0)
    }) {
        return Err("Panel sizes must be positive integers.".into());
    }
    let mut ids = workspace.panels.iter().map(|panel| panel.id).collect::<Vec<_>>();
    ids.sort_unstable();
    if ids.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err("Panel IDs must be unique.".into());
    }
    if !workspace.panels.is_empty()
        && !workspace.panels.iter().any(|panel| panel.id == workspace.active_panel_id)
    {
        return Err("The active panel ID must refer to an existing panel.".into());
    }
    Ok(())
}

fn workspace_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| {
        format!("Could not create DVA's app-data directory {}: {error}", directory.display())
    })?;
    Ok(directory.join(WORKSPACE_FILE))
}

fn read_workspace(path: &Path) -> Result<WorkspaceDocument, String> {
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Could not read workspace JSON at {}: {error}", path.display()))?;
    let workspace: WorkspaceDocument = serde_json::from_str(&raw)
        .map_err(|error| format!("Workspace JSON at {} is invalid: {error}", path.display()))?;
    validate_workspace(&workspace)
        .map_err(|error| format!("Workspace JSON at {} failed validation: {error}", path.display()))?;
    Ok(workspace)
}

fn workspace_path_exists(path: &Path) -> Result<bool, String> {
    path.try_exists()
        .map_err(|error| format!("Could not inspect workspace path {}: {error}", path.display()))
}

fn load_saved_workspace(path: &Path) -> Result<Option<WorkspaceDocument>, String> {
    if workspace_path_exists(path)? {
        return read_workspace(path).map(Some);
    }

    for filename in [BACKUP_FILE, TEMP_FILE] {
        let recovery_path = path.with_file_name(filename);
        if workspace_path_exists(&recovery_path)? {
            return Err(format!(
                "Workspace JSON is missing. DVA paused startup because it found a recovery file at {}.",
                recovery_path.display()
            ));
        }
    }
    Ok(None)
}

#[tauri::command]
fn load_workspace(app: tauri::AppHandle) -> Result<WorkspaceLoad, String> {
    let path = workspace_file(&app)?;
    Ok(WorkspaceLoad {
        workspace: load_saved_workspace(&path)?,
        path: path.display().to_string(),
    })
}

fn write_workspace(path: &Path, workspace: &WorkspaceDocument) -> Result<(), String> {
    validate_workspace(workspace)?;
    let temporary = path.with_file_name(TEMP_FILE);
    let backup = path.with_file_name(BACKUP_FILE);
    let serialized = serde_json::to_vec_pretty(workspace).map_err(|error| error.to_string())?;

    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temporary)
            .map_err(|error| format!("Could not create temporary workspace file: {error}"))?;
        file.write_all(&serialized)
            .map_err(|error| format!("Could not write temporary workspace file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Could not flush temporary workspace file: {error}"))?;
        drop(file);

        let verified = read_workspace(&temporary)?;
        if &verified != workspace {
            return Err("Workspace verification did not match the data written.".into());
        }

        if workspace_path_exists(path)? {
            fs::copy(path, &backup)
                .map_err(|error| format!("Could not preserve the previous workspace backup: {error}"))?;
        }

        // Replace the existing file in one rename, leaving it in place if the rename fails.
        fs::rename(&temporary, path)
            .map_err(|error| format!("Could not install verified workspace JSON: {error}"))?;

        let installed = read_workspace(path)?;
        if &installed != workspace {
            return Err(format!("Workspace verification failed after replacement at {}.", path.display()));
        }
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    write_result
}

#[tauri::command]
fn save_workspace(app: tauri::AppHandle, workspace: WorkspaceDocument) -> Result<String, String> {
    let path = workspace_file(&app)?;
    write_workspace(&path, &workspace)?;
    Ok(path.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_workspace, save_workspace])
        .run(tauri::generate_context!())
        .expect("error while running DVA");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct WorkspaceFixture(PathBuf);

    impl WorkspaceFixture {
        fn new() -> Self {
            static NEXT_ID: AtomicU64 = AtomicU64::new(0);
            let directory = std::env::temp_dir().join(format!(
                "dva-workspace-test-{}-{}",
                std::process::id(),
                NEXT_ID.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&directory).unwrap();
            Self(directory)
        }

        fn file(&self, filename: &str) -> PathBuf {
            self.0.join(filename)
        }
    }

    impl Drop for WorkspaceFixture {
        fn drop(&mut self) {
            for filename in [WORKSPACE_FILE, BACKUP_FILE, TEMP_FILE] {
                let path = self.file(filename);
                let _ = fs::remove_file(&path);
                let _ = fs::remove_dir(&path);
            }
            let _ = fs::remove_dir(&self.0);
        }
    }

    fn example() -> WorkspaceDocument {
        WorkspaceDocument {
            schema_version: 1,
            panels: vec![
                Panel { id: 1, title: "First".into(), content: "Keep this writing.".into(), size: None },
                Panel { id: 2, title: "Second".into(), content: "More writing.".into(), size: None },
            ],
            active_panel_id: 2,
        }
    }

    #[test]
    fn workspace_json_round_trips_without_losing_panel_content() {
        let original = example();
        let json = serde_json::to_string(&original).unwrap();
        let restored: WorkspaceDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(restored, original);
        assert!(json.contains("schemaVersion"));
        assert!(json.contains("activePanelId"));
        assert!(!json.contains("size"));
    }

    #[test]
    fn saves_and_reloads_panel_order_and_sizes() {
        let directory = WorkspaceFixture::new();
        let path = directory.file(WORKSPACE_FILE);
        let mut workspace = example();
        workspace.panels.swap(0, 1);
        workspace.panels[0].size = Some(PanelSize { width: 540, height: 320 });
        write_workspace(&path, &workspace).unwrap();
        assert_eq!(load_saved_workspace(&path).unwrap(), Some(workspace));
    }

    #[test]
    fn missing_workspace_pauses_startup_when_recovery_files_exist() {
        let fixture = WorkspaceFixture::new();
        let path = fixture.file(WORKSPACE_FILE);
        let recovery_data = serde_json::to_vec(&example()).unwrap();

        assert!(load_saved_workspace(&path).unwrap().is_none());
        for filename in [BACKUP_FILE, TEMP_FILE] {
            let recovery = fixture.file(filename);
            fs::write(&recovery, &recovery_data).unwrap();
            let error = load_saved_workspace(&path).unwrap_err();
            assert!(error.contains("paused startup"));
            assert!(error.contains(filename));
            assert_eq!(fs::read(&recovery).unwrap(), recovery_data);
            assert!(!path.exists());
            fs::remove_file(recovery).unwrap();
        }
    }

    #[test]
    fn save_replaces_the_workspace_and_keeps_the_previous_version() {
        let fixture = WorkspaceFixture::new();
        let path = fixture.file(WORKSPACE_FILE);
        let original = example();
        let mut updated = original.clone();
        updated.panels[0].content = "New draft".into();

        write_workspace(&path, &original).unwrap();
        write_workspace(&path, &updated).unwrap();
        assert_eq!(load_saved_workspace(&path).unwrap(), Some(updated));
        assert_eq!(read_workspace(&fixture.file(BACKUP_FILE)).unwrap(), original);
        assert!(!fixture.file(TEMP_FILE).exists());
    }

    #[test]
    fn backup_failure_leaves_the_previous_workspace_readable() {
        let fixture = WorkspaceFixture::new();
        let path = fixture.file(WORKSPACE_FILE);
        let original = example();
        let mut updated = original.clone();
        updated.panels[0].content = "Unsaved draft".into();

        write_workspace(&path, &original).unwrap();
        fs::create_dir(fixture.file(BACKUP_FILE)).unwrap();
        let error = write_workspace(&path, &updated).unwrap_err();
        assert!(error.contains("Could not preserve the previous workspace backup"));
        assert_eq!(load_saved_workspace(&path).unwrap(), Some(original));
        assert!(!fixture.file(TEMP_FILE).exists());
    }

    #[test]
    fn rejects_unsupported_schema_versions() {
        let mut workspace = example();
        workspace.schema_version = 99;
        assert!(validate_workspace(&workspace).unwrap_err().contains("Unsupported"));
    }

    #[test]
    fn rejects_duplicate_panel_ids() {
        let mut workspace = example();
        workspace.panels[1].id = workspace.panels[0].id;
        assert!(validate_workspace(&workspace).unwrap_err().contains("unique"));
    }

    #[test]
    fn rejects_an_active_panel_that_does_not_exist() {
        let mut workspace = example();
        workspace.active_panel_id = 99;
        assert!(validate_workspace(&workspace).unwrap_err().contains("active panel"));
    }

    #[test]
    fn allows_an_empty_workspace_after_the_last_panel_is_closed() {
        let mut workspace = example();
        workspace.panels.clear();
        workspace.active_panel_id = 0;
        assert!(validate_workspace(&workspace).is_ok());
    }
}
