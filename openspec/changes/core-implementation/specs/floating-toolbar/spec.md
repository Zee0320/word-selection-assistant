## ADDED Requirements

### Requirement: Floating toolbar display on text selection
The system SHALL display a small floating toolbar near the mouse cursor position immediately after text is successfully captured.

#### Scenario: Toolbar appears after text selection
- **WHEN** text is successfully captured from an external application
- **THEN** the system SHALL show a floating toolbar within 100ms, positioned 10px below and 10px to the right of the mouse cursor

#### Scenario: Toolbar positioned within screen bounds
- **WHEN** the calculated toolbar position would place it partially off-screen
- **THEN** the system SHALL adjust the position to keep the toolbar fully visible within the active monitor

### Requirement: Toolbar buttons based on feature toggles
The system SHALL display only the buttons for enabled features in the floating toolbar.

#### Scenario: Both features enabled
- **WHEN** both translation and AI chat features are enabled in settings
- **THEN** the toolbar SHALL display both the "Translate" and "AI Chat" buttons

#### Scenario: Only translation enabled
- **WHEN** translation is enabled but AI chat is disabled
- **THEN** the toolbar SHALL display only the "Translate" button

#### Scenario: Only AI chat enabled
- **WHEN** AI chat is enabled but translation is disabled
- **THEN** the toolbar SHALL display only the "AI Chat" button

#### Scenario: Both features disabled
- **WHEN** both features are disabled in settings
- **THEN** the toolbar SHALL NOT appear at all

### Requirement: Toolbar dismissal
The system SHALL dismiss the floating toolbar when the user interacts outside of it.

#### Scenario: Click outside dismisses toolbar
- **WHEN** user clicks anywhere outside the floating toolbar/panel
- **THEN** the toolbar and any expanded panels SHALL close

#### Scenario: New text selection replaces toolbar
- **WHEN** user selects new text while the toolbar is already visible
- **THEN** the existing toolbar SHALL close and a new one SHALL appear for the new selection

### Requirement: Floating window properties
The floating toolbar window SHALL be frameless, transparent-background, always-on-top, and excluded from the taskbar.

#### Scenario: Window characteristics
- **WHEN** the floating toolbar is displayed
- **THEN** the window SHALL have no title bar, no frame, transparent background, stay on top of all other windows, and not appear in the Windows taskbar or Alt+Tab switcher
