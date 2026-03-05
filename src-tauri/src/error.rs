use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("File already exists: {0}")]
    FileExists(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Trash error: {0}")]
    Trash(#[from] trash::Error),

    #[error("WebDAV error: {0}")]
    WebDAV(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Update error: {0}")]
    Update(String),

    #[error("Update network error: {0}")]
    UpdateNetwork(String),

    #[error("Update integrity error: {0}")]
    UpdateIntegrity(String),

    #[error("Update install error: {0}")]
    UpdateInstall(String),

    #[error("Update state error: {0}")]
    UpdateState(String),
}

impl From<reqwest::Error> for AppError {
    fn from(value: reqwest::Error) -> Self {
        AppError::Network(value.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
