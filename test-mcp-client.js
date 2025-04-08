const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Configuration
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';
const CSV_FILE_PATH = process.argv[2] || 'input.csv';
const SEARCH_DESCRIPTION = process.argv[3] || 'Looking for marketing directors with digital transformation experience';

// Helper function to make MCP requests
async function callMCP(tool, parameters = {}) {
  const requestId = Math.random().toString(36).substring(2, 10);
  
  const request = {
    apiVersion: '1.0',
    requestId,
    tool,
    parameters
  };
  
  console.log(`\n----- Calling MCP tool: ${tool} -----`);
  console.log('Request:', JSON.stringify(request, null, 2));
  
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const result = await response.json();
  console.log('Response:', JSON.stringify(result, null, 2));
  return result;
}

// Main function to demonstrate MCP server usage
async function testMCPServer() {
  console.log('CSV People Filter MCP Server Test Client');
  console.log('=======================================');
  
  try {
    // Step 1: Get server info
    console.log('\n📡 Getting server info...');
    const serverInfo = await callMCP('get_server_info');
    console.log(`\n✅ Connected to: ${serverInfo.result.name} (v${serverInfo.result.version})`);
    console.log(`Description: ${serverInfo.result.description}`);
    
    // Step 2: Discover available tools
    console.log('\n🔍 Discovering available tools...');
    const toolsInfo = await callMCP('discover_tools');
    console.log(`\n✅ Found ${toolsInfo.tools.length} available tools:`);
    toolsInfo.tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });
    
    // ************ TODO UNCOMMENT THIS ************
    // // Step 3: Upload CSV file
    // console.log(`\n📤 Uploading CSV file: ${CSV_FILE_PATH}...`);
    // const fileContent = fs.readFileSync(CSV_FILE_PATH, { encoding: 'base64' });
    // const fileName = path.basename(CSV_FILE_PATH);
    
    // const uploadResult = await callMCP('upload_csv', {
    //   file_content: fileContent,
    //   file_name: fileName
    // });
    
    // console.log(`\n✅ CSV file uploaded successfully!`);
    // console.log(`File path: ${uploadResult.result.file_key}`);
    // console.log(`Row count: ${uploadResult.result.row_count}`);
    // ************ TODO UNCOMMENT THIS ************

    // Step 4: Filter people based on search description
    console.log(`\n🔎 Filtering people with description: "${SEARCH_DESCRIPTION}"...`);

    const filterResult = await callMCP('filter_people', {
      input_file_key: "uploads/1744087566946-input.csv" || uploadResult.result.file_key,
      search_description: SEARCH_DESCRIPTION,
      output_file: 'test_output.csv'
    });
    
    console.log(`\n✅ Filtering complete!`);
    console.log(`Found ${filterResult.result.matchCount} matching people`);
    console.log(`Results saved to: ${filterResult.result.outputPath}`);
    
    if (filterResult.result.results.length > 0) {
      console.log('\n📋 Preview of results:');
      console.table(filterResult.result.results);
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Run the test
testMCPServer(); 