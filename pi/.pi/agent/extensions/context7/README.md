# Context7 Extension for Pi

Provides up-to-date library documentation via the Context7 API.

## Tools

### `context7_search`

Search for libraries by name and query. Returns library IDs, descriptions, trust scores.

**Parameters:**

- `libraryName` (string): Library name to search for (e.g., 'react', 'next.js')
- `query` (string): Your question or task (used for relevance ranking)

### `context7_docs`

Fetch documentation snippets for a specific library using its Context7 library ID.

**Parameters:**

- `libraryId` (string): Context7-compatible library ID (e.g., '/facebook/react', '/vercel/next.js')
- `query` (string): Your question or task (used for relevance ranking)
- `format` (string, optional): Response format: 'json' (default) or 'text'

## Setup

1. Get a free API key at [context7.com/dashboard](https://context7.com/dashboard)
2. Set the environment variable:
   ```bash
   export CONTEXT7_API_KEY='your-key'
   ```
3. The extension will be automatically loaded by Pi.

## Usage

Ask Pi to fetch documentation for a library:

```
How do I use React hooks? Use context7 to get up-to-date docs.
```

Or use the `/context7` command:

```
/context7 react How do I use useEffect?
```

## API Reference

- [Context7 API Guide](https://context7.com/docs/api-guide)
- [Context7 MCP Documentation](https://context7.mintlify.app)
