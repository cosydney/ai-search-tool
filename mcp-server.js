const fs = require('fs');
const path = require('path');
const http = require('http');
const csv = require('csv-parse');
const { createObjectCsvWriter } = require('csv-writer');
const { TitleFilterAgent, AIMatchVerificationAgent } = require('./agents');
require('dotenv').config();

// Environment variables
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const AI_API_KEY = process.env.OPENAI_API_KEY;
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo-instruct';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Main search function (from index.js with modifications)
async function searchPeople(inputFile, searchDescription, outputFile) {
  const titleAgent = new TitleFilterAgent();
  const verificationAgent = new AIMatchVerificationAgent();

  const people = [];

  // Read input CSV
  await new Promise((resolve, reject) => {
    fs.createReadStream(inputFile)
      .pipe(csv.parse({ columns: true, skip_empty_lines: true }))
      .on('data', (data) => people.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Processing ${people.length} people...`);

  // Initialize the title agent with the search description and people data
  await titleAgent.initialize(searchDescription, people);

  const results = [];

  // Process each person through the agents
  for (const person of people) {
    // Agent 1: Title filtering
    if (!titleAgent.filterByTitle(person)) {
      continue;
    }

    // Agent 2: AI verification (commented out for performance)
    const isMatch = await verificationAgent.verifyMatch(person, searchDescription);
    if (isMatch) {
    results.push({
      ...person,
    });
    }
  }

  // Create ordered header with specific columns first, then all others
  const orderedHeader = [];
  
  // Add specific columns first if they exist in the data
  const priorityColumns = ['name', 'title', 'match_rating'];
  for (const column of priorityColumns) {
    if (results.length > 0 && column in results[0]) {
      orderedHeader.push({
        id: column,
        title: column.split(/(?=[A-Z])/).join(' ').replace(/^./, str => str.toUpperCase())
      });
    }
  }

  // Add all other columns
  if (results.length > 0) {
    const allKeys = Object.keys(results[0]);
    const remainingKeys = allKeys.filter(key => !priorityColumns.includes(key));
    
    remainingKeys.forEach(key => {
      orderedHeader.push({
        id: key,
        title: key.split(/(?=[A-Z])/).join(' ').replace(/^./, str => str.toUpperCase())
      });
    });
  }

  // Write results to CSV
  const csvWriter = createObjectCsvWriter({
    path: outputFile,
    header: orderedHeader
  });

  await csvWriter.writeRecords(results);
  console.log(`Search complete. Found ${results.length} matches. Results saved to ${outputFile}`);
  
  return {
    matchCount: results.length,
    outputPath: outputFile,
    results: results.slice(0, 10) // Return first 10 results for preview
  };
}

// Create server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle POST requests to /mcp
  if (req.method === 'POST' && req.url === '/mcp') {
    try {
      // Parse request body
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());

      // Handle MCP request
      const response = await handleMCPRequest(body);

      // Send response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Handle MCP requests
async function handleMCPRequest(request) {
  const { tool, parameters } = request;
  
  // Common response structure
  const response = {
    apiVersion: '1.0',
    requestId: request.requestId
  };
  
  // Tool discovery
  if (tool === 'discover_tools') {
    response.tools = [
      {
        name: 'upload_csv',
        description: 'Upload a CSV file for processing',
        parameters: {
          type: 'object',
          properties: {
            file_content: {
              type: 'string',
              description: 'Base64 encoded content of the CSV file'
            },
            file_name: {
              type: 'string',
              description: 'Name of the CSV file'
            }
          },
          required: ['file_content', 'file_name']
        },
        returns: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the uploaded CSV file'
            },
            row_count: {
              type: 'number',
              description: 'Number of rows in the CSV file'
            }
          }
        }
      },
      {
        name: 'filter_people',
        description: 'Filter people from a CSV file based on a search description',
        parameters: {
          type: 'object',
          properties: {
            input_file: {
              type: 'string',
              description: 'Path to the input CSV file'
            },
            search_description: {
              type: 'string',
              description: 'Description of the person(s) you are looking for'
            },
            output_file: {
              type: 'string',
              description: 'Path for the output CSV file',
              default: 'filtered_output.csv'
            }
          },
          required: ['input_file', 'search_description']
        },
        returns: {
          type: 'object',
          properties: {
            matchCount: {
              type: 'number',
              description: 'Number of matching people found'
            },
            outputPath: {
              type: 'string',
              description: 'Path to the output CSV file'
            },
            results: {
              type: 'array',
              description: 'Preview of the first 10 results'
            }
          }
        }
      },
      {
        name: 'get_server_info',
        description: 'Get information about this MCP server',
        parameters: {
          type: 'object',
          properties: {}
        },
        returns: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the MCP server'
            },
            version: {
              type: 'string',
              description: 'Version of the MCP server'
            },
            description: {
              type: 'string',
              description: 'Description of the MCP server'
            }
          }
        }
      }
    ];
  } 
  // Tool implementation: upload_csv
  else if (tool === 'upload_csv') {
    const { file_content, file_name } = parameters;
    
    if (!file_content || !file_name) {
      throw new Error('Missing required parameters: file_content and file_name are required');
    }
    
    // Decode base64 content
    const fileBuffer = Buffer.from(file_content, 'base64');
    const filePath = path.join(UPLOADS_DIR, file_name);
    
    // Write file to disk
    fs.writeFileSync(filePath, fileBuffer);
    
    // Parse CSV to count rows
    const parser = csv.parse({ columns: true, skip_empty_lines: true });
    let rowCount = 0;
    
    fs.createReadStream(filePath)
      .pipe(parser)
      .on('data', () => rowCount++);
    
    // Wait for parsing to complete
    await new Promise((resolve) => {
      parser.on('end', resolve);
    });
    
    response.result = {
      file_path: filePath,
      row_count: rowCount
    };
  } 
  // Tool implementation: filter_people
  else if (tool === 'filter_people') {
    const { input_file, search_description, output_file = 'filtered_output.csv' } = parameters;
    
    if (!input_file || !search_description) {
      throw new Error('Missing required parameters: input_file and search_description are required');
    }
    
    // Generate a unique output file path if not provided
    const outputPath = output_file.startsWith('/') 
      ? output_file 
      : path.join(UPLOADS_DIR, output_file);
    
    // Execute search
    const result = await searchPeople(input_file, search_description, outputPath);
    
    response.result = result;
  } 
  // Tool implementation: get_server_info
  else if (tool === 'get_server_info') {
    response.result = {
      name: 'CSV People Filter MCP Server',
      version: '1.0.0',
      description: 'An MCP server that enables filtering people from CSV files based on search descriptions using AI-powered matching'
    };
  } 
  // Unknown tool
  else {
    throw new Error(`Unknown tool: ${tool}`);
  }
  
  return response;
}

// Export for Vercel
module.exports = server;

// Only start server if not in Vercel environment
if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`MCP Server running on http://localhost:${PORT}/mcp`);
    console.log(`Set MCP_SERVER_URL=http://localhost:${PORT}/mcp in your client configuration`);
  });
} 