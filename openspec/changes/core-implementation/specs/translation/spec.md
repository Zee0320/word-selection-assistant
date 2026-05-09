## ADDED Requirements

### Requirement: Text classification
The system SHALL classify captured text as either "word/phrase" or "sentence" to determine the translation mode.

#### Scenario: Single word classification
- **WHEN** captured text contains exactly 1 word (whitespace-split)
- **THEN** the system SHALL classify it as "word/phrase" and use dictionary mode

#### Scenario: Short phrase classification
- **WHEN** captured text contains 2-3 words (whitespace-split)
- **THEN** the system SHALL classify it as "word/phrase" and use dictionary mode

#### Scenario: Sentence classification
- **WHEN** captured text contains more than 3 words (whitespace-split)
- **THEN** the system SHALL classify it as "sentence" and use AI translation mode

#### Scenario: Configurable threshold
- **WHEN** user changes the phrase threshold in settings
- **THEN** the system SHALL use the new threshold for classification

### Requirement: Dictionary lookup for words and phrases
The system SHALL query both Free Dictionary API and ECDICT offline database for English words/phrases, displaying structured results.

#### Scenario: English word lookup with both sources available
- **WHEN** user selects an English word and clicks "Translate"
- **THEN** the system SHALL display:
  - Phonetic transcription (from Free Dictionary API)
  - Part of speech and English definitions (from Free Dictionary API)
  - Chinese definition (from ECDICT)
  - Example sentences (from Free Dictionary API, if available)

#### Scenario: English word lookup with API unavailable
- **WHEN** Free Dictionary API is unreachable
- **THEN** the system SHALL fall back to ECDICT-only results, displaying Chinese definition and any available phonetic/POS data from ECDICT

#### Scenario: Chinese word/phrase lookup
- **WHEN** user selects Chinese text classified as word/phrase
- **THEN** the system SHALL use AI translation to provide English translation and explanation

#### Scenario: Word not found
- **WHEN** the selected word is not found in either dictionary source
- **THEN** the system SHALL fall back to AI translation mode for that word

### Requirement: AI-powered sentence translation
The system SHALL translate sentences using the configured OpenAI-compatible API with streaming output.

#### Scenario: English to Chinese translation
- **WHEN** user selects an English sentence and clicks "Translate"
- **THEN** the system SHALL send the text to the AI API with a translation prompt and display the Chinese translation with streaming (character-by-character) output

#### Scenario: Chinese to English translation
- **WHEN** user selects a Chinese sentence and clicks "Translate"
- **THEN** the system SHALL send the text to the AI API with a translation prompt and display the English translation with streaming output

#### Scenario: Language auto-detection
- **WHEN** user selects text for translation
- **THEN** the system SHALL automatically detect whether the text is Chinese or English and translate to the other language

### Requirement: Translation panel UI
The system SHALL display translation results in an expandable panel below the floating toolbar.

#### Scenario: Dictionary mode panel
- **WHEN** translation results are from dictionary lookup
- **THEN** the panel SHALL display structured content with clear sections for phonetics, definitions, and examples

#### Scenario: AI translation mode panel
- **WHEN** translation is performed by AI
- **THEN** the panel SHALL display the streaming translation result with a loading indicator during generation
