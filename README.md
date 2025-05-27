# ACM Manager - Chrome Extension

ACM Manager (AI Conversation Memory Manager) is a Chrome extension that captures and stores conversations from various chatbot platforms for future reference and reuse.

## Features

- **Automatic Capture**: Automatically captures conversations from supported chatbot platforms.
- **Local Storage**: All data is stored locally using IndexedDB - your conversations never leave your browser.
- **Organized Management**: View, search, filter, and manage your conversation history.
- **Export Capabilities**: Export your conversations for backup or sharing.
- **Privacy Focused**: No server-side components or data collection.

## Supported Chatbot Platforms

- OpenAI ChatGPT
- Anthropic Claude
- Google Bard
- Poe
- Perplexity AI

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle switch in the top-right corner)
4. Click "Load unpacked" and select the `acm-manager` directory
5. The extension should now be installed and active

### Chrome Web Store (Coming Soon)

The extension will be available in the Chrome Web Store after initial testing.

## Usage

### Capturing Conversations

1. Visit any supported chatbot platform
2. The extension will automatically capture your conversations
3. A small indicator appears when a conversation is being captured

### Viewing and Managing Conversations

1. Click the ACM Manager icon in your browser toolbar
2. Click "View ACMs" to open the management page
3. Browse, search, filter, and manage your conversation history

### Settings

Access settings by clicking the ACM Manager icon and then the "Options" link:

- Enable/disable specific chatbot platforms
- Configure automatic capture settings
- Set storage limits and cleanup policies

## Privacy and Data Storage

- All data is stored locally in your browser using IndexedDB
- No data is transmitted to any external servers
- Your conversations remain private and under your control

## Development

### Project Structure

- `/js`: JavaScript files for the extension functionality
- `/css`: CSS files for styling
- `/pages`: HTML pages for the UI
- `/images`: Icons and images

### Building from Source

No build step is required. The extension can be loaded directly as an unpacked extension in Chrome.

## License

MIT

## Acknowledgments

This project is based on the ACM Manager with NLP-Cloud-Servers Integration architecture. 