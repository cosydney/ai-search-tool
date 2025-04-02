const fs = require('fs');
const csv = require('csv-parse');
const { createObjectCsvWriter } = require('csv-writer');
require('dotenv').config();
const { TitleFilterAgent, AIMatchVerificationAgent } = require('./agents');


// Main search function
async function searchPeople(inputFile, searchDescription, outputFile = []) {
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

        // Agent 2: AI verification
        // const isMatch = await verificationAgent.verifyMatch(person, searchDescription);
        // if (isMatch) {
            results.push({
                ...person,
            });
        // }
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
}

// Example usage
const inputFile = process.argv[2] || 'input.csv';
const searchDescription = process.argv[3] || 'Looking for a person responsible for conversion optimization, (CRO, Conversion Optimization, UX, Digital Conversion, Marketing, Product) and join to team recently (up 6 month)';
const outputFile = process.argv[4] || 'output.csv';



searchPeople(inputFile, searchDescription, outputFile).catch(console.error); 