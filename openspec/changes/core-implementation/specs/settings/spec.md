## ADDED Requirements

### Requirement: Settings window
The system SHALL provide a dedicated settings window accessible from the system tray menu.

#### Scenario: Opening settings
- **WHEN** user clicks "Settings" in the system tray context menu
- **THEN** a settings window SHALL open (or focus if already open) showing all configurable options

#### Scenario: Closing settings
- **WHEN** user closes the settings window
- **THEN** changes SHALL be saved automatically

### Requirement: API configuration
The system SHALL allow users to configure the OpenAI-compatible API connection.

#### Scenario: Setting API endpoint
- **WHEN** user enters an API base URL in the settings
- **THEN** the system SHALL use this URL for all AI requests (translation and chat)

#### Scenario: Setting API key
- **WHEN** user enters an API key in the settings
- **THEN** the system SHALL store the key securely and include it as Bearer token in all AI requests

#### Scenario: Setting model name
- **WHEN** user enters a model name in the settings
- **THEN** the system SHALL use this model in all AI API requests

#### Scenario: Missing API configuration
- **WHEN** AI features (sentence translation or AI chat) are triggered but API configuration is incomplete
- **THEN** the system SHALL display a message prompting the user to configure the API in settings

### Requirement: Feature toggles
The system SHALL allow users to independently enable or disable the translation and AI chat features.

#### Scenario: Disabling translation
- **WHEN** user disables the translation feature in settings
- **THEN** the "Translate" button SHALL NOT appear in the floating toolbar

#### Scenario: Disabling AI chat
- **WHEN** user disables the AI chat feature in settings
- **THEN** the "AI Chat" button SHALL NOT appear in the floating toolbar

#### Scenario: Feature toggle takes effect immediately
- **WHEN** user toggles a feature on or off in settings
- **THEN** the change SHALL take effect immediately for the next text selection (no restart required)

### Requirement: Phrase threshold configuration
The system SHALL allow users to configure the word count threshold that separates "word/phrase" mode from "sentence" mode.

#### Scenario: Changing threshold
- **WHEN** user sets the phrase threshold to N in settings
- **THEN** selected text with N or fewer words SHALL be treated as word/phrase, and text with more than N words SHALL be treated as sentence

### Requirement: Settings persistence
The system SHALL persist all settings across application restarts using electron-store.

#### Scenario: Settings survive restart
- **WHEN** user configures settings and restarts the application
- **THEN** all previously saved settings SHALL be restored

#### Scenario: Default values
- **WHEN** the application is launched for the first time
- **THEN** the system SHALL use these defaults:
  - API base URL: empty
  - API key: empty
  - Model name: empty
  - Translation enabled: true
  - AI chat enabled: true
  - Phrase threshold: 3
