## ADDED Requirements

### Requirement: Chat panel expansion
The system SHALL expand the floating toolbar into a chat panel when the user clicks the "AI Chat" button.

#### Scenario: Opening chat panel
- **WHEN** user clicks the "AI Chat" button on the floating toolbar
- **THEN** the floating window SHALL expand to show a chat panel containing:
  - A context area displaying the selected text
  - A message list area (initially empty)
  - A text input field with a send button

### Requirement: Context-aware conversation
The system SHALL include the selected text as context in every AI request during the chat session.

#### Scenario: First message with context
- **WHEN** user types a message and clicks send (or presses Enter)
- **THEN** the system SHALL send a request to the AI API with:
  - A system message establishing the selected text as context
  - The user's message as the user content

#### Scenario: Follow-up messages maintain context
- **WHEN** user sends additional messages in the same chat session
- **THEN** the system SHALL include the full conversation history (system context + all previous messages) in the AI request

### Requirement: Streaming message display
The system SHALL display AI responses with streaming (token-by-token) output.

#### Scenario: Streaming response rendering
- **WHEN** AI begins responding to a chat message
- **THEN** the system SHALL display tokens as they arrive, with a typing indicator, and auto-scroll to the latest content

#### Scenario: Streaming error handling
- **WHEN** a streaming response is interrupted or fails
- **THEN** the system SHALL display an error message in the chat and allow the user to retry

### Requirement: Chat session lifecycle
Each chat session SHALL be tied to a single text selection and SHALL not persist after the floating window is closed.

#### Scenario: New selection resets chat
- **WHEN** user selects new text while a chat session is active
- **THEN** the previous chat session SHALL be discarded and a new session SHALL start with the new selection as context

#### Scenario: Closing chat discards session
- **WHEN** user closes the floating window (by clicking outside or dismissing)
- **THEN** the chat session and all messages SHALL be discarded (no persistence)

### Requirement: Chat input handling
The system SHALL provide standard text input behavior for the chat input field.

#### Scenario: Send message with Enter key
- **WHEN** user presses Enter in the chat input field
- **THEN** the message SHALL be sent (equivalent to clicking the send button)

#### Scenario: Newline with Shift+Enter
- **WHEN** user presses Shift+Enter in the chat input field
- **THEN** a newline SHALL be inserted in the input field without sending

#### Scenario: Empty message prevention
- **WHEN** user attempts to send an empty or whitespace-only message
- **THEN** the system SHALL NOT send the message
