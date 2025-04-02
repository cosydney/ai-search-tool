const fs = require('fs');
const csv = require('csv-parse');
const { createObjectCsvWriter } = require('csv-writer');
const TitleFilterAgent = require('./TitleFilterAgent');
const SemanticSearchAgent = require('./SemanticSearchAgent');
const AIMatchVerificationAgent = require('./AIMatchVerificationAgent');

// Main search function
async function searchPeople(inputFile, searchDescription, outputFile) {
    const titleAgent = new TitleFilterAgent();
    const semanticAgent = new SemanticSearchAgent();
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
    await titleAgent.initializeTitles(searchDescription, people);

    const results = [];

    // Process each person through the agents
    for (const person of people) {
        // Agent 1: Title filtering
        if (!titleAgent.filterByTitle(person)) {
            continue;
        }

        // Agent 2: Semantic search
        const rating = await semanticAgent.ratePerson(person, searchDescription);
        if (rating < 50) { // Adjust threshold as needed
            continue;
        }

        // Agent 3: AI verification
        const isMatch = await verificationAgent.verifyMatch(person, searchDescription);
        if (isMatch) {
            results.push({
                ...person,
                match_rating: rating
            });
        }
    }

    // Write results to CSV
    const csvWriter = createObjectCsvWriter({
        path: outputFile,
        header: [
            { id: 'name', title: 'Name' },
            { id: 'title', title: 'Title' },
            { id: 'experience', title: 'Experience' },
            { id: 'match_rating', title: 'Match Rating' }
        ]
    });

    await csvWriter.writeRecords(results);
    console.log(`Search complete. Found ${results.length} matches. Results saved to ${outputFile}`);
}

// Example usage
const inputFile = process.argv[2] || 'input.csv';
const searchDescription = process.argv[3] || 'Looking for a person responsible for conversion optimization, (CRO, Conversion Optimization, UX, Digital Conversion, Marketing, Product) and join to team recently (up 6 month)';
const outputFile = process.argv[4] || 'output.csv';

searchPeople(inputFile, searchDescription, outputFile).catch(console.error); 