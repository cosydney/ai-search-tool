# CSV People Filter MCP Server

An MCP server that enables filtering people from CSV files based on search descriptions using AI-powered matching.

## Overview

This MCP server follows the [Anthropic Model Context Protocol (MCP)](https://docs.anthropic.com/en/docs/agents-and-tools/mcp) and enables users to:

1. Upload CSV files containing people data
2. Filter people from the CSV files based on search descriptions
3. Get filtered results as a new CSV file

The server uses AI to analyze job titles and descriptions to find relevant matches based on your search criteria.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- NPM or Yarn

### Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your `.env` file with OpenAI API credentials:
   ```
   OPENAI_API_KEY=your-api-key-here
   AI_API_BASE=https://api.openai.com/v1
   AI_MODEL=gpt-4o-mini  # or another model you prefer
   ```
4. Start the server:
   ```bash
   node mcp-server.js
   ```
   The server will run on port 3000 by default (can be changed with the PORT env variable).

## Using with Claude Desktop

To use this server with Claude Desktop:

1. Enable Developer Mode in Claude Desktop settings
2. Open settings and click "Developer" → "Edit Config"
3. Add the following to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "people_filter": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

4. Restart Claude Desktop
5. You should now see the MCP tools available in your conversation

## Available Tools

### upload_csv

Uploads a CSV file for processing.

Parameters:
- `file_content`: Base64 encoded content of the CSV file
- `file_name`: Name of the CSV file

Returns:
- `file_path`: Path to the uploaded CSV file
- `row_count`: Number of rows in the CSV file

### filter_people

Filters people from a CSV file based on a search description.

Parameters:
- `input_file`: Path to the input CSV file
- `search_description`: Description of the person(s) you are looking for
- `output_file`: (Optional) Path for the output CSV file (default: "filtered_output.csv")

Returns:
- `matchCount`: Number of matching people found
- `outputPath`: Path to the output CSV file
- `results`: Preview of the first 10 results

### get_server_info

Gets information about this MCP server.

Parameters: None

Returns:
- `name`: Name of the MCP server
- `version`: Version of the MCP server
- `description`: Description of the MCP server

## CSV Format Requirements

The input CSV should contain people data with at least the following columns:
- `name`: The person's name
- `title`: The person's job title

Additional columns are preserved in the output.

## Example Usage with Claude

Here's an example of how to use this MCP server with Claude:

1. Upload a CSV file:
   ```
   Please upload a CSV file with people data so I can help you filter through it.
   ```

2. Filter people based on a description:
   ```
   Find me all marketing directors with experience in digital transformation.
   ```

3. Get more specific with filtering:
   ```
   From the previous results, find people who have been in their role for less than 2 years.
   ```

## How It Works

The server uses a two-step filtering process:
1. **Title Filtering**: Uses AI to extract relevant title keywords from your search description and finds people with matching job titles.
2. **AI Verification** (optional): Further refines results by having AI verify if each person is a good match for your search.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 