# AI-Powered People Search Tool

A Node.js application that processes CSV files containing people data and uses AI agents to filter and match individuals based on their titles and descriptions.

## Prerequisites

- Node.js
- npm (Node Package Manager)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Required Dependencies

- csv-parse
- csv-writer
- dotenv

## Usage

```bash
node index.js [inputFile] [searchDescription] [outputFile]
```

### Parameters

- `inputFile`: Path to the input CSV file (default: 'input.csv')
- `searchDescription`: Description of the person you're looking for (default: provided example)
- `outputFile`: Path for the output CSV file (default: 'output.csv')

### Example

```bash
node index.js input.csv "Looking for a person responsible for conversion optimization" output.csv
```

## Input CSV Format

The input CSV should contain people data with at least the following columns:
- name
- title

## Output

The program generates a CSV file with the following features:
- Priority columns (name, title, match_rating) appear first
- All other columns from the input are preserved
- Column headers are automatically formatted (e.g., "firstName" becomes "First Name")

## Environment Variables

Create a `.env` file in the project root with the following variables:

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `AI_API_BASE`: OpenAI API base URL (optional, defaults to 'https://api.openai.com/v1')
- `AI_MODEL`: OpenAI model to use (optional, defaults to 'gpt-4o-mini')

Example `.env` file:
```env
OPENAI_API_KEY=your-api-key-here
AI_API_BASE=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```