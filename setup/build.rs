fn main() {
  println!("cargo:rerun-if-env-changed=YD_PAYLOAD");
  tauri_build::build()
}
