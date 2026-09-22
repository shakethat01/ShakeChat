use std::{fs, path::Path};

fn ensure_windows_icon() {
    let dir = Path::new("icons");
    let path = dir.join("icon.ico");
    if path.exists() {
        return;
    }

    fs::create_dir_all(dir).expect("failed to create Tauri icons directory");

    // Minimal valid 16x16 / 32-bit Windows ICO.  Keeping the fallback generated
    // by build.rs lets clean CI/Windows clones build before branded icon assets
    // are added to the repository.
    const WIDTH: usize = 16;
    const HEIGHT: usize = 16;
    const XOR_BYTES: usize = WIDTH * HEIGHT * 4;
    const AND_ROW_BYTES: usize = 4; // 16 mask bits padded to a DWORD.
    const AND_BYTES: usize = AND_ROW_BYTES * HEIGHT;
    const IMAGE_BYTES: usize = 40 + XOR_BYTES + AND_BYTES;

    let mut ico = Vec::with_capacity(22 + IMAGE_BYTES);

    // ICONDIR
    ico.extend_from_slice(&0u16.to_le_bytes()); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // image type: icon
    ico.extend_from_slice(&1u16.to_le_bytes()); // image count

    // ICONDIRENTRY
    ico.push(WIDTH as u8);
    ico.push(HEIGHT as u8);
    ico.push(0); // palette size
    ico.push(0); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // color planes
    ico.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
    ico.extend_from_slice(&(IMAGE_BYTES as u32).to_le_bytes());
    ico.extend_from_slice(&22u32.to_le_bytes()); // image offset

    // BITMAPINFOHEADER.  ICO stores XOR + AND masks, hence doubled height.
    ico.extend_from_slice(&40u32.to_le_bytes());
    ico.extend_from_slice(&(WIDTH as i32).to_le_bytes());
    ico.extend_from_slice(&((HEIGHT * 2) as i32).to_le_bytes());
    ico.extend_from_slice(&1u16.to_le_bytes());
    ico.extend_from_slice(&32u16.to_le_bytes());
    ico.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    ico.extend_from_slice(&(XOR_BYTES as u32).to_le_bytes());
    ico.extend_from_slice(&0i32.to_le_bytes()); // x pixels/meter
    ico.extend_from_slice(&0i32.to_le_bytes()); // y pixels/meter
    ico.extend_from_slice(&0u32.to_le_bytes()); // colors used
    ico.extend_from_slice(&0u32.to_le_bytes()); // important colors

    // BGRA pixels: dark ShakeChat tile with a warm ember center.
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            let edge = x < 2 || y < 2 || x >= WIDTH - 2 || y >= HEIGHT - 2;
            let (b, g, r) = if edge { (24u8, 24u8, 24u8) } else { (28u8, 126u8, 244u8) };
            ico.extend_from_slice(&[b, g, r, 255]);
        }
    }

    // Fully opaque AND mask.
    ico.resize(22 + IMAGE_BYTES, 0);
    fs::write(&path, ico).expect("failed to write fallback Tauri icon");
    println!("cargo:warning=generated fallback icons/icon.ico for Windows build");
}

fn main() {
    ensure_windows_icon();
    tauri_build::build()
}
