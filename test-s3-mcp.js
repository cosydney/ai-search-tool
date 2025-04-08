const fs = require('fs');
const path = require('path');

// Test data
const testCsvContent = `name,title,experience
John Doe,Software Engineer,5 years
Jane Smith,Product Manager,3 years
Alice Johnson,Data Scientist,4 years`;

// Create a test CSV file
const testFilePath = path.join(__dirname, 'test-input.csv');
fs.writeFileSync(testFilePath, testCsvContent);

// Convert file to base64
const fileContent = fs.readFileSync(testFilePath).toString('base64');

// MCP request for uploading CSV
const uploadRequest = {
  apiVersion: '1.0',
  requestId: 'test-upload-' + Date.now(),
  tool: 'upload_csv',
  parameters: {
    file_content: fileContent,
    file_name: 'test-input.csv'
  }
};

// MCP request for filtering people
const filterRequest = {
  apiVersion: '1.0',
  requestId: 'test-filter-' + Date.now(),
  tool: 'filter_people',
  parameters: {
    input_file_key: '', // Will be filled after upload
    search_description: 'Find software engineers with more than 3 years of experience',
    output_file_name: 'test-output.csv'
  }
};

// Function to make MCP requests
async function makeMCPRequest(request) {
  const response = await fetch('http://localhost:3000/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  return await response.json();
}

// Run the test
async function runTest() {
  try {
    console.log('1. Testing CSV upload...');
    const uploadResponse = await makeMCPRequest(uploadRequest);
    console.log('Upload response:', uploadResponse);
    
    if (uploadResponse.result && uploadResponse.result.file_key) {
      console.log('\n2. Testing people filtering...');
      filterRequest.parameters.input_file_key = uploadResponse.result.file_key;
      const filterResponse = await makeMCPRequest(filterRequest);
      console.log('Filter response:', filterResponse);
    }
    
    // Clean up test file
    fs.unlinkSync(testFilePath);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Start the test
runTest(); 