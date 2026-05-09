## ADDED Requirements

### Requirement: System tray icon
The system SHALL display an icon in the Windows system tray (notification area) when running.

#### Scenario: Tray icon on startup
- **WHEN** the application starts
- **THEN** a tray icon SHALL appear in the system notification area

#### Scenario: Application starts minimized
- **WHEN** the application is launched
- **THEN** it SHALL start with no visible windows (tray icon only), ready to capture text selections

### Requirement: Tray context menu
The system SHALL provide a right-click context menu on the tray icon with essential controls.

#### Scenario: Context menu items
- **WHEN** user right-clicks the tray icon
- **THEN** a context menu SHALL appear with these items:
  - "Settings" - opens the settings window
  - "Pause" / "Resume" - toggles text capture
  - "Quit" - exits the application

#### Scenario: Pause/Resume label reflects state
- **WHEN** text capture is active
- **THEN** the menu item SHALL show "Pause"
- **WHEN** text capture is paused
- **THEN** the menu item SHALL show "Resume"

### Requirement: Application lifecycle
The system SHALL manage its lifecycle through the tray icon.

#### Scenario: Closing windows does not quit
- **WHEN** user closes the settings window or floating toolbar
- **THEN** the application SHALL continue running in the system tray

#### Scenario: Quit from tray
- **WHEN** user clicks "Quit" in the tray context menu
- **THEN** the application SHALL clean up all resources (unhook input listeners, close windows) and exit

#### Scenario: Double-click tray icon
- **WHEN** user double-clicks the tray icon
- **THEN** the settings window SHALL open (or focus if already open)
