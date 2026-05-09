## ADDED Requirements

### Requirement: Expanded window can be pinned
The system SHALL provide a pin control when the floating window has an expanded panel open.

#### Scenario: Pin control appears for expanded panels
- **WHEN** the user expands the translation panel or AI chat panel
- **THEN** the floating toolbar SHALL show a pin control

#### Scenario: Pin control is hidden for collapsed toolbar
- **WHEN** no expanded panel is open
- **THEN** the floating toolbar SHALL hide the pin control

### Requirement: Pinned expanded window suppresses automatic hiding
The system SHALL keep a pinned expanded floating window visible when focus moves outside the window.

#### Scenario: External click while pinned
- **WHEN** the expanded floating window is pinned and the user clicks another application or window
- **THEN** the floating window SHALL remain visible and expanded

#### Scenario: External click after unpinning
- **WHEN** the expanded floating window is unpinned and the user clicks another application or window
- **THEN** the floating window SHALL use the existing automatic hide behavior

### Requirement: Pinned window updates for new selections
The system SHALL update pinned expanded window content when a new text selection is captured.

#### Scenario: Pinned translation panel receives new selection
- **WHEN** the translation panel is pinned and a new text selection is captured
- **THEN** the translation panel SHALL remain expanded and refresh translation content for the new selected text

#### Scenario: Pinned AI chat panel receives new selection
- **WHEN** the AI chat panel is pinned and a new text selection is captured
- **THEN** the AI chat panel SHALL remain expanded, update the selected-text context, and clear prior chat messages

### Requirement: Pin state is session scoped
The system SHALL treat pin state as transient floating-window state rather than persisted user settings.

#### Scenario: Floating window is hidden or collapsed
- **WHEN** the floating window is hidden or collapsed back to toolbar-only mode
- **THEN** the system SHALL clear the pinned state
