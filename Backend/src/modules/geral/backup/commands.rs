use tauri::State;
use crate::DbState;

#[tauri::command]
pub fn get_backup() -> Result<Vec<u8>, String> {
    std::fs::read("../Saves/data.db").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_backup(data: Vec<u8>) -> Result<(), String> {
    std::fs::write("../Saves/data.db", data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_compressed_backup() -> Result<Vec<u8>, String> {
    use std::io::Write;
    let raw_data = std::fs::read("../Saves/data.db").map_err(|e| e.to_string())?;
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(&raw_data).map_err(|e| e.to_string())?;
    let compressed_data = encoder.finish().map_err(|e| e.to_string())?;
    Ok(compressed_data)
}

#[tauri::command]
pub fn restore_compressed_backup(data: Vec<u8>) -> Result<(), String> {
    use std::io::Read;
    let mut decoder = flate2::read::GzDecoder::new(&data[..]);
    let mut decompressed_data = Vec::new();
    decoder.read_to_end(&mut decompressed_data).map_err(|e| e.to_string())?;
    std::fs::write("../Saves/data.db", decompressed_data).map_err(|e| e.to_string())?;
    Ok(())
}
