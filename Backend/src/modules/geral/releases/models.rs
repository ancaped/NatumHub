use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelManifestInfo {
    pub channel: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleasesStatusResponse {
    pub manifests: Vec<ChannelManifestInfo>,
    pub github_configured: bool,
    pub github_repo: String,
    pub github_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubReleaseConfig {
    pub github_configured: bool,
    pub github_repo: String,
    pub github_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGithubReleaseConfigRequest {
    pub github_token: String,
    pub github_repo: Option<String>,
    pub github_branch: Option<String>,
    pub supervisor_password: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromoteReleaseRequest {
    pub channel: String,
    pub version_tag: String,
    pub release_notes: Option<String>,
    pub supervisor_password: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromoteReleaseResponse {
    pub ok: bool,
    pub message: String,
    pub channel: String,
    pub version_tag: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub channel: String,
    pub identifier: String,
    pub product_name: String,
    pub version: String,
}
