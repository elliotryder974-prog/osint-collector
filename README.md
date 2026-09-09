# Public OSINT Search

A self-hosted public-source OSINT research tool.

The application accepts a phone number or username and searches publicly accessible web pages for potentially relevant references. A locally running AI model then analyses the collected evidence and produces a structured report.

## Features

* Phone-number public web searches
* Username searches
* Platform-specific username searches
* Public webpage retrieval
* Evidence extraction
* Duplicate URL removal
* Local AI analysis
* Confidence scoring
* Possible-match identification
* Contradiction detection
* No OpenAI API key
* No cloud AI dependency
* Node.js backend
* Simple browser frontend

## Architecture

```text
                         ┌──────────────────┐
                         │    index.html    │
                         └────────┬─────────┘
                                  │
                             POST /api/search
                                  │
                         ┌────────▼─────────┐
                         │    server.js     │
                         └────────┬─────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │                             │
             Public web                     Local AI
             discovery                      analysis
                   │                             │
                   ▼                             ▼
             Search engine                    Ollama
                   │                             │
                   └──────────────┬──────────────┘
                                  │
                                  ▼
                            JSON OSINT report
                                  │
                                  ▼
                              Browser UI
```

## Requirements

* Node.js 20 or newer
* Ollama
* A local language model supported by Ollama
* Internet access for public web discovery

## Installation

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd public-osint-search
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Install Ollama

Install Ollama for your operating system from the official Ollama website.

After installation, verify that it is running:

```bash
ollama --version
```

### 4. Download a local model

For a relatively lightweight starting point:

```bash
ollama pull llama3.2:3b
```

Then test it:

```bash
ollama run llama3.2:3b
```

Type a question to confirm that the model works, then exit.

If your computer has more RAM/GPU resources, you can later switch to a larger model by changing:

```env
OLLAMA_MODEL=your-model-name
```

in `.env`.

## Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The default configuration is:

```env
PORT=3000
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
MAX_SEARCH_RESULTS=8
MAX_PAGE_CHARS=12000
REQUEST_TIMEOUT=10000
```

No AI API key is required.

## Run

Start the application:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

For development:

```bash
npm run dev
```

## Health check

Once the server is running, visit:

```text
http://localhost:3000/api/health
```

A healthy setup should report something similar to:

```json
{
  "status": "ok",
  "ollama": {
    "url": "http://127.0.0.1:11434",
    "model": "llama3.2:3b",
    "available": true
  }
}
```

## How a search works

When a user submits an identifier:

### 1. Normalisation

The server cleans the supplied phone number or username.

### 2. Query generation

The server generates several public-search queries.

For example:

```text
"+441234567890"
"441234567890"
"example_username"
"example_username" "github"
```

### 3. Public search

The application obtains publicly accessible search results.

### 4. Page retrieval

The application retrieves selected public HTML pages and extracts their visible text.

### 5. Evidence analysis

The collected evidence is passed to the local Ollama model.

The model is instructed to:

* distinguish evidence from inference
* avoid unsupported identity claims
* identify possible matches
* identify contradictory evidence
* assign confidence
* preserve source URLs

### 6. JSON response

The backend returns structured results to `index.html`.

## API

### POST `/api/search`

Example:

```json
{
  "phone": "+441234567890",
  "username": "",
  "platform": "github"
}
```

or:

```json
{
  "phone": "",
  "username": "example_username",
  "platform": "github"
}
```

Response:

```json
{
  "query": {
    "phone": null,
    "username": "example_username",
    "platform": "github"
  },
  "results": [
    {
      "type": "public_profile",
      "platform": "GitHub",
      "value": "example_username",
      "source": "https://example.com/",
      "evidence": "Public page contains the supplied username.",
      "status": "possible",
      "confidence": 0.72
    }
  ],
  "analysis": {
    "summary": "Public references were found...",
    "possible_matches": [],
    "contradictions": []
  }
}
```

## Important limitations

This project does **not** search the entire internet.

Search engines index only a portion of the web, and search results can be incomplete or outdated.

A lack of results does not prove that an account, person, or association does not exist.

Similarly, a matching username or phone number does not automatically prove that two pages belong to the same person.

The AI's confidence score is an analytical estimate, not proof of identity.

## Responsible use

This project is intended for legitimate public-source research.

Only use information that is publicly accessible.

Do not use the application to:

* access private accounts
* bypass authentication
* obtain passwords
* obtain authentication tokens
* access private messages
* circumvent technical access controls
* exploit vulnerabilities
* collect non-public personal information

Respect the terms of service, access restrictions, and applicable laws of the websites and search providers you use.

## Security

The backend includes basic protections against accidentally fetching private/local network addresses.

It also treats retrieved webpages as untrusted data.

Do not expose the Node server directly to the public internet without adding proper authentication, rate limiting, logging, and additional security controls.


Planned improvements include:

* Better source discovery
* Multiple search providers
* Source-specific collectors
* Social-platform public profile discovery
* Evidence graph
* Stronger entity correlation
* Result deduplication across sources
* Timeline construction
* AI-generated investigation summaries
* Exportable reports
* Search history
* Rate limiting
* Background jobs
* Caching
* Optional database
* Improved frontend result visualisation

The goal is to keep the AI local while making the collection and evidence-analysis pipeline increasingly sophisticated.
