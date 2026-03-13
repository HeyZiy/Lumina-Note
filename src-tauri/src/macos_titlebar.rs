use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
use objc2_app_kit::{NSView, NSWindow, NSWindowButton};

pub fn centered_button_origin_y(container_height: f64, button_height: f64) -> f64 {
    (container_height - button_height) / 2.0
}

#[cfg(target_os = "macos")]
pub fn center_traffic_lights<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let runner = window.clone();
    let target_window = window.clone();
    runner.run_on_main_thread(move || unsafe {
        if let Err(err) = center_traffic_lights_inner(&target_window) {
            eprintln!("[macOS] Failed to center traffic lights: {err}");
        }
    })
}

#[cfg(not(target_os = "macos"))]
pub fn center_traffic_lights<R: Runtime>(_window: &WebviewWindow<R>) -> tauri::Result<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
unsafe fn center_traffic_lights_inner<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), &'static str> {
    let ns_window = window
        .ns_window()
        .map_err(|_| "native NSWindow handle unavailable")?;
    let ns_window: &NSWindow = &*ns_window.cast();

    let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) else {
        return Err("close button not found");
    };
    let Some(minimize) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return Err("minimize button not found");
    };

    center_button_vertically(&close)?;
    center_button_vertically(&minimize)?;

    if let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) {
        center_button_vertically(&zoom)?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
unsafe fn center_button_vertically(button: &objc2_app_kit::NSButton) -> Result<(), &'static str> {
    let Some(parent_view) = button.superview() else {
        return Err("button superview not found");
    };

    let parent_height = NSView::frame(&parent_view).size.height;
    let mut frame = NSView::frame(button);
    frame.origin.y = centered_button_origin_y(parent_height, frame.size.height);
    button.setFrameOrigin(frame.origin);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::centered_button_origin_y;

    #[test]
    fn centers_button_within_overlay_height() {
        assert_eq!(centered_button_origin_y(44.0, 28.0), 8.0);
    }
}
