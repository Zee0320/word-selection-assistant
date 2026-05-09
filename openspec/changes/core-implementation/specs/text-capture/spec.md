## ADDED Requirements

### Requirement: Global mouseup detection
The system SHALL monitor all mouse button release (mouseup) events across all applications using a system-level input hook (uiohook-napi).

#### Scenario: Mouseup detected in external application
- **WHEN** user releases the mouse button after dragging to select text in any application
- **THEN** the system SHALL detect the mouseup event and initiate the text capture sequence

#### Scenario: Mouseup in own window is ignored
- **WHEN** user releases the mouse button inside the application's own floating window or settings window
- **THEN** the system SHALL NOT initiate the text capture sequence

### Requirement: Clipboard-based text extraction
The system SHALL extract selected text from external applications by simulating Ctrl+C after backing up the current clipboard contents, then restoring the clipboard afterwards.

#### Scenario: Successful text extraction
- **WHEN** a mouseup event is detected in an external application
- **THEN** the system SHALL:
  1. Wait 50ms for the selection to stabilize
  2. Save the current clipboard content
  3. Simulate Ctrl+C keystroke
  4. Wait 50ms for the clipboard to update
  5. Read the new clipboard content as the selected text
  6. Restore the original clipboard content

#### Scenario: Empty selection filtering
- **WHEN** a mouseup event is detected but no text is selected (clipboard content unchanged after Ctrl+C)
- **THEN** the system SHALL NOT trigger the floating toolbar

#### Scenario: Click without drag
- **WHEN** user clicks without dragging (mousedown and mouseup at the same position or within 5px threshold)
- **THEN** the system SHALL NOT initiate the text capture sequence

### Requirement: Pause and resume capture
The system SHALL support pausing and resuming the global text capture via the system tray menu.

#### Scenario: User pauses capture
- **WHEN** user clicks "Pause" in the system tray menu
- **THEN** the system SHALL stop monitoring mouseup events until resumed

#### Scenario: User resumes capture
- **WHEN** user clicks "Resume" in the system tray menu
- **THEN** the system SHALL resume monitoring mouseup events
